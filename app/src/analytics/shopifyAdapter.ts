// ── Shopify adapter: raw read-only extracts → AnalyticsSnapshot ───────────
// Input is exactly what the connector returned (ShopifyQL rows as string
// maps, Admin GraphQL productVariants nodes). This module only normalizes:
// parses money exactly into minor units, keys everything by stable numeric
// ids, records day coverage, and de-duplicates repeated rows. Conflicting
// duplicates are an error — never silently merged.

import type { AnalyticsSnapshot, CustomerWindow, DailyChannelRow, InventoryLevel, VariantDailyRow, VariantRecord } from './types';
import { parseMinor } from './money';
import { eachDay } from './period';

export interface RawVariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  requiresComponents?: boolean;
  selectedOptions: { name: string; value: string }[];
  product: { id: string; title: string; productType: string; status: string; createdAt: string; publishedAt: string | null; tracksInventory?: boolean };
  inventoryItem: {
    id: string;
    tracked: boolean;
    unitCost: { amount: string; currencyCode: string } | null;
    inventoryLevels: { nodes: { location: { id: string; name: string }; quantities: { name: string; quantity: number }[] }[] };
  };
}

export interface RawShopifyAnalytics {
  shop: { name: string; domain: string; currencyCode: string; timezone: string };
  extractedAt: string;
  inventoryAsOf: string;
  salesRange: { from: string; to: string };
  dailyRows: Record<string, string>[];
  variantDailyRows: Record<string, string>[];
  variantNodes: RawVariantNode[];
  customerWindows: CustomerWindow[];
}

// Shopify reports a zone abbreviation; map the unambiguous ones to IANA.
const TZ: Record<string, string> = {
  EDT: 'America/New_York', EST: 'America/New_York', CDT: 'America/Chicago', CST: 'America/Chicago',
  MDT: 'America/Denver', MST: 'America/Denver', PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles',
  UTC: 'UTC', GMT: 'UTC',
};

export function resolveTimezone(tz: string): string | null {
  if (TZ[tz]) return TZ[tz];
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz.includes('/') || tz === 'UTC' ? tz : null;
  } catch {
    return null;
  }
}

const gidNum = (gid: string) => gid.replace(/^gid:\/\/shopify\/\w+\//, '');
const int = (v: string | undefined, field: string): number => {
  const n = Number(v ?? '0');
  if (!Number.isInteger(n)) throw new Error(`${field}: expected an integer, got "${v}"`);
  return n;
};

function dedupe<T>(rows: T[], key: (r: T) => string, label: string, notes: string[]): T[] {
  const seen = new Map<string, string>();
  const out: T[] = [];
  let dupes = 0;
  for (const r of rows) {
    const k = key(r);
    const body = JSON.stringify(r);
    const prev = seen.get(k);
    if (prev === undefined) { seen.set(k, body); out.push(r); continue; }
    if (prev !== body) throw new Error(`${label}: two different rows for ${k} — re-extract instead of guessing which is right.`);
    dupes++;
  }
  if (dupes) notes.push(`${dupes} repeated ${label} row${dupes === 1 ? '' : 's'} dropped (identical duplicates).`);
  return out;
}

export function buildAnalytics(raw: RawShopifyAnalytics): AnalyticsSnapshot {
  const currency = raw.shop.currencyCode;
  const notes: string[] = [];
  const timezone = resolveTimezone(raw.shop.timezone);
  if (!timezone) notes.push(`Business timezone "${raw.shop.timezone}" from Shopify could not be resolved to an IANA zone — configuration gap; reporting periods are unavailable until it is set.`);

  // ── daily by channel ──
  const covered = new Set<string>();
  const daily: DailyChannelRow[] = [];
  for (const r of raw.dailyRows) {
    const date = r.day;
    covered.add(date);
    if (!r.sales_channel) continue; // a covered day with no sales
    daily.push({
      date, channel: r.sales_channel,
      orders: int(r.orders, 'orders'),
      grossSales: parseMinor(r.gross_sales, currency) ?? 0,
      discounts: parseMinor(r.discounts, currency) ?? 0,
      returns: parseMinor(r.returns, currency) ?? 0,
      netSales: parseMinor(r.net_sales, currency) ?? 0,
      cogs: parseMinor(r.cost_of_goods_sold, currency),
      netSalesWithCost: parseMinor(r.net_sales_with_cost_recorded, currency) ?? 0,
      qtyOrdered: int(r.quantity_ordered, 'quantity_ordered'),
      qtyReturned: int(r.quantity_returned, 'quantity_returned'),
      netItems: int(r.net_items_sold, 'net_items_sold'),
    });
  }
  const dailyRows = dedupe(daily, (r) => `${r.date}|${r.channel}`, 'daily sales', notes);
  const missing = eachDay(raw.salesRange).filter((d) => !covered.has(d));
  if (missing.length) notes.push(`${missing.length} day${missing.length === 1 ? '' : 's'} in the requested range were not returned and are treated as unknown.`);

  // ── variant daily ──
  const vd: VariantDailyRow[] = [];
  for (const r of raw.variantDailyRows) {
    if (!r.product_variant_id) continue;
    vd.push({
      date: r.day, channel: r.sales_channel, productId: r.product_id, variantId: r.product_variant_id,
      grossSales: parseMinor(r.gross_sales, currency) ?? 0,
      discounts: parseMinor(r.discounts, currency) ?? 0,
      returns: parseMinor(r.returns, currency) ?? 0,
      netSales: parseMinor(r.net_sales, currency) ?? 0,
      cogs: parseMinor(r.cost_of_goods_sold, currency),
      netSalesWithCost: parseMinor(r.net_sales_with_cost_recorded, currency) ?? 0,
      qtyOrdered: int(r.quantity_ordered, 'quantity_ordered'),
      qtyReturned: int(r.quantity_returned, 'quantity_returned'),
      netItems: int(r.net_items_sold, 'net_items_sold'),
    });
  }
  const variantDaily = dedupe(vd, (r) => `${r.date}|${r.channel}|${r.variantId}`, 'variant sales', notes);

  // reconcile: variant rows must add up to the daily channel totals
  const sumBy = (rows: { date: string; channel: string; netSales: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.date}|${r.channel}`, (m.get(`${r.date}|${r.channel}`) ?? 0) + r.netSales);
    return m;
  };
  const dTot = sumBy(dailyRows);
  const vTot = sumBy(variantDaily);
  const off = [...new Set([...dTot.keys(), ...vTot.keys()])].filter((k) => (dTot.get(k) ?? 0) !== (vTot.get(k) ?? 0));
  if (off.length) notes.push(`Variant-level net sales differ from channel totals on ${off.length} day-channel(s) (${off.slice(0, 3).join(', ')}) — likely lines without a variant (custom items). Totals use the channel figures.`);

  // ── variants + inventory ──
  const nodes = dedupe(raw.variantNodes, (n) => n.id, 'catalog variant', notes);
  const noCost: string[] = [];
  const skuCount = new Map<string, number>();
  const variants: VariantRecord[] = nodes.map((n) => {
    const levels: InventoryLevel[] = n.inventoryItem.inventoryLevels.nodes.map((l) => {
      const q = (name: string) => l.quantities.find((x) => x.name === name)?.quantity ?? 0;
      return {
        locationId: gidNum(l.location.id), locationName: l.location.name,
        available: q('available'), onHand: q('on_hand'), committed: q('committed'), incoming: q('incoming'),
        reserved: q('reserved'), unavailable: q('damaged') + q('safety_stock') + q('quality_control'),
      };
    });
    const cost = n.inventoryItem.unitCost;
    if (cost && cost.currencyCode !== currency) throw new Error(`Unit cost for ${n.product.title} is in ${cost.currencyCode}, shop reports in ${currency}; supply a dated FX rate before importing.`);
    if (!cost) noCost.push(`${n.product.title} / ${n.title}`);
    if (n.sku) skuCount.set(n.sku, (skuCount.get(n.sku) ?? 0) + 1);
    return {
      variantId: gidNum(n.id), productId: gidNum(n.product.id), productTitle: n.product.title, productType: n.product.productType || 'Uncategorised',
      variantTitle: n.title, sku: n.sku || null,
      options: n.selectedOptions.filter((o) => !(o.name === 'Title' && o.value === 'Default Title')),
      price: parseMinor(n.price, currency) ?? 0,
      unitCost: cost ? parseMinor(cost.amount, currency) : null,
      productCreatedAt: n.product.createdAt, productPublishedAt: n.product.publishedAt,
      tracked: n.inventoryItem.tracked, isBundle: !!n.requiresComponents, inventory: levels,
    };
  });
  if (noCost.length) notes.push(`${noCost.length} variants have no unit cost in Shopify; their sales are excluded from gross profit (shown as cost coverage).`);
  const dupSkus = [...skuCount].filter(([, c]) => c > 1).map(([s]) => s);
  if (dupSkus.length) notes.push(`Duplicate SKUs (joins use variant ids, not SKUs): ${dupSkus.join(', ')}.`);
  const noSku = variants.filter((v) => !v.sku).length;
  if (noSku) notes.push(`${noSku} variants have no SKU; they are identified by Shopify variant id.`);
  const oversold = variants.filter((v) => v.inventory.reduce((s, l) => s + l.available, 0) < 0).length;
  if (oversold) notes.push(`${oversold} variants show negative available stock (oversold or adjusted); shown as 0 sellable with "oversold by N".`);

  return {
    version: 1, source: 'shopify', shop: raw.shop.domain, currency, timezone,
    extractedAt: raw.extractedAt, inventoryAsOf: raw.inventoryAsOf,
    salesCoverage: { from: raw.salesRange.from, to: raw.salesRange.to, missing },
    daily: dailyRows, variantDaily, variants, customers: raw.customerWindows, notes,
  };
}
