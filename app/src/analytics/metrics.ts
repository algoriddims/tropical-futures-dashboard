// ── Metric functions ──────────────────────────────────────────────────────
// Pure functions over the normalized AnalyticsSnapshot. Definitions live in
// dictionary.ts (and docs/metrics.md); the UI only formats what these return.

import type { AnalyticsSnapshot, DailyChannelRow, MetricResult, VariantDailyRow, VariantRecord } from './types';
import { unavailable } from './types';
import type { Money } from './money';
import { formatMoney } from './money';
import type { Comparison, DayRange, Ymd } from './period';
import { addDays, coverage, dayCount, inRange, todayIn } from './period';
import type { ChannelFilter, ChannelGroup } from './channels';
import { CHANNEL_MAP, channelGroup, matchesChannel } from './channels';

// ── Period totals ──────────────────────────────────────────────────────────

export interface PeriodTotals {
  range: DayRange;
  daysCovered: number;
  daysTotal: number;
  uncovered: Ymd[];
  orders: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;                 // over lines with a recorded cost
  netSalesWithCost: number;
  qtyOrdered: number;
  qtyReturned: number;
  netItems: number;
}

type Measures = Pick<DailyChannelRow, 'grossSales' | 'discounts' | 'returns' | 'netSales' | 'cogs' | 'netSalesWithCost' | 'qtyOrdered' | 'qtyReturned' | 'netItems'>;

function addMeasures<T extends Measures>(acc: Omit<PeriodTotals, 'range' | 'daysCovered' | 'daysTotal' | 'uncovered' | 'orders'>, r: T) {
  acc.grossSales += r.grossSales;
  acc.discounts += r.discounts;
  acc.returns += r.returns;
  acc.netSales += r.netSales;
  acc.cogs += r.cogs ?? 0;
  acc.netSalesWithCost += r.netSalesWithCost;
  acc.qtyOrdered += r.qtyOrdered;
  acc.qtyReturned += r.qtyReturned;
  acc.netItems += r.netItems;
}

export function periodTotals(s: AnalyticsSnapshot, range: DayRange, filter: ChannelFilter = 'ALL', map: Record<string, ChannelGroup> = CHANNEL_MAP): PeriodTotals {
  const cov = coverage(range, s.salesCoverage);
  const t: PeriodTotals = {
    range, daysCovered: cov.covered, daysTotal: cov.total, uncovered: cov.uncovered,
    orders: 0, grossSales: 0, discounts: 0, returns: 0, netSales: 0, cogs: 0, netSalesWithCost: 0, qtyOrdered: 0, qtyReturned: 0, netItems: 0,
  };
  for (const r of s.daily) {
    if (!inRange(r.date, range) || !matchesChannel(r.channel, filter, map)) continue;
    t.orders += r.orders;
    addMeasures(t, r);
  }
  return t;
}

function coverageStatus<T>(t: PeriodTotals, value: T): MetricResult<T> {
  if (t.daysCovered === 0) return unavailable(`No sales data for ${t.range.from} – ${t.range.to}.`);
  if (t.daysCovered < t.daysTotal) {
    return {
      status: 'partial', value,
      reason: `Sales data covers ${t.daysCovered} of ${t.daysTotal} days; missing days are unknown, not zero.`,
      coverage: { covered: t.daysCovered, total: t.daysTotal, unit: 'days' },
    };
  }
  return { status: 'valid', value, coverage: { covered: t.daysTotal, total: t.daysTotal, unit: 'days' } };
}

// ── Revenue, profit, margin ────────────────────────────────────────────────

/** Net product revenue = gross − discounts − returns (as Shopify net sales; excludes shipping, tax, duties, gift cards). */
export function netProductRevenue(t: PeriodTotals, currency: string): MetricResult<Money> {
  return coverageStatus(t, { currency, minor: t.netSales });
}

/**
 * Gross profit over the revenue whose lines have a recorded cost:
 * netSalesWithCost − COGS. When some revenue has no recorded cost the result
 * is partial and covers only that subset — never whole-business profit.
 */
export function grossProfit(t: PeriodTotals, currency: string): MetricResult<Money> {
  const base = coverageStatus(t, { currency, minor: t.netSalesWithCost - t.cogs });
  if (base.status === 'unavailable') return base;
  if (t.netSales > 0 && t.netSalesWithCost === 0 && t.cogs === 0) {
    return unavailable('No sold line in this period has a recorded unit cost.');
  }
  const costShare = costCoverage(t);
  if (costShare !== null && costShare < 1) {
    return {
      status: 'partial', value: base.value,
      reason: `Only ${Math.round(costShare * 100)}% of net revenue has a recorded cost; profit covers that subset only.${base.reason ? ' ' + base.reason : ''}`,
      coverage: { covered: t.netSalesWithCost, total: t.netSales, unit: 'revenue (minor units)' },
    };
  }
  return base;
}

/** Share of net revenue whose lines carry a recorded cost; null without positive revenue. */
export function costCoverage(t: PeriodTotals): number | null {
  return t.netSales > 0 ? Math.min(1, Math.max(0, t.netSalesWithCost / t.netSales)) : null;
}

/** Gross margin % = gross profit ÷ the same subset's net revenue × 100 (from sums, never averaged). */
export function grossMargin(t: PeriodTotals, currency: string): MetricResult<number> {
  const gp = grossProfit(t, currency);
  if (gp.status === 'unavailable' || !gp.value) return unavailable(gp.reason ?? 'Gross profit unavailable.');
  if (t.netSalesWithCost <= 0) return unavailable('No positive net revenue with recorded cost in this period.');
  return { ...gp, value: (gp.value.minor / t.netSalesWithCost) * 100 };
}

// ── Basket (purchase-time) ─────────────────────────────────────────────────

/** AOV at purchase = (gross − discounts) on orders placed ÷ those orders. Later refunds excluded. */
export function aovAtPurchase(t: PeriodTotals, currency: string): MetricResult<Money> {
  if (t.orders <= 0) return t.daysCovered === 0 ? unavailable('No sales data for this period.') : unavailable('No orders placed in this period.');
  const minor = (t.grossSales + t.discounts) / t.orders;
  return coverageStatus(t, { currency, minor: Math.sign(minor) * Math.round(Math.abs(minor)) });
}

/** Units per order at purchase = merchandise units ordered ÷ the same orders. */
export function unitsPerOrder(t: PeriodTotals): MetricResult<number> {
  if (t.orders <= 0) return unavailable(t.daysCovered === 0 ? 'No sales data for this period.' : 'No orders placed in this period.');
  return coverageStatus(t, t.qtyOrdered / t.orders);
}

// ── Comparisons ────────────────────────────────────────────────────────────

export interface Change {
  abs: number;                 // current − prior (minor units, units, or percentage points)
  pct: number | null;          // standard growth %, only when prior > 0
  note?: string;               // why pct is absent
}

export function change(current: number, prior: number): Change {
  const abs = current - prior;
  if (prior > 0) return { abs, pct: (abs / prior) * 100 };
  return { abs, pct: null, note: prior === 0 ? 'no prior-period value to compare against' : 'prior period was negative' };
}

/** For percentage metrics: change in percentage points. */
export const changePp = (current: number, prior: number): Change => ({ abs: current - prior, pct: null, note: 'percentage-point change' });

// ── Inventory ──────────────────────────────────────────────────────────────

export interface StockPosition {
  available: number;           // summed over locations, may be negative (oversold)
  sellable: number;            // max(0, available)
  oversold: number;            // units sold beyond stock (negative available), else 0
  onHand: number;
  committed: number;
  incoming: number;            // not yet received — never counted as available
  unavailable: number;
}

export function stockPosition(v: VariantRecord): StockPosition {
  const sum = (k: 'available' | 'onHand' | 'committed' | 'incoming' | 'unavailable') => v.inventory.reduce((s, l) => s + l[k], 0);
  const available = sum('available');
  return {
    available, sellable: Math.max(0, available), oversold: Math.max(0, -available),
    onHand: sum('onHand'), committed: sum('committed'), incoming: sum('incoming'), unavailable: sum('unavailable'),
  };
}

/** The demand window for cover: `days` complete days ending the day before the inventory read (business tz). */
export function coverWindow(s: AnalyticsSnapshot, days = 28): DayRange | null {
  if (!s.timezone) return null;
  const to = addDays(todayIn(s.timezone, new Date(s.inventoryAsOf)), -1);
  return { from: addDays(to, -(days - 1)), to };
}

export type Cover =
  | { kind: 'weeks'; weeks: number }
  | { kind: 'no-recent-sales' }
  | { kind: 'out-of-stock' }
  | { kind: 'not-tracked' }
  | { kind: 'bundle' };

export interface CoverResult {
  cover: Cover;
  status: 'valid' | 'partial' | 'unavailable';
  unitsInWindow: number;       // net units sold in the window (all channels — the shared stock pool)
  weeklyVelocity: number;
  flags: string[];             // short history, stockout-constrained, window not fully covered
}

/**
 * Weeks of cover (an estimate) = sellable units ÷ trailing average weekly net
 * units sold over `days` complete days ending at the inventory cutoff. Demand
 * is all channels because every channel draws on the same stock pool.
 */
export function weeksOfCover(s: AnalyticsSnapshot, v: VariantRecord, days = 28): CoverResult {
  const w = coverWindow(s, days);
  if (!w) return { cover: { kind: 'no-recent-sales' }, status: 'unavailable', unitsInWindow: 0, weeklyVelocity: 0, flags: ['business timezone not configured'] };
  const flags: string[] = [];
  const cov = coverage(w, s.salesCoverage);
  const units = s.variantDaily.filter((r) => r.variantId === v.variantId && inRange(r.date, w)).reduce((n, r) => n + r.netItems, 0);
  const weekly = Math.max(0, units) / (days / 7);
  const pos = stockPosition(v);
  if (cov.covered < cov.total) flags.push(`sales data covers ${cov.covered} of ${cov.total} days of the window`);
  if (v.productPublishedAt && v.productPublishedAt.slice(0, 10) > w.from) flags.push('short history: published during the window');
  if (v.isBundle) return { cover: { kind: 'bundle' }, status: 'valid', unitsInWindow: units, weeklyVelocity: weekly, flags };
  if (!v.tracked) return { cover: { kind: 'not-tracked' }, status: 'unavailable', unitsInWindow: units, weeklyVelocity: weekly, flags };
  const status = cov.covered === 0 ? 'unavailable' : cov.covered < cov.total ? 'partial' : 'valid';
  if (pos.sellable <= 0) {
    if (units > 0) flags.push('stocked out — recent sales may understate demand');
    return { cover: { kind: 'out-of-stock' }, status, unitsInWindow: units, weeklyVelocity: weekly, flags };
  }
  if (weekly <= 0) return { cover: { kind: 'no-recent-sales' }, status, unitsInWindow: units, weeklyVelocity: 0, flags };
  return { cover: { kind: 'weeks', weeks: pos.sellable / weekly }, status, unitsInWindow: units, weeklyVelocity: weekly, flags };
}

// ── Sizes ──────────────────────────────────────────────────────────────────

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'OS'];

export function sizeOf(v: VariantRecord): string | null {
  const o = v.options.find((x) => /^size$/i.test(x.name));
  return o ? o.value : null;
}

export function colorOf(v: VariantRecord): string | null {
  const o = v.options.find((x) => /^colou?r$/i.test(x.name));
  return o ? o.value : null;
}

// Shopify size labels are free text; the store uses several spellings of the
// same size (Small / S, X-Large / Extra Large / XL, 2X-Large / XXL / 2XL).
// The canonical key groups them for the size matrix; unknown labels pass
// through upper-cased.
const SIZE_SYNONYMS: Record<string, string> = {
  'XX-SMALL': 'XXS', 'X-SMALL': 'XS', 'EXTRA SMALL': 'XS', SMALL: 'S', MEDIUM: 'M', LARGE: 'L',
  'X-LARGE': 'XL', 'EXTRA LARGE': 'XL', 'XX-LARGE': '2XL', '2X-LARGE': '2XL', XXL: '2XL',
  '3X-LARGE': '3XL', 'XXX-LARGE': '3XL', XXXL: '3XL', '4X-LARGE': '4XL', 'ONE SIZE': 'OS',
};

export function sizeKey(label: string): string {
  const u = label.trim().toUpperCase().replace(/\s+/g, ' ');
  return SIZE_SYNONYMS[u] ?? u;
}

export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const i = SIZE_ORDER.indexOf(sizeKey(s));
    return i === -1 ? 100 : i;
  };
  return [...new Set(sizes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ── Product performance ────────────────────────────────────────────────────

export interface VariantPerf {
  variant: VariantRecord;
  size: string | null;
  color: string | null;
  stock: StockPosition;
  cover: CoverResult;
  current: SalesSlice;
  prior: SalesSlice;
}

export interface SalesSlice {
  netSales: number;
  netSalesWithCost: number;
  cogs: number;
  netItems: number;
  qtyOrdered: number;
}

export interface ProductPerf {
  productId: string;
  title: string;
  productType: string;
  publishedAt: string | null;
  ageDays: number | null;
  inCatalog: boolean;            // false = sold in the period but no longer in the active catalog
  variants: VariantPerf[];
  current: SalesSlice;
  prior: SalesSlice;
  stock: StockPosition;
  sizesOut: string[];            // sizes with no sellable stock
  sizesTotal: number;
  minCover: CoverResult | null;  // the variant that runs out first
}

const emptySlice = (): SalesSlice => ({ netSales: 0, netSalesWithCost: 0, cogs: 0, netItems: 0, qtyOrdered: 0 });

function slice(rows: VariantDailyRow[]): SalesSlice {
  const s = emptySlice();
  for (const r of rows) {
    s.netSales += r.netSales;
    s.netSalesWithCost += r.netSalesWithCost;
    s.cogs += r.cogs ?? 0;
    s.netItems += r.netItems;
    s.qtyOrdered += r.qtyOrdered;
  }
  return s;
}

function addSlice(a: SalesSlice, b: SalesSlice): SalesSlice {
  return { netSales: a.netSales + b.netSales, netSalesWithCost: a.netSalesWithCost + b.netSalesWithCost, cogs: a.cogs + b.cogs, netItems: a.netItems + b.netItems, qtyOrdered: a.qtyOrdered + b.qtyOrdered };
}

export function productPerformance(s: AnalyticsSnapshot, cmp: Comparison, filter: ChannelFilter = 'ALL', map: Record<string, ChannelGroup> = CHANNEL_MAP): ProductPerf[] {
  const rowsFor = (variantId: string, range: DayRange) =>
    s.variantDaily.filter((r) => r.variantId === variantId && inRange(r.date, range) && matchesChannel(r.channel, filter, map));
  const asOf = s.timezone ? todayIn(s.timezone, new Date(s.inventoryAsOf)) : s.inventoryAsOf.slice(0, 10);
  const byProduct = new Map<string, ProductPerf>();

  for (const v of s.variants) {
    const vp: VariantPerf = {
      variant: v, size: sizeOf(v), color: colorOf(v), stock: stockPosition(v), cover: weeksOfCover(s, v),
      current: slice(rowsFor(v.variantId, cmp.current)), prior: slice(rowsFor(v.variantId, cmp.prior)),
    };
    let p = byProduct.get(v.productId);
    if (!p) {
      const pub = v.productPublishedAt?.slice(0, 10) ?? null;
      p = {
        productId: v.productId, title: v.productTitle, productType: v.productType, publishedAt: v.productPublishedAt,
        ageDays: pub ? dayCount({ from: pub, to: asOf }) - 1 : null, inCatalog: true, variants: [],
        current: emptySlice(), prior: emptySlice(),
        stock: { available: 0, sellable: 0, oversold: 0, onHand: 0, committed: 0, incoming: 0, unavailable: 0 },
        sizesOut: [], sizesTotal: 0, minCover: null,
      };
      byProduct.set(v.productId, p);
    }
    p.variants.push(vp);
    p.current = addSlice(p.current, vp.current);
    p.prior = addSlice(p.prior, vp.prior);
    if (!v.isBundle) {
      for (const k of Object.keys(p.stock) as (keyof StockPosition)[]) p.stock[k] += vp.stock[k];
    }
  }

  // Sales for variants no longer in the active catalog stay visible.
  const known = new Set(s.variants.map((v) => v.variantId));
  for (const r of s.variantDaily) {
    if (known.has(r.variantId) || !matchesChannel(r.channel, filter, map)) continue;
    const inCur = inRange(r.date, cmp.current);
    const inPrior = inRange(r.date, cmp.prior);
    if (!inCur && !inPrior) continue;
    const key = `missing-${r.productId}`;
    let p = byProduct.get(key);
    if (!p) {
      p = {
        productId: r.productId, title: `Product ${r.productId} (not in active catalog)`, productType: '—', publishedAt: null, ageDays: null,
        inCatalog: false, variants: [], current: emptySlice(), prior: emptySlice(),
        stock: { available: 0, sellable: 0, oversold: 0, onHand: 0, committed: 0, incoming: 0, unavailable: 0 },
        sizesOut: [], sizesTotal: 0, minCover: null,
      };
      byProduct.set(key, p);
    }
    if (inCur) p.current = addSlice(p.current, slice([r]));
    if (inPrior) p.prior = addSlice(p.prior, slice([r]));
  }

  for (const p of byProduct.values()) {
    const sized = p.variants.filter((x) => x.size !== null && !x.variant.isBundle && x.variant.tracked);
    p.sizesTotal = sized.length;
    p.sizesOut = sortSizes(sized.filter((x) => x.stock.sellable <= 0).map((x) => x.size!));
    const weeks = p.variants.filter((x) => x.cover.cover.kind === 'weeks').sort((a, b) =>
      (a.cover.cover as { weeks: number }).weeks - (b.cover.cover as { weeks: number }).weeks);
    p.minCover = weeks[0]?.cover ?? null;
  }
  return [...byProduct.values()];
}

// ── Customers ──────────────────────────────────────────────────────────────

/** Returning-customer share (DTC): returning ÷ unique identified customers ordering in the period. */
export function returningShare(s: AnalyticsSnapshot, range: DayRange, channel = 'Online Store'): MetricResult<{ share: number; customers: number; returning: number }> {
  const w = s.customers.find((c) => c.from === range.from && c.to === range.to && c.channel === channel);
  if (!w) return unavailable(`Not extracted for ${range.from} – ${range.to}; customer counts can't be summed across days, so each period needs its own query.`);
  if (w.customers <= 0) return unavailable('No identified customers ordered in this period.');
  return {
    status: 'partial',
    value: { share: w.returningCustomers / w.customers, customers: w.customers, returning: w.returningCustomers },
    reason: 'Identity coverage isn\'t reported: orders without a customer record are not counted, and history before the store\'s Shopify records is unknown.',
  };
}

// ── Explicitly unavailable metrics ─────────────────────────────────────────

export const dropSellThrough = (): MetricResult<number> =>
  unavailable('Needs a drop → product mapping and received units per drop (receipt history). Neither is in any connected source, and it is not reconstructed from current stock.');

export const returnRate = (): MetricResult<number> =>
  unavailable('Needs physically returned units linked to the fulfilled orders they came from. Shopify analytics reports returns by return date, not by sales cohort.');

export const wholesaleSales = (): MetricResult<Money> =>
  unavailable('No wholesale orders, invoices or payments are connected. Draft-order sales in Shopify are unmapped, not assumed wholesale.');

// ── Channel breakdown ──────────────────────────────────────────────────────

export interface ChannelLine { channel: string; group: ChannelGroup; totals: PeriodTotals }

export function channelBreakdown(s: AnalyticsSnapshot, range: DayRange, map: Record<string, ChannelGroup> = CHANNEL_MAP): ChannelLine[] {
  const names = [...new Set(s.daily.filter((r) => inRange(r.date, range)).map((r) => r.channel))];
  return names.map((channel) => {
    const t = periodTotals({ ...s, daily: s.daily.filter((r) => r.channel === channel) }, range, 'ALL', map);
    return { channel, group: channelGroup(channel, map), totals: t };
  }).sort((a, b) => b.totals.netSales - a.totals.netSales);
}

// ── Exceptions ─────────────────────────────────────────────────────────────

export interface Exception {
  id: string;
  severity: 1 | 2 | 3;          // 1 = most important
  title: string;
  affected: string;
  numbers: string[];            // supporting figures, plain text
  rule: string;                 // the triggering rule, verbatim
  drill: { desk: string; label: string };
  evidence: 'sufficient' | 'insufficient';
}

export interface ExceptionConfig {
  lowCoverWeeks: number;        // heuristic threshold (no lead times supplied)
  minUnitsForCover: number;     // minimum units sold in the window before cover is trusted
}

export const DEFAULT_EXCEPTION_CONFIG: ExceptionConfig = { lowCoverWeeks: 4, minUnitsForCover: 2 };

export function buildExceptions(s: AnalyticsSnapshot, cmp: Comparison, products: ProductPerf[], cfg: ExceptionConfig = DEFAULT_EXCEPTION_CONFIG, map: Record<string, ChannelGroup> = CHANNEL_MAP): Exception[] {
  const out: Exception[] = [];
  // 1. selling sizes that are unavailable
  for (const p of products) {
    const outSelling = p.variants.filter((v) => v.cover.cover.kind === 'out-of-stock' && v.cover.unitsInWindow > 0);
    if (outSelling.length) {
      out.push({
        id: `oos-${p.productId}`, severity: 1,
        title: `${p.title}: ${outSelling.map((v) => v.size ?? v.color ?? v.variant.variantTitle).join(', ')} unavailable`,
        affected: p.title,
        numbers: outSelling.map((v) => `${v.size ?? v.variant.variantTitle}: ${v.cover.unitsInWindow} sold in the last 28 days, ${v.stock.available} available${v.stock.oversold ? ` (oversold by ${v.stock.oversold})` : ''}`),
        rule: 'A variant sold in the last 28 complete days and now has no sellable stock.',
        drill: { desk: 'i', label: 'Open inventory' },
        evidence: 'sufficient',
      });
    }
  }
  // 2. low cover (heuristic)
  for (const p of products) {
    const low = p.variants.filter((v) => v.cover.cover.kind === 'weeks' && v.cover.cover.weeks < cfg.lowCoverWeeks && v.cover.unitsInWindow >= cfg.minUnitsForCover);
    if (low.length) {
      out.push({
        id: `low-${p.productId}`, severity: 2,
        title: `${p.title}: under ${cfg.lowCoverWeeks} weeks of stock in ${low.map((v) => v.size ?? v.variant.variantTitle).join(', ')}`,
        affected: p.title,
        numbers: low.map((v) => `${v.size ?? v.variant.variantTitle}: ${v.stock.sellable} available, ${v.cover.unitsInWindow} sold in 28 days ≈ ${(v.cover.cover as { weeks: number }).weeks.toFixed(1)} weeks (estimate)`),
        rule: `Weeks of cover < ${cfg.lowCoverWeeks} (a heuristic — no lead times or safety stock are configured) with ≥ ${cfg.minUnitsForCover} units sold in 28 days.`,
        drill: { desk: 'i', label: 'Open inventory' },
        evidence: 'sufficient',
      });
    }
  }
  // 3. unmapped channels with sales in the current period
  const unmapped = channelBreakdown(s, cmp.current, map).filter((c) => c.group === 'UNMAPPED' && (c.totals.orders > 0 || c.totals.netItems !== 0));
  if (unmapped.length) {
    out.push({
      id: 'unmapped', severity: 3,
      title: `${unmapped.length === 1 ? unmapped[0].channel : `${unmapped.length} channels`} not mapped to DTC or wholesale`,
      affected: unmapped.map((c) => c.channel).join(', '),
      numbers: unmapped.map((c) => `${c.channel}: ${c.totals.orders} orders, ${c.totals.netItems} units, ${formatMoney({ currency: s.currency, minor: c.totals.netSales }, { cents: true })} net product revenue`),
      rule: 'Sales in the period came through a channel with no DTC/wholesale mapping. They are in "All channels" totals but not in either group.',
      drill: { desk: 'l', label: 'Open channels' },
      evidence: 'sufficient',
    });
  }
  return out.sort((a, b) => a.severity - b.severity);
}
