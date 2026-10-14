// ── Bridge: analytics extract → the original ShopifyExtract ───────────────
// The older desks (inventory list, orders tape, alerts, forecast) read the
// ShopifyExtract shape. Deriving it from the same raw read keeps every desk on
// one extraction time instead of mixing two syncs. Product titles are only
// used as keys inside this bridge, after checking they're unique.

import type { ShopifyExtract, ShopifyOrder } from '../game/shopify';
import type { AnalyticsSnapshot } from './types';
import type { RawShopifyAnalytics } from './shopifyAdapter';
import { addDays, eachDay, inRange } from './period';

export interface BridgeExtras {
  sessions: Record<string, number>;           // YYYY-MM-DD → sessions (online store)
  recentOrders: ShopifyOrder[];
  returningCustomerRate90d: number | null;
  plan: string;
}

const major = (minor: number) => minor / 100;

export function legacyExtract(raw: RawShopifyAnalytics, a: AnalyticsSnapshot, extra: BridgeExtras): ShopifyExtract {
  if (a.currency !== 'USD') throw new Error('The legacy desks assume a 2-decimal currency; extend the bridge before using another currency.');
  const titleById = new Map<string, string>();
  for (const v of a.variants) titleById.set(v.productId, v.productTitle);
  const titles = [...titleById.values()];
  const dupTitle = titles.find((t, i) => titles.indexOf(t) !== i);
  if (dupTitle) throw new Error(`Two products share the title "${dupTitle}"; the legacy desks key by title.`);

  const last = a.salesCoverage.to;
  const w7 = { from: addDays(last, -6), to: last };
  const p7 = { from: addDays(last, -13), to: addDays(last, -7) };
  const w30 = { from: addDays(last, -29), to: last };
  const w60 = { from: addDays(last, -59), to: last };
  const unitsBy = (range: { from: string; to: string } | null) => {
    const out: Record<string, number> = {};
    for (const r of a.variantDaily) {
      if (range && !inRange(r.date, range)) continue;
      const t = titleById.get(r.productId) ?? `(not in catalog: product ${r.productId})`;
      out[t] = (out[t] ?? 0) + r.netItems;
    }
    return out;
  };

  const products = new Map<string, ShopifyExtract['products'][number]>();
  for (const n of raw.variantNodes) {
    const pid = n.product.id;
    const qty = n.inventoryItem.inventoryLevels.nodes.reduce((s, l) => s + (l.quantities.find((q) => q.name === 'available')?.quantity ?? 0), 0);
    let p = products.get(pid);
    if (!p) {
      p = { id: pid, title: n.product.title, productType: n.product.productType, totalInventory: 0, tracksInventory: n.product.tracksInventory, variants: [] };
      products.set(pid, p);
    }
    p.variants.push({ title: n.title, qty, price: Number(n.price), unitCost: n.inventoryItem.unitCost ? Number(n.inventoryItem.unitCost.amount) : null });
    p.totalInventory += qty;
  }

  const daily = eachDay(w60).map((date) => {
    const rows = a.daily.filter((r) => r.date === date);
    return {
      date,
      orders: rows.reduce((s, r) => s + r.orders, 0),
      netSales: major(rows.reduce((s, r) => s + r.netSales, 0)),
      sessions: extra.sessions[date] ?? null,
    };
  });

  const channels = new Map<string, { channel: string; orders: number; netSales: number }>();
  for (const r of a.daily) {
    if (!inRange(r.date, w30)) continue;
    const c = channels.get(r.channel) ?? { channel: r.channel, orders: 0, netSales: 0 };
    c.orders += r.orders;
    c.netSales += r.netSales;
    channels.set(r.channel, c);
  }

  return {
    shop: { name: raw.shop.name, domain: raw.shop.domain, currencyCode: raw.shop.currencyCode, timezone: raw.shop.timezone, plan: extra.plan },
    extractedAt: raw.extractedAt,
    products: [...products.values()],
    daily,
    unitsSold365d: unitsBy(null),
    unitsSold7d: unitsBy(w7),
    unitsSoldPrev7d: unitsBy(p7),
    channels30d: [...channels.values()].map((c) => ({ ...c, netSales: major(c.netSales) })),
    recentOrders: extra.recentOrders,
    returningCustomerRate90d: extra.returningCustomerRate90d,
  };
}
