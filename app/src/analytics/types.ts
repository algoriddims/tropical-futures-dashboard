// ── Analytics data contract ───────────────────────────────────────────────
// The `analytics` block of a snapshot: normalized, single-source (Shopify)
// records at their native grain, keyed by stable source IDs. Money is integer
// minor units of `currency`. See docs/data/analytics-contract.md.

import type { Ymd } from './period';

/** One (day, sales channel) row of Shopify sales. Days with no activity have no row but are covered. */
export interface DailyChannelRow {
  date: Ymd;                    // business-timezone day the event was recorded (sale: order date; return: return date)
  channel: string;              // Shopify sales_channel name, verbatim
  orders: number;               // orders placed that day
  grossSales: number;           // merchandise at list price, before discounts (excl. shipping, tax, gift cards)
  discounts: number;            // ≤ 0, order-date allocated line discounts
  returns: number;              // ≤ 0, merchandise returned/refunded, dated when the return was recorded
  netSales: number;             // gross + discounts + returns, as reported (not recomputed)
  cogs: number | null;          // cost of goods sold for lines with a recorded cost; null = none recorded
  netSalesWithCost: number;     // the part of netSales whose lines have a recorded cost
  qtyOrdered: number;           // merchandise units on orders placed that day
  qtyReturned: number;          // ≤ 0, units returned that day
  netItems: number;             // qtyOrdered + qtyReturned, as reported
}

/** One (day, channel, variant) row — same measures, variant grain. */
export interface VariantDailyRow {
  date: Ymd;
  channel: string;
  productId: string;            // numeric Shopify product id
  variantId: string;            // numeric Shopify variant id
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number | null;
  netSalesWithCost: number;
  qtyOrdered: number;
  qtyReturned: number;
  netItems: number;
}

export interface InventoryLevel {
  locationId: string;
  locationName: string;
  available: number;            // sellable now (Shopify already subtracts committed/reserved); can be negative = oversold
  onHand: number;
  committed: number;            // on orders not yet fulfilled (already excluded from available)
  incoming: number;             // inbound, not yet received — never added to available
  reserved: number;
  unavailable: number;          // damaged + safety stock + quality control
}

export interface VariantRecord {
  variantId: string;
  productId: string;
  productTitle: string;
  productType: string;
  variantTitle: string;
  sku: string | null;
  options: { name: string; value: string }[];
  price: number;                // minor units
  unitCost: number | null;      // current recorded cost, minor units; null = not recorded
  productCreatedAt: string;     // ISO
  productPublishedAt: string | null; // ISO; first published to the online store (not a drop launch date)
  tracked: boolean;
  /** Bundle parent (Shopify requiresComponents): its stock lives in its components. */
  isBundle: boolean;
  inventory: InventoryLevel[];
}

export interface CustomerWindow {
  from: Ymd;
  to: Ymd;
  channel: string;              // e.g. 'Online Store'
  customers: number;            // unique identified customers who ordered in the window
  returningCustomers: number;   // …who had ordered before the window began (Shopify's full store history)
  orders: number;
}

export interface AnalyticsSnapshot {
  version: 1;
  source: 'shopify';
  shop: string;
  currency: string;             // ISO 4217 reporting currency, from the shop
  timezone: string | null;      // IANA business timezone; null = configuration gap
  extractedAt: string;          // ISO
  inventoryAsOf: string;        // ISO — when inventory levels were read
  /** Days the sales extract covers. A day inside [from, to] and not in `missing` with no rows had no sales. */
  salesCoverage: { from: Ymd; to: Ymd; missing: Ymd[] };
  daily: DailyChannelRow[];
  variantDaily: VariantDailyRow[];
  variants: VariantRecord[];
  customers: CustomerWindow[];
  notes: string[];
}

// ── Metric availability ────────────────────────────────────────────────────

export type Availability = 'valid' | 'partial' | 'unavailable';

export interface MetricResult<T> {
  status: Availability;
  value: T | null;              // null only when unavailable
  /** Why it's partial or unavailable, in plain words. */
  reason?: string;
  coverage?: { covered: number; total: number; unit: string };
}

export const unavailable = <T,>(reason: string): MetricResult<T> => ({ status: 'unavailable', value: null, reason });
