// ── Shopify → snapshot ────────────────────────────────────────────────────
// Turns a raw Shopify extract (collected read-only through the Shopify MCP:
// Admin GraphQL + ShopifyQL) into a ParkData snapshot the terminal imports.
// Pure and deterministic: same extract in, same snapshot out. Every value is
// either measured in Shopify or explicitly derived here, and anything the
// extract can't support is left empty and explained in meta.notes —
// never filled with a guess.

import type { Channel, DayPoint, Order, ParkData, Product } from './types';

export interface ShopifyVariant {
  title: string;
  qty: number;              // Shopify inventoryQuantity (can be negative)
  price: number;
  unitCost: number | null;  // inventoryItem.unitCost; null when not recorded
}

export interface ShopifyProduct {
  id: string;               // gid://shopify/Product/…
  title: string;
  productType: string;
  totalInventory: number;   // Shopify's own total, used as a transcription checksum
  variants: ShopifyVariant[];
}

export interface ShopifyOrder {
  name: string;
  createdAt: string;        // ISO
  total: number;            // current total price, shop currency
  customerOrderCount: number | null;
  channel: string | null;
  items: { title: string; variant: string | null; qty: number }[];
}

export interface ShopifyExtract {
  shop: { name: string; domain: string; currencyCode: string; timezone: string; plan: string };
  extractedAt: string;      // ISO — when the queries ran
  products: ShopifyProduct[];
  /** ShopifyQL daily rows: sales net of discounts and returns, plus sessions. */
  daily: { date: string; orders: number; netSales: number; sessions: number | null }[];
  /** ShopifyQL net_items_sold by product_title for three windows. */
  unitsSold365d: Record<string, number>;
  unitsSold7d: Record<string, number>;
  unitsSoldPrev7d: Record<string, number>;
  /** ShopifyQL orders/net_sales by sales_channel, last 30 days. */
  channels30d: { channel: string; orders: number; netSales: number }[];
  recentOrders: ShopifyOrder[];
  /** ShopifyQL returning_customer_rate, last 90 days (0..1). */
  returningCustomerRate90d: number | null;
}

// Shopify reports an abbreviation ("EDT"); map the ones we can to IANA zones.
const TZ: Record<string, string> = {
  EDT: 'America/New_York', EST: 'America/New_York',
  CDT: 'America/Chicago', CST: 'America/Chicago',
  MDT: 'America/Denver', MST: 'America/Denver',
  PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles',
  UTC: 'UTC', GMT: 'UTC',
};

const productKey = (gid: string) => `shp-${gid.split('/').pop()}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Most common value; ties go to the highest (list price for a product). */
function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function list(names: string[], max = 6): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

export function buildShopifySnapshot(x: ShopifyExtract): ParkData {
  if (x.shop.currencyCode !== 'USD') {
    // The terminal formats money as $ and does no conversion.
    throw new Error(`Shop currency is ${x.shop.currencyCode}; the terminal only handles USD without a conversion policy.`);
  }
  const notes: string[] = [];
  const tz = TZ[x.shop.timezone.toUpperCase()] ?? 'UTC';
  if (!TZ[x.shop.timezone.toUpperCase()]) notes.push(`Shop timezone "${x.shop.timezone}" not recognised; order times shown in UTC.`);

  notes.push(`Sales are Shopify net sales (after discounts and returns, before shipping and tax), USD, store timezone ${tz}.`);

  // ── products ────────────────────────────────────────────────────────────
  const negative: string[] = [];
  const noCost: string[] = [];
  const costAbovePrice: string[] = [];
  const mixedPrice: string[] = [];
  const checksum: string[] = [];
  const titles = new Set(x.products.map((p) => p.title));

  const products: Product[] = x.products.map((p) => {
    const vsum = p.variants.reduce((s, v) => s + v.qty, 0);
    if (vsum !== p.totalInventory) checksum.push(p.title);
    if (p.variants.some((v) => v.qty < 0)) negative.push(p.title);
    const prices = p.variants.map((v) => v.price);
    const price = mode(prices);
    if (new Set(prices).size > 1) mixedPrice.push(p.title);
    const costs = p.variants.map((v) => v.unitCost).filter((c): c is number => c !== null);
    const unitCost = costs.length === p.variants.length ? round2(costs.reduce((s, c) => s + c, 0) / costs.length) : null;
    if (unitCost === null) noCost.push(p.title);
    else if (price > 0 && unitCost > price) costAbovePrice.push(`${p.title} ($${unitCost} cost vs $${price} price)`);
    const stock = p.variants.reduce((s, v) => s + Math.max(0, v.qty), 0);
    const soldTotal = Math.max(0, x.unitsSold365d[p.title] ?? 0);
    return {
      id: productKey(p.id),
      name: p.title,
      drop: p.productType || 'UNCATEGORISED',
      price,
      unitCost,
      stock,
      startInventory: soldTotal + stock,
      sold7d: Math.max(0, x.unitsSold7d[p.title] ?? 0),
      soldPrev7d: Math.max(0, x.unitsSoldPrev7d[p.title] ?? 0),
      soldTotal,
      published: true,
    };
  });

  if (checksum.length) {
    throw new Error(`Variant quantities don't add up to Shopify's total for: ${checksum.join(', ')}. Re-extract before importing.`);
  }
  notes.push('Units sold = last 365 days (Shopify net items sold); "start" stock = units sold + current stock. Product "drop" shows the Shopify product type until drops are recorded.');
  if (negative.length) notes.push(`${negative.length} products have negative stock in Shopify (sold while untracked or oversold) — counted as 0 here: ${list(negative)}.`);
  if (noCost.length) notes.push(`${noCost.length} products have no unit cost in Shopify — left out of stock-at-cost and margin: ${list(noCost)}.`);
  if (costAbovePrice.length) notes.push(`Unit cost is above price for: ${list(costAbovePrice, 3)} — check the cost in Shopify.`);
  if (mixedPrice.length) notes.push(`Variant prices differ for ${list(mixedPrice)}; the most common price is shown.`);
  const unmatched = Object.entries(x.unitsSold365d).filter(([t, n]) => !titles.has(t) && n !== 0).map(([t, n]) => `${t || '(untitled line)'}: ${n}`);
  if (unmatched.length) notes.push(`Sales lines not matched to an active product (archived, renamed or custom items): ${list(unmatched)}.`);
  const netReturns = Object.entries(x.unitsSold365d).filter(([t, n]) => titles.has(t) && n < 0).map(([t]) => t);
  if (netReturns.length) notes.push(`Returns exceeded sales over 365 days for ${list(netReturns)} — shown as 0 sold.`);

  // ── margin (list-price estimate) ───────────────────────────────────────
  let rev = 0;
  let cost = 0;
  for (const p of products) {
    if (p.unitCost === null || p.price <= 0 || p.soldTotal <= 0) continue;
    rev += p.price * p.soldTotal;
    cost += p.unitCost * p.soldTotal;
  }
  if (rev <= 0) throw new Error('No sold products with both price and unit cost; cannot estimate gross margin.');
  const grossMargin = round2((rev - cost) / rev);
  notes.push(`Gross margin ${Math.round(grossMargin * 100)}% is a list-price estimate (price minus Shopify unit cost, weighted by 365-day units) — before discounts, fees and shipping.`);

  // ── days ───────────────────────────────────────────────────────────────
  const days: DayPoint[] = x.daily.map((d) => ({
    date: d.date,
    revenue: round2(d.netSales),
    orders: d.orders,
    ...(d.sessions !== null ? { sessions: d.sessions } : {}),
  }));
  notes.push('Ad spend is not included: Meta ads are not connected.');

  // ── channels ───────────────────────────────────────────────────────────
  const online = x.channels30d.find((c) => c.channel === 'Online Store');
  const channels: Channel[] = [{
    name: 'ONLINE STORE',
    location: x.shop.domain.toUpperCase(),
    type: 'ONLINE',
    revenue: round2(online?.netSales ?? 0),
    orders: online?.orders ?? 0,
    stock: [],
  }];
  const others = x.channels30d.filter((c) => c.channel !== 'Online Store' && (c.orders > 0 || c.netSales !== 0));
  if (others.length) {
    notes.push(`Other Shopify channels in the last 30 days (not shown as locations): ${others.map((c) => `${c.channel} ${c.orders} order${c.orders === 1 ? '' : 's'} / $${round2(c.netSales)}`).join('; ')}.`);
  }
  notes.push('Stockist and consignment stock are not in Shopify, so partner shelves are empty until those records exist.');

  // ── orders ─────────────────────────────────────────────────────────────
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const listPrice = new Map(products.map((p) => [p.name, p.price]));
  const suspicious: string[] = [];
  const orders: Order[] = x.recentOrders.map((o) => {
    const units = o.items.reduce((s, i) => s + i.qty, 0);
    const list = o.items.reduce((s, i) => s + (listPrice.get(i.title) ?? 0) * i.qty, 0);
    if (units >= 3 && list > 0 && o.total < list * 0.25) {
      suspicious.push(`${o.name} (${units} units, $${round2(o.total)} vs ~$${round2(list)} at list)`);
    }
    return {
      id: o.name,
      time: fmt.format(new Date(o.createdAt)).replace(',', ''),
      label: o.items.map((i) => `${i.title}${i.variant ? ` / ${i.variant}` : ''}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(' + '),
      value: round2(o.total),
      returning: (o.customerOrderCount ?? 0) > 1,
    };
  });
  if (suspicious.length) {
    notes.push(`Orders far below list price — possibly wholesale, consignment or gifts recorded in Shopify, and counted in units sold: ${list(suspicious, 3)}.`);
  }

  return {
    products,
    pipeline: [],
    channels,
    orders,
    campaigns: [],
    days,
    quests: [],
    costs: [],
    bankBalance: 0,
    growthTargetPct: 25,
    wholesalePct: 0.6,
    nextDrop: null,
    annualBudget: 0,
    ...(x.returningCustomerRate90d !== null ? { repeatRate: round2(x.returningCustomerRate90d) } : {}),
    grossMargin,
    targetRoas: 3,
    meta: {
      coverageStart: `${x.daily[0]?.date ?? x.extractedAt.slice(0, 10)}T00:00:00`,
      coverageEnd: x.extractedAt,
      extractedAt: x.extractedAt,
      sources: [{ label: 'Shopify', extractedAt: x.extractedAt }],
      notes,
    },
  };
}

/**
 * The snapshot as written to park-data.json: terminal-owned fields (bank,
 * costs, planning inputs) are dropped so an import never overwrites what the
 * user entered, and the sync never invents them.
 */
export function toImportFile(d: ParkData): Omit<ParkData, 'bankBalance' | 'costs' | 'growthTargetPct' | 'wholesalePct' | 'nextDrop' | 'annualBudget'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bankBalance, costs, growthTargetPct, wholesalePct, nextDrop, annualBudget, ...rest } = d;
  return rest;
}
