// ── Game rules engine ─────────────────────────────────────────────────────
// Pure functions over ParkData. Thresholds and formulas live here so they
// can be tuned without touching UI.

import type { ParkData, Product, Notice, Campaign, PipelineItem, Channel, CostItem, CostCategory, Tier, RideState, DayPoint, CashMonth } from './types';
import { money, plural } from './format';

export type { RideState };

export interface RatingPart {
  label: string;
  /** null = inputs unavailable; the part is left out of the rating, not scored as zero */
  score: number | null;
  weight: number;
  note: string;
}

export interface Metrics {
  revenue: number;
  orders: number;
  aov: number;
  /** Ad spend over the window; null unless every day in it carries spend (ads connected). */
  spend: number | null;
  /** Campaign-attributed ROAS; null without campaign spend. */
  roas: number | null;
  /** All revenue ÷ all ad spend; null without spend. */
  mer: number | null;
  breakEvenRoas: number;
  /** Measured sessions over the window; null unless every day in it carries sessions. */
  guests: number | null;
  /** Orders ÷ measured sessions, %; null when sessions are unavailable. */
  conversionRate: number | null;
  rating: number;
  ratingBand: string;
  ratingParts: RatingPart[];
  /** % change vs the previous equal-length window; null without a full, non-zero previous window. */
  revenueDeltaPct: number | null;
  inventoryUnits: number;
  /** Stock at cost, over products whose unit cost is known. */
  inventoryCost: number;
  /** Units in stock with no recorded unit cost (left out of inventoryCost). */
  inventoryUnitsWithoutCost: number;
  inventoryRetail: number;
  overallSellThrough: number;
  pipelineUnits: number;
  pipelineCost: number;
  pipelineGross: number;
  pipelineNet: number;
}

// 0..1. Nothing sold and nothing in stock has no meaningful sell-through;
// it's 0 for ranking and shown as "—" (see hasSellThrough).
export function sellThrough(p: Product): number {
  const den = p.soldTotal + p.stock;
  return den > 0 ? p.soldTotal / den : 0;
}

export function hasSellThrough(p: Product): boolean {
  return p.soldTotal + p.stock > 0;
}

// A week needs a few sales before "rising" means anything: at 0–2 units a
// single order looks like a trend.
export const MIN_UNITS_FOR_TREND = 3;

export function dailyVelocity(p: Product): number {
  return p.sold7d / 7;
}

export function daysOfStock(p: Product): number {
  const v = dailyVelocity(p);
  return v <= 0 ? Infinity : p.stock / v;
}

// A sellout is a state, not a fault: whether it needs action depends on the
// product's restock policy (see soldOutNotice).
export function rideState(p: Product): RideState {
  if (!p.published) return 'CLOSED';
  if (p.stock === 0 && p.tracked !== false) return 'SOLD OUT';
  const v = dailyVelocity(p);
  const prev = p.soldPrev7d / 7;
  if (p.sold7d >= MIN_UNITS_FOR_TREND && v >= prev * 1.25 && sellThrough(p) > 0.25) return 'THRIVING';
  if (v < 0.5) return 'QUIET';
  return 'NORMAL';
}

// Cost math — everything normalized to a monthly figure.
export function monthlyAmount(c: CostItem): number {
  if (!c.active) return 0;
  if (c.cadence === 'WEEKLY') return c.amount * 4.33;
  if (c.cadence === 'ONE-OFF') return 0; // one-offs tracked separately
  return c.amount;
}

// ── Synced bank / card (ERA) ──────────────────────────────────────────────

/** Cash in synced checking + savings; null when no bank accounts are synced. */
export function syncedCash(d: Pick<ParkData, 'accounts'>): number | null {
  const cash = (d.accounts ?? []).filter((a) => a.kind !== 'CARD');
  return cash.length ? Math.round(cash.reduce((s, a) => s + a.balance, 0) * 100) / 100 : null;
}

/** Owed on synced cards; null when no card is synced. */
export function cardOwed(d: Pick<ParkData, 'accounts'>): number | null {
  const cards = (d.accounts ?? []).filter((a) => a.kind === 'CARD');
  return cards.length ? Math.round(cards.reduce((s, a) => s + a.balance, 0) * 100) / 100 : null;
}

export const monthSpend = (m: CashMonth) => Object.values(m.spend).reduce((s, v) => s + (v ?? 0), 0);
export const monthIn = (m: CashMonth) => Object.values(m.cashIn).reduce((s, v) => s + (v ?? 0), 0);

/** Average monthly business spending over the last (up to) 3 complete months; null without data. */
export function actualMonthlySpend(d: Pick<ParkData, 'cashflow'>): { amount: number; months: number } | null {
  const full = (d.cashflow ?? []).filter((m) => !m.partial).slice(-3);
  if (!full.length) return null;
  return { amount: full.reduce((s, m) => s + monthSpend(m), 0) / full.length, months: full.length };
}

export type BurnSource = 'COST_LINES' | 'ACTUAL_SPEND' | 'NONE';

// Cost lines you've entered win; without any, burn falls back to what the
// synced accounts actually spent — never to zero.
export function burnSource(d: ParkData): BurnSource {
  if (d.costs.some((c) => c.active && c.cadence !== 'ONE-OFF')) return 'COST_LINES';
  return actualMonthlySpend(d) ? 'ACTUAL_SPEND' : 'NONE';
}

export function monthlyBurn(d: ParkData): number {
  if (burnSource(d) === 'ACTUAL_SPEND') return actualMonthlySpend(d)!.amount;
  return d.costs.reduce((s, c) => s + monthlyAmount(c), 0);
}

export function oneOffCosts(d: ParkData): number {
  return d.costs.filter((c) => c.active && c.cadence === 'ONE-OFF').reduce((s, c) => s + c.amount, 0);
}

export function burnByCategory(d: ParkData): { category: CostCategory; monthly: number; count: number }[] {
  const cats: CostCategory[] = ['SUBSCRIPTION', 'PAYROLL', 'PRODUCTION', 'OPS'];
  return cats.map((category) => {
    const items = d.costs.filter((c) => c.category === category && c.active);
    return {
      category,
      // production one-offs are amortized into the month they land
      monthly: items.reduce((s, c) => s + (c.cadence === 'ONE-OFF' ? c.amount : monthlyAmount(c)), 0),
      count: items.length,
    };
  });
}

/**
 * Cash you actually have: bank cash minus what's owed on synced cards (card
 * spending is counted when charged, so the balance owed is already-spent
 * money). null when the bank balance is unknown.
 */
export function netCash(d: Pick<ParkData, 'bankBalance' | 'accounts'>): number | null {
  if (d.bankBalance === null) return null;
  return Math.round((d.bankBalance - (cardOwed(d) ?? 0)) * 100) / 100;
}

/** Months of burn covered by net cash; 0 when net cash is negative; null when cash is unknown. */
export function runwayMonths(d: ParkData): number | null {
  const cash = netCash(d);
  if (cash === null) return null;
  if (cash < 0) return 0; // short already: no runway, whatever the burn
  const burn = monthlyBurn(d);
  return burn > 0 ? cash / burn : Infinity;
}

/** Sales (net) so far this calendar month, from daily points dated YYYY-MM-DD; null when days carry no year. */
export function monthToDateSales(d: Pick<ParkData, 'days'>, now = new Date()): number | null {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!d.days.length || !/^\d{4}-\d{2}-\d{2}/.test(d.days[d.days.length - 1].date)) return null;
  return Math.round(d.days.filter((x) => x.date.startsWith(ym)).reduce((s, x) => s + x.revenue, 0) * 100) / 100;
}

// Planning baseline: always trailing 30 days, regardless of which range the
// UI is viewing. Viewing a hot drop week should not inflate a 6-month plan.
export function trailing30dRevenue(d: ParkData): number {
  return d.days.slice(-30).reduce((s, x) => s + x.revenue, 0);
}

// Whole days until an ISO date (negative once passed).
export function daysUntil(isoDate: string): number {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - t.getTime()) / 86400000);
}

// Channel (store location) stock math. ONLINE derives from the products list;
// stockists/pop-ups carry their own per-product allocations.
export interface ChannelStats {
  onHand: number;
  soldUnits: number;
  allocated: number;
  sellThrough: number;     // 0..1
  retailValue: number;     // on-hand at retail
  rows: { product: Product; allocated: number; sold: number; onHand: number; sellThrough: number }[];
}

export function channelStats(c: Channel, products: Product[]): ChannelStats {
  if (c.type === 'ONLINE') {
    const rows = products
      .filter((p) => p.published)
      .map((p) => ({ product: p, allocated: p.startInventory, sold: p.soldTotal, onHand: p.stock, sellThrough: sellThrough(p) }));
    const onHand = rows.reduce((s, r) => s + r.onHand, 0);
    const soldUnits = rows.reduce((s, r) => s + r.sold, 0);
    return {
      onHand, soldUnits,
      allocated: rows.reduce((s, r) => s + r.allocated, 0),
      sellThrough: soldUnits / (soldUnits + onHand || 1),
      retailValue: rows.reduce((s, r) => s + r.onHand * r.product.price, 0),
      rows,
    };
  }
  const rows = c.stock.map((s) => {
    const product = products.find((p) => p.id === s.productId);
    if (!product) return null;
    return {
      product,
      allocated: s.allocated,
      sold: s.sold,
      onHand: s.allocated - s.sold,
      sellThrough: s.allocated > 0 ? s.sold / s.allocated : 0,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  const onHand = rows.reduce((s, r) => s + r.onHand, 0);
  const soldUnits = rows.reduce((s, r) => s + r.sold, 0);
  return {
    onHand, soldUnits,
    allocated: rows.reduce((s, r) => s + r.allocated, 0),
    sellThrough: soldUnits / (soldUnits + onHand || 1),
    retailValue: rows.reduce((s, r) => s + r.onHand * r.product.price, 0),
    rows,
  };
}

// Pipeline economics
export function pipelineGross(i: PipelineItem): number { return i.qty * i.retail; }
export function pipelineCost(i: PipelineItem): number { return i.qty * i.unitCost; }
export function pipelineNet(i: PipelineItem): number { return pipelineGross(i) - pipelineCost(i); }
export function pipelineMargin(i: PipelineItem): number { return (i.retail - i.unitCost) / i.retail; }
// expected profit if it performs like comparable products
export function pipelineExpectedNet(i: PipelineItem): number {
  const sold = Math.round(i.qty * i.expectedSellThrough);
  return sold * i.retail - pipelineCost(i);
}

export function computeMetrics(d: ParkData, rangeDays: number): Metrics {
  const days = d.days.slice(-rangeDays);
  const prev = d.days.slice(-rangeDays * 2, -rangeDays);
  const revenue = days.reduce((s, x) => s + x.revenue, 0);
  const orders = days.reduce((s, x) => s + x.orders, 0);
  const spend = measuredSpend(days);
  // No substitute baseline: comparing against an empty or partial window
  // (or $0) produces numbers like +9900% that mean nothing.
  const prevRevenue = prev.length === rangeDays ? prev.reduce((s, x) => s + x.revenue, 0) : 0;
  const prevOrders = prev.reduce((s, x) => s + x.orders, 0);
  // 4 orders vs 2 is "+308%" of noise: need a few orders on both sides.
  const revenueDeltaPct = prevRevenue > 0 && orders >= MIN_ORDERS_FOR_DELTA && prevOrders >= MIN_ORDERS_FOR_DELTA
    ? ((revenue - prevRevenue) / prevRevenue) * 100
    : null;

  const attrRevenue = d.campaigns.reduce((s, c) => s + c.revenue, 0);
  const campSpend = d.campaigns.reduce((s, c) => s + c.spend, 0);
  const roas = campSpend > 0 ? attrRevenue / campSpend : null;
  const mer = spend !== null && spend > 0 ? revenue / spend : null;
  const breakEvenRoas = 1 / d.grossMargin;

  const guests = measuredSessions(days);

  const inventoryUnits = d.products.reduce((s, p) => s + p.stock, 0);
  const inventoryCost = d.products.reduce((s, p) => s + (p.unitCost !== null ? p.stock * p.unitCost : 0), 0);
  const inventoryUnitsWithoutCost = d.products.reduce((s, p) => s + (p.unitCost === null ? p.stock : 0), 0);
  const inventoryRetail = d.products.reduce((s, p) => s + p.stock * p.price, 0);
  const totalSold = d.products.reduce((s, p) => s + p.soldTotal, 0);
  const overallSellThrough = totalSold / (totalSold + inventoryUnits || 1);

  // The score always reads a fixed 30-day window so it doesn't swing with
  // the range being viewed.
  const r30 = d.days.slice(-30);
  const p30 = d.days.slice(-60, -30);
  const ratingParts = buildRating(d, {
    revenue: r30.reduce((s, x) => s + x.revenue, 0),
    prevRevenue: p30.length === 30 && p30.reduce((s, x) => s + x.orders, 0) >= MIN_ORDERS_FOR_DELTA && r30.reduce((s, x) => s + x.orders, 0) >= MIN_ORDERS_FOR_DELTA
      ? p30.reduce((s, x) => s + x.revenue, 0)
      : 0,
    roas, breakEvenRoas,
  });
  const rating = combineRating(ratingParts);

  return {
    revenue, orders,
    aov: orders > 0 ? revenue / orders : 0,
    spend, roas, mer, breakEvenRoas,
    guests,
    conversionRate: guests !== null && guests > 0 ? (orders / guests) * 100 : null,
    rating,
    // A good-looking number must never hide a cash hole.
    ratingBand: (netCash(d) ?? 0) < 0 ? 'CASH SHORT' : bandFor(rating),
    ratingParts,
    revenueDeltaPct,
    inventoryUnits, inventoryCost, inventoryUnitsWithoutCost, inventoryRetail, overallSellThrough,
    pipelineUnits: d.pipeline.reduce((s, i) => s + i.qty, 0),
    pipelineCost: d.pipeline.reduce((s, i) => s + pipelineCost(i), 0),
    pipelineGross: d.pipeline.reduce((s, i) => s + pipelineGross(i), 0),
    pipelineNet: d.pipeline.reduce((s, i) => s + pipelineNet(i), 0),
  };
}

/** Orders needed in each window before a % change is shown. */
export const MIN_ORDERS_FOR_DELTA = 3;

// Ad spend only counts when every day in the window carries it; a day
// without spend means ads weren't connected, not that nothing was spent.
export function measuredSpend(days: DayPoint[]): number | null {
  if (days.length === 0) return null;
  let total = 0;
  for (const x of days) {
    if (typeof x.spend !== 'number') return null;
    total += x.spend;
  }
  return total;
}

// Sessions only count when measured for every day of the window — a partial
// window would make conversion look better or worse than it was.
export function measuredSessions(days: DayPoint[]): number | null {
  if (days.length === 0) return null;
  let total = 0;
  for (const x of days) {
    if (typeof x.sessions !== 'number') return null;
    total += x.sessions;
  }
  return total;
}

// Weighted 0–1000 over the parts whose inputs exist (missing parts are left
// out, not scored as zero).
export function combineRating(parts: RatingPart[]): number {
  const known = parts.filter((p): p is RatingPart & { score: number } => p.score !== null);
  const weight = known.reduce((s, p) => s + p.weight, 0);
  if (weight === 0) return 0;
  return Math.round((known.reduce((s, p) => s + p.score * p.weight, 0) / weight) * 10);
}

function bandFor(r: number): string {
  if (r < 200) return 'NEEDS WORK';
  if (r < 400) return 'WEAK';
  if (r < 600) return 'FAIR';
  if (r < 800) return 'GOOD';
  return 'STRONG';
}

// Business score, 0–1000. Each component scores 0..100; weights sum to 12.5.
function buildRating(
  d: ParkData,
  ctx: { revenue: number; prevRevenue: number; roas: number | null; breakEvenRoas: number },
): RatingPart[] {
  const momentum = ctx.prevRevenue > 0 ? clamp(((ctx.revenue / ctx.prevRevenue) - 0.7) / 0.6, 0, 1) * 100 : null;

  // A completed limited run is neither healthy nor unhealthy — it's done.
  // Untracked (made-to-order) items and lines with no sales in the sales
  // window aren't live stock decisions either.
  const live = d.products.filter((p) => p.published && p.tracked !== false && !(p.stock === 0 && p.restockPolicy === 'LIMITED') && !(p.stock === 0 && p.soldTotal === 0));
  const healthy = live.filter((p) => p.stock > 0 && p.soldTotal > 0);
  const rideHealth = live.length ? (healthy.length / live.length) * 100 : null;

  const marketing = ctx.roas !== null
    ? clamp((ctx.roas - ctx.breakEvenRoas * 0.6) / (d.targetRoas - ctx.breakEvenRoas * 0.6), 0, 1) * 100
    : null;

  const happiness = d.refundRate !== undefined && d.repeatRate !== undefined
    ? clamp((1 - d.refundRate * 8) * 0.6 + d.repeatRate * 1.1 * 0.4, 0, 1) * 100
    : null;

  const active = d.quests.filter((q) => q.daysLeft > 0);
  // No goals set = nothing to score, not a made-up 70.
  const questPace = active.length
    ? clamp(active.reduce((s, q) => s + q.current / q.target, 0) / active.length / 0.8, 0, 1) * 100
    : null;

  const dead = live.filter(isSlowStock).length;
  const stockouts = live.filter((p) => p.stock === 0).length;
  const discipline = live.length ? clamp(1 - (dead / live.length) - (stockouts / live.length) * 0.5, 0, 1) * 100 : null;

  const runway = runwayMonths(d);
  const cashScore = runway === null ? null : clamp(runway / 12, 0, 1) * 100;

  return [
    { label: 'CASH & RUNWAY', score: cashScore, weight: 2.5, note: cashScore === null ? 'cash unknown — left out' : 'net cash (bank − card) as months of burn, 12+ = full marks' },
    { label: 'SALES MOMENTUM', score: momentum, weight: 2.5, note: momentum === null ? 'too few orders to compare 30-day periods — left out' : 'last 30 days vs the 30 before' },
    { label: 'PRODUCT HEALTH', score: rideHealth, weight: 2.0, note: rideHealth === null ? 'no live products — left out' : 'share of live products in stock and selling (12 months)' },
    { label: 'MARKETING EFFICIENCY', score: marketing, weight: 2.0, note: marketing === null ? 'no campaign data — left out' : `roas vs break-even ${ctx.breakEvenRoas.toFixed(2)}` },
    { label: 'REFUNDS & REPEAT BUYERS', score: happiness, weight: 1.5, note: happiness === null ? 'refund/repeat rates not in data — left out' : 'refunds ↓ · repeat customers ↑' },
    { label: 'GOAL PROGRESS', score: questPace, weight: 1.0, note: questPace === null ? 'no active goals — left out' : 'progress on active goals' },
    { label: 'INVENTORY DISCIPLINE', score: discipline, weight: 1.0, note: discipline === null ? 'no live products — left out' : 'slow stock ↓ · sellouts ↓ (share of live products)' },
  ];
}

/** Stock that would take a year or more to sell at the last 12 months' pace. */
export function isSlowStock(p: Product): boolean {
  if (p.stock < 20 || p.tracked === false) return false;
  if (p.soldTotal <= 0) return true;
  return p.stock / (p.soldTotal / 12) >= 12;
}

/** Months of stock at the 12-month sales pace; null when nothing sold. */
export function monthsOfStock(p: Product): number | null {
  return p.soldTotal > 0 ? p.stock / (p.soldTotal / 12) : null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function campaignVerdict(c: Campaign, breakEvenRoas: number, targetRoas: number): { label: string; tier: 'red' | 'amber' | 'green' } {
  if (c.status === 'PAUSED') return { label: 'PAUSED', tier: 'amber' };
  const roas = c.spend > 0 ? c.revenue / c.spend : 0;
  if (roas < breakEvenRoas) return { label: 'BELOW BREAK-EVEN', tier: 'red' };
  if (roas >= targetRoas) return { label: 'ABOVE TARGET', tier: 'green' };
  return { label: 'UNDER TARGET', tier: 'amber' };
}

// ── Cash-flow forecast ────────────────────────────────────────────────────
// Forward projection in cash terms, starting from NET cash (bank minus card
// owed — that balance is already-spent money that still has to be paid).
// Row 0 is the rest of the current month (prorated by days left), then
// `months` full months.
//
// In: the sales baseline (Shopify net sales — before fees, shipping and tax,
// so it is not the same as payouts reaching the bank). Out: monthly burn
// (cost lines, or actual bank + card spending). Those two are on different
// bases; the forecast says so rather than pretending they match.
//
// Production convention: runs in PRODUCTION/READY are already committed (they
// exist as ONE-OFF cost lines, paid this month); DESIGN/SAMPLES runs are
// committed — and paid — at their ETA month. Expected sell-through revenue
// lands the month after stock arrives.
//
// Stockist money is deliberately NOT forecast: shelf sales × retail × one
// wholesale % is not an amount anyone owes. It returns once invoices,
// consignment statements and allocated payments exist as records.

export interface ForecastEvent { text: string; amount: number; }

export interface ForecastMonth {
  label: string;
  /** Share of the month covered (1 for full months; days left ÷ days in month for row 0). */
  fraction: number;
  opening: number;
  baselineIn: number;
  pipelineIn: number;
  burnOut: number;
  productionOut: number;
  net: number;
  closing: number;
  events: ForecastEvent[];
}

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function etaMonthIndex(i: PipelineItem): number {
  return Math.max(1, Math.ceil(i.etaWeeks / 4.33));
}

/** Empty when cash is unknown — a forecast from an invented $0 would be fiction. */
export function forecastCashflow(d: ParkData, monthlyRevenue: number, months = 6, now = new Date()): ForecastMonth[] {
  const start = netCash(d);
  if (start === null) return [];
  const burn = monthlyBurn(d);
  const committed = d.costs.filter((c) => c.active && c.cadence === 'ONE-OFF');
  const uncommitted = d.pipeline.filter((i) => i.status === 'DESIGN' || i.status === 'SAMPLES');
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const out: ForecastMonth[] = [];
  let bank = start;
  for (let m = 0; m <= months; m++) {
    const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const fraction = m === 0 ? (daysInMonth - now.getDate()) / daysInMonth : 1;
    const label = `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}${m === 0 ? ' (REST)' : ''}`;
    const events: ForecastEvent[] = [];
    let productionOut = 0;
    if (m === 0) {
      for (const c of committed) {
        productionOut += c.amount;
        events.push({ text: `${c.name} PAID`, amount: -c.amount });
      }
    }
    for (const i of uncommitted) {
      if (etaMonthIndex(i) === m) {
        const cost = pipelineCost(i);
        productionOut += cost;
        events.push({ text: `${i.name} RUN COMMITTED`, amount: -cost });
      }
    }
    let pipelineIn = 0;
    for (const i of d.pipeline) {
      if (etaMonthIndex(i) + 1 === m) {
        const rev = Math.round(i.qty * i.retail * i.expectedSellThrough);
        pipelineIn += rev;
        events.push({ text: `${i.name} REVENUE @ ${Math.round(i.expectedSellThrough * 100)}% SELL-THRU`, amount: rev });
      }
    }
    const baselineIn = monthlyRevenue * fraction;
    const burnOut = burn * fraction;
    const net = baselineIn + pipelineIn - burnOut - productionOut;
    const closing = bank + net;
    out.push({ label, fraction, opening: bank, baselineIn, pipelineIn, burnOut, productionOut, net, closing, events });
    bank = closing;
  }
  return out;
}

export function forecastVerdict(fc: ForecastMonth[]): { tone: 'red' | 'amber' | 'green'; text: string } {
  if (!fc.length) return { tone: 'amber', text: 'CASH UNKNOWN — SYNC THE BANK OR ENTER A BALANCE' };
  const last = fc[fc.length - 1];
  const low = fc.reduce((min, m) => (m.closing < min.closing ? m : min), fc[0]);
  if (fc[0].opening < 0) {
    return { tone: 'red', text: `SHORT NOW — ${money(fc[0].opening)} NET OF CARD; ${money(low.closing)} BY ${low.label} AT THIS PACE` };
  }
  const dip = fc.find((m) => m.closing < 0);
  if (dip) {
    return { tone: 'red', text: `GOES NEGATIVE IN ${dip.label} — ${money(Math.abs(dip.closing))} SHORT` };
  }
  if (low.closing < fc[0].opening * 0.5) {
    return { tone: 'amber', text: `LOW POINT ${money(low.closing)} IN ${low.label}` };
  }
  return { tone: 'green', text: `SELF-FUNDING — LOW POINT ${money(low.closing)} IN ${low.label} · ${money(last.closing)} BY ${last.label}` };
}

// What a sellout means depends on intent. A limited run selling through is
// the plan working; a core item selling out needs a restock decision; an
// item with no policy set gets a neutral prompt to decide — not an alarm.
// Units sold are over the sync's sales window (Shopify: last 12 months).
export function soldOutNotice(p: Product): { tier: Tier; text: string; detail: string } {
  if (p.restockPolicy === 'LIMITED') {
    return { tier: 'green', text: `${p.name} SOLD OUT — LIMITED RUN COMPLETE`, detail: `${plural(p.soldTotal, 'unit')} sold in the last 12 months. No restock planned.` };
  }
  if (p.restockPolicy === 'REPLENISH') {
    return { tier: 'red', text: `${p.name} SOLD OUT — CORE ITEM`, detail: `${plural(p.soldTotal, 'unit')} sold in the last 12 months. Marked for replenishment: plan the next run.` };
  }
  return { tier: 'amber', text: `${p.name} SOLD OUT — RESTOCK OR RETIRE?`, detail: `${plural(p.soldTotal, 'unit')} sold in the last 12 months. No restock policy set for this product.` };
}

/** Out of stock and nothing sold in the sales window: a listing to tidy, not a sellout. */
const isStaleListing = (p: Product) => p.published && p.tracked !== false && p.stock === 0 && p.soldTotal === 0 && !p.restockPolicy;

// Notification rules — red = act now, amber = notable, green = context.
// Notices are derived from the snapshot, so they carry no clock time.
export function buildNotices(d: ParkData, m: Metrics): Notice[] {
  const out: Notice[] = [];
  let n = 0;
  const push = (tier: Notice['tier'], source: Notice['source'], text: string, detail: string, desk: string) =>
    out.push({ id: `n${n++}`, tier, source, text, detail, desk, time: '' });

  const stale: Product[] = [];
  for (const p of d.products) {
    if (!p.published || p.tracked === false) continue;
    if (isStaleListing(p)) {
      stale.push(p);
    } else if (p.stock === 0) {
      const sn = soldOutNotice(p);
      push(sn.tier, 'SHOP', sn.text, sn.detail, 'i');
    } else if (daysOfStock(p) < 5 && dailyVelocity(p) > 1) {
      push('amber', 'SHOP', `${p.name} STOCKOUT RISK — ${Math.floor(daysOfStock(p))} DAYS LEFT`, `${p.stock} units at ${dailyVelocity(p).toFixed(1)}/day velocity.`, 'i');
    }
  }
  if (stale.length) {
    push('green', 'SHOP', `${plural(stale.length, 'LISTING')} AT 0 STOCK WITH NO SALES IN 12 MONTHS`,
      `Archive or hide them in Shopify, or set a restock policy: ${stale.slice(0, 4).map((p) => p.name).join(', ')}${stale.length > 4 ? ` +${stale.length - 4} more` : ''}.`, 'i');
  }

  for (const c of d.campaigns) {
    const v = campaignVerdict(c, m.breakEvenRoas, d.targetRoas);
    if (v.tier === 'red') {
      push('red', 'ADS', `${c.name} BELOW BREAK-EVEN`, `ROAS ${(c.revenue / c.spend).toFixed(2)} vs break-even ${m.breakEvenRoas.toFixed(2)}. ${money(c.spend)} spent this period.`, 'a');
    }
    if (c.frequency > 4.5) {
      push('amber', 'ADS', `${c.name} AUDIENCE FATIGUE`, `Frequency ${c.frequency.toFixed(1)} — creative is wearing out.`, 'a');
    }
  }

  for (const p of d.products) {
    const prev = p.soldPrev7d / 7;
    const v = dailyVelocity(p);
    if (prev > 1 && v > prev * 1.4) {
      push('green', 'SHOP', `${p.name} VELOCITY +${Math.round((v / prev - 1) * 100)}% WoW`, 'Selling faster than last week.', 'i');
    }
  }

  for (const i of d.pipeline) {
    if (i.status === 'READY') {
      push('green', 'BUSINESS', `READY TO LAUNCH: ${i.name}`, `${i.qty} units · ${money(pipelineNet(i))} net potential. List it on the shop.`, 'p');
    }
  }

  // store location stock rules
  for (const c of d.channels) {
    if (c.type === 'ONLINE') continue;
    const st = channelStats(c, d.products);
    for (const r of st.rows) {
      if (r.sellThrough >= 0.85 && r.allocated >= 10 && r.product.restockPolicy !== 'LIMITED') {
        push('green', 'SHOP', `${c.name}: ${r.product.name} NEARLY SOLD THROUGH`, `${r.sold}/${r.allocated} units sold — ship a restock while it's hot.`, 'l');
      } else if (r.onHand >= 15 && r.sellThrough < 0.3) {
        push('amber', 'SHOP', `${c.name}: ${r.product.name} SITTING ON SHELF`, `${r.onHand} units on hand, ${Math.round(r.sellThrough * 100)}% sold. Swap the display or pull stock back.`, 'l');
      }
    }
  }

  for (const q of d.quests) {
    if (q.current >= q.target) {
      push('green', 'BUSINESS', `GOAL REACHED: ${q.goal}`, 'Target met.', 's');
    } else if (q.daysLeft <= 3 && q.current / q.target < 0.85) {
      push('amber', 'BUSINESS', `GOAL AT RISK: ${q.goal}`, `${Math.round((q.current / q.target) * 100)}% with ${q.daysLeft} days left.`, 's');
    }
  }

  if (m.revenueDeltaPct !== null && m.revenueDeltaPct > 10) {
    push('green', 'BUSINESS', `REVENUE +${m.revenueDeltaPct.toFixed(0)}% VS PREVIOUS PERIOD`, 'Sales are up on the previous period.', 's');
  }

  // synced bank accounts
  for (const a of d.accounts ?? []) {
    if (a.kind !== 'CARD' && a.balance < 0) {
      push('red', 'BUSINESS', `${a.name} ••${a.mask} OVERDRAWN`, `Balance ${money(a.balance, { cents: true })} as of ${a.asOf.slice(0, 10)}. Overdraft fees apply to each item that clears while negative.`, 'c');
    }
  }
  const owed = cardOwed(d);
  const cash = netCash(d);
  if (owed !== null && owed > 0) {
    const short = cash !== null && cash < 0;
    push(short ? 'red' : 'amber', 'BUSINESS', `CARD OWES ${money(owed, { cents: true })}`,
      short
        ? `More than the cash on hand: net of the card you are ${money(cash, { cents: true })}. The card balance is already-spent money.`
        : `Net of the card, cash is ${money(cash, { cents: true })}.`, 'c');
  }

  // cost / runway rules
  const runway = runwayMonths(d);
  const burn = monthlyBurn(d);
  if (runway === null) {
    if (burn > 0) push('amber', 'BUSINESS', 'CASH POSITION UNKNOWN', `Monthly burn ${money(burn)}, but no bank balance: sync the bank or enter it on the costs desk.`, 'c');
  } else if (runway === 0 && cash !== null && cash < 0) {
    // the overdrawn / card notices above already say it; no second "0.0 months"
  } else if (runway < 6) {
    push('red', 'BUSINESS', `RUNWAY ${runway.toFixed(1)} MONTHS`, `Monthly burn ${money(burn)} against ${money(cash)} net cash. Cut costs or move units.`, 'c');
  } else if (runway < 12) {
    push('amber', 'BUSINESS', `RUNWAY ${runway.toFixed(1)} MONTHS`, `Monthly burn ${money(burn)}. Comfortable, but watch fixed costs.`, 'c');
  }
  const subs = d.costs.filter((c) => c.category === 'SUBSCRIPTION');
  const inactiveSubs = subs.filter((c) => !c.active);
  for (const s of inactiveSubs) {
    push('green', 'BUSINESS', `PAUSED SUBSCRIPTION: ${s.name}`, `Would add ${money(s.amount)}/mo if reactivated.`, 'c');
  }

  // forward cash-flow — baseline = trailing 30d revenue
  const fv = forecastVerdict(forecastCashflow(d, trailing30dRevenue(d), 6));
  if (fv.tone === 'red') {
    push('red', 'BUSINESS', `CASH FORECAST: ${fv.text}`, 'Net cash (bank minus card), then 30-day sales pace in, monthly burn out, plus committed production.', 'c');
  } else if (fv.tone === 'amber' && runway !== null) {
    push('amber', 'BUSINESS', `CASH FORECAST: ${fv.text}`, 'No negative month, but cash takes a real dip. Time the next run carefully.', 'c');
  }

  const order = { red: 0, amber: 1, green: 2 } as const;
  return out.sort((a, b) => order[a.tier] - order[b.tier]);
}

// ── Top moves — the 3 highest-dollar actions right now ────────────────────
// Same signals as notices/insights, but ranked by money so a solo operator
// knows what to do first.

export interface Move {
  id: string;
  tier: Tier;
  text: string;
  detail: string;
  impact: number;   // dollars at stake (savings, recoverable, or expected)
  desk: string;
}

export function buildMoves(d: ParkData, m: Metrics, monthlyRevenue: number): Move[] {
  const out: Move[] = [];
  let n = 0;
  const push = (tier: Tier, text: string, detail: string, impact: number, desk: string) =>
    out.push({ id: `mv${n++}`, tier, text, detail, impact, desk });

  for (const c of d.campaigns) {
    const v = campaignVerdict(c, m.breakEvenRoas, d.targetRoas);
    if (v.tier === 'red') {
      push('red', `PAUSE ${c.name}`, `ROAS ${(c.revenue / c.spend).toFixed(2)} vs break-even ${m.breakEvenRoas.toFixed(2)} — stop the bleed`, c.spend, 'a');
    }
  }

  for (const p of d.products) {
    if (p.published && p.stock === 0 && p.sold7d > 0 && p.restockPolicy === 'REPLENISH') {
      push('red', `RESTOCK ${p.name}`, `core item, was moving ${plural(p.sold7d, 'unit')}/wk before selling out`, p.price * p.sold7d, 'i');
    }
  }

  for (const i of d.pipeline.filter((x) => x.status === 'READY')) {
    const rev = Math.round(i.qty * i.retail * i.expectedSellThrough);
    push('green', `LAUNCH ${i.name}`, `${i.qty} units paid for — list it and collect`, rev, 'p');
  }

  for (const c of d.channels) {
    if (c.type === 'ONLINE') continue;
    const st = channelStats(c, d.products);
    for (const r of st.rows) {
      if (r.sellThrough >= 0.85 && r.allocated >= 10 && r.product.restockPolicy !== 'LIMITED') {
        push('amber', `SHIP ${r.product.name} TO ${c.name}`, `${r.sold}/${r.allocated} sold — shelf nearly empty`, r.product.price * r.sold, 'l');
      }
    }
  }

  const fc = forecastCashflow(d, monthlyRevenue, 6);
  if (fc.length) {
    const hasUncommitted = d.pipeline.some((i) => i.status === 'DESIGN' || i.status === 'SAMPLES');
    const lever = hasUncommitted ? 'delay a production run, cut spend or bring sales forward' : 'cut spend or bring sales forward';
    const owed = cardOwed(d);
    if (fc[0].opening < 0) {
      push('red', 'CASH IS SHORT NOW',
        `${money(fc[0].opening)} net of ${owed ? `the ${money(owed)} card balance` : 'debts'}; overdraft fees keep landing until it's back above zero — ${lever}`,
        Math.abs(Math.round(fc[0].opening)), 'c');
    } else {
      const dip = fc.find((x) => x.closing < 0);
      if (dip) push('red', `COVER ${dip.label} SHORTFALL`, `cash goes negative at the current sales pace and burn — ${lever}`, Math.abs(Math.round(dip.closing)), 'c');
    }
  }

  // Slowest stock with the most money in it. Impact = cash at 50% off if it
  // all sold — an upper bound, so the detail says what it really clears.
  const slow = d.products
    .filter((p) => p.published && isSlowStock(p))
    .sort((a, b) => b.stock * b.price - a.stock * a.price)[0];
  if (slow) {
    const atHalf = Math.round(slow.stock * slow.price * 0.5);
    const overCost = slow.unitCost !== null ? Math.round(slow.stock * (slow.price * 0.5 - slow.unitCost)) : null;
    const mos = monthsOfStock(slow);
    push('amber', `CLEAR ${slow.name}`,
      `${slow.stock} in stock, ${plural(slow.soldTotal, 'sale')} in 12 months${mos !== null ? ` (~${Math.round(mos)} months of stock)` : ''}. ` +
      `50% off brings in up to ${money(atHalf)}${overCost !== null ? ` — ${overCost >= 0 ? `${money(overCost)} over cost` : `${money(Math.abs(overCost))} below cost`}` : ''}, only if they sell`,
      atHalf, 'i');
  }

  return out.sort((a, b) => b.impact - a.impact).slice(0, 3);
}

// ── Sync delta — what changed between two park-data snapshots ─────────────

export interface SyncDelta {
  revenue: number;
  orders: number;
  /** null when the new days carry no ad spend (ads not connected) */
  spend: number | null;
  events: string[];
}

export function diffSnapshots(prev: ParkData, next: ParkData): SyncDelta {
  // New days count in full; a day both syncs cover (usually the partial last
  // day) counts only what changed, so late orders aren't missed.
  const prevByDate = new Map(prev.days.map((x) => [x.date, x]));
  const fresh = next.days.flatMap((x) => {
    const before = prevByDate.get(x.date);
    if (!before) return [x];
    const dRev = x.revenue - before.revenue;
    const dOrd = x.orders - before.orders;
    if (dRev === 0 && dOrd === 0) return [];
    return [{
      ...x,
      revenue: dRev,
      orders: dOrd,
      ...(typeof x.spend === 'number' && typeof before.spend === 'number' ? { spend: x.spend - before.spend } : { spend: undefined }),
    }];
  });
  const events: string[] = [];
  for (const p of next.products) {
    const before = prev.products.find((q) => q.id === p.id);
    if (!before) events.push(`NEW PRODUCT: ${p.name}`);
    else if (before.stock > 0 && p.stock === 0 && p.published) events.push(`${p.name} SOLD OUT`);
  }
  for (const i of next.pipeline) {
    const before = prev.pipeline.find((q) => q.id === i.id);
    if (!before) events.push(`NEW PRODUCTION RUN: ${i.name}`);
    else if (before.status !== i.status) events.push(`${i.name}: ${before.status} → ${i.status}`);
  }
  return {
    revenue: fresh.reduce((s, x) => s + x.revenue, 0),
    orders: fresh.reduce((s, x) => s + x.orders, 0),
    spend: measuredSpend(fresh),
    events,
  };
}

// ── Insights — cross-data-point observations ──────────────────────────────
// Rule-based, deliberately simple: each rule reads several parts of ParkData
// and says one true thing. Red = money at risk, amber = worth a look,
// green = working as intended.

export interface Insight {
  id: string;
  tier: Tier;
  text: string;
  detail: string;
}

export interface GrowthPlan {
  currentRetail: number;      // retail value of everything under construction
  targetPct: number;
  targetRetail: number;       // currentRetail × (1 + pct)
  deltaRetail: number;
  estCost: number;            // targetRetail × (1 − grossMargin)
  estUnits: number;           // targetRetail ÷ blended pipeline retail price
  expectedNet: number;        // at blended expected sell-through
  /** estCost ≤ lowest forecast closing; null when cash is unknown or there's no pipeline to grow from. */
  fundable: boolean | null;
  lowPoint: number | null;    // lowest forecast closing; null when cash is unknown
  lowPointLabel: string;
}

export function growthPlan(d: ParkData, monthlyRevenue: number): GrowthPlan {
  const currentRetail = d.pipeline.reduce((s, i) => s + pipelineGross(i), 0);
  const targetPct = d.growthTargetPct;
  const targetRetail = Math.round(currentRetail * (1 + targetPct / 100));
  const blendedPrice = d.pipeline.length
    ? d.pipeline.reduce((s, i) => s + i.retail, 0) / d.pipeline.length
    : 50;
  const blendedSellThrough = d.pipeline.length
    ? d.pipeline.reduce((s, i) => s + i.expectedSellThrough, 0) / d.pipeline.length
    : 0.7;
  const estCost = Math.round(targetRetail * (1 - d.grossMargin));
  const fc = forecastCashflow(d, monthlyRevenue, 6);
  const low = fc.length ? fc.reduce((min, m) => (m.closing < min.closing ? m : min), fc[0]) : null;
  return {
    currentRetail,
    targetPct,
    targetRetail,
    deltaRetail: targetRetail - currentRetail,
    estCost,
    estUnits: Math.round(targetRetail / (blendedPrice || 1)),
    expectedNet: Math.round(targetRetail * blendedSellThrough - estCost),
    fundable: low && currentRetail > 0 ? estCost <= low.closing : null,
    lowPoint: low ? low.closing : null,
    lowPointLabel: low ? low.label : '—',
  };
}

export function buildInsights(d: ParkData, m: Metrics, monthlyRevenue: number): Insight[] {
  const out: Insight[] = [];
  let n = 0;
  const push = (tier: Tier, text: string, detail: string) => out.push({ id: `i${n++}`, tier, text, detail });

  // 1. forecast verdict
  const fv = forecastVerdict(forecastCashflow(d, monthlyRevenue, 6));
  push(fv.tone === 'green' ? 'green' : fv.tone, `SIX-MONTH CASH: ${fv.text}`, 'From net cash (bank minus card): 30-day sales pace in, burn + committed runs out, expected pipeline revenue.');

  // 2. what actually weighs on burn
  const cats = burnByCategory(d).filter((c) => c.category !== 'PRODUCTION');
  const recurringTotal = cats.reduce((s, c) => s + c.monthly, 0);
  const heaviest = cats.reduce((a, b) => (b.monthly > a.monthly ? b : a), cats[0]);
  if (heaviest && recurringTotal > 0 && heaviest.monthly / recurringTotal > 0.5) {
    push('amber', `${heaviest.category} IS ${Math.round((heaviest.monthly / recurringTotal) * 100)}% OF RECURRING BURN`, 'Cutting subscriptions will not move runway — this category will.');
  }

  // 3. dead stock with real money stuck in it
  const dead = d.products
    .filter((p) => p.published && isSlowStock(p))
    .sort((a, b) => b.stock * b.price - a.stock * a.price)[0];
  if (dead) {
    const months = monthsOfStock(dead);
    const atCost = dead.unitCost !== null ? ` (${money(dead.stock * dead.unitCost)} at cost)` : '';
    push('amber', `${money(dead.stock * dead.price)} RETAIL SITTING IN ${dead.name}`,
      `${dead.stock} units${atCost}${months !== null ? ` · ~${Math.round(months)} months of stock at the 12-month pace` : ' · no sales in 12 months'}. A bundle or archive sale turns some of it into cash.`);
  }

  // 4. ready runs are unclaimed money
  const ready = d.pipeline.filter((i) => i.status === 'READY');
  if (ready.length > 0) {
    const expected = ready.reduce((s, i) => s + Math.round(i.qty * i.retail * i.expectedSellThrough), 0);
    push('green', `${ready.length} RUN${ready.length > 1 ? 'S' : ''} READY — ~${money(expected)} EXPECTED AT LAUNCH`,
      ready.map((i) => i.name).join(' · ') + '. Listing costs nothing; the stock is already paid for.');
  }

  // 5. budget discipline — recurring burn vs the annual budget's monthly allowance
  if (d.annualBudget > 0) {
    const allowance = d.annualBudget / 12;
    const burnNow = monthlyBurn(d);
    if (burnNow > allowance) {
      push(burnNow > allowance * 1.15 ? 'red' : 'amber',
        `BURN ${Math.round((burnNow / allowance) * 100)}% OF BUDGET ALLOWANCE`,
        `${money(burnNow)}/mo recurring vs ${money(allowance)}/mo allowed (${money(d.annualBudget)}/yr). One-off production runs don't count against this — this is the fixed base creeping.`);
    } else {
      push('green', `BUDGET HOLDING — ${money(allowance - burnNow)}/MO OF HEADROOM`,
        `Recurring burn ${money(burnNow)} vs ${money(allowance)} allowance. Headroom is where the next production run comes from.`);
    }
  }

  // 6. ads below break-even
  const pit = d.campaigns.find((c) => campaignVerdict(c, m.breakEvenRoas, d.targetRoas).tier === 'red');
  if (pit) {
    push('red', `PAUSING ${pit.name} SAVES ~${money(pit.spend)} PERIOD EQUIV`, `ROAS ${(pit.revenue / pit.spend).toFixed(2)} vs break-even ${m.breakEvenRoas.toFixed(2)}.`);
  }

  // 7. consignment engine — when stockists carry the brand, shelf health = revenue
  const onlineRev = d.channels.filter((c) => c.type === 'ONLINE').reduce((s, c) => s + c.revenue, 0);
  const partnerRev = d.channels.filter((c) => c.type !== 'ONLINE').reduce((s, c) => s + c.revenue, 0);
  const partnerShare = partnerRev / (onlineRev + partnerRev || 1);
  if (partnerShare > 0.5) {
    push('amber', `STOCKISTS DRIVE ${Math.round(partnerShare * 100)}% OF REVENUE`,
      'Partner register sales, not money received. Keep statements and payments current — that IS the business.');
  }

  // 8. stockist divergence — where to send the next box
  const stockists = d.channels.filter((c) => c.type !== 'ONLINE');
  if (stockists.length >= 2) {
    const ranked = stockists
      .map((c) => ({ c, st: channelStats(c, d.products) }))
      .sort((a, b) => b.st.sellThrough - a.st.sellThrough);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.st.sellThrough - worst.st.sellThrough > 0.25) {
      push('amber', `${best.c.name} SELLS AT ${Math.round(best.st.sellThrough * 100)}%, ${worst.c.name} AT ${Math.round(worst.st.sellThrough * 100)}%`,
        'Shift the next allocation toward the shelf that moves it.');
    }
  }

  // 9. growth target feasibility
  const plan = growthPlan(d, monthlyRevenue);
  if (plan.fundable === false) {
    push('red', `GROWTH TARGET NOT FUNDABLE AT +${plan.targetPct}%`,
      `${money(plan.estCost)} production cost vs low point ${money(plan.lowPoint)} in ${plan.lowPointLabel}. Lower the target or stage the runs.`);
  } else if (plan.fundable === true) {
    push('green', `+${plan.targetPct}% PRODUCTION TARGET IS FUNDABLE`,
      `${money(plan.estCost)} cost clears the forecast low point (${money(plan.lowPoint)} in ${plan.lowPointLabel}).`);
  }

  const order = { red: 0, amber: 1, green: 2 } as const;
  return out.sort((a, b) => order[a.tier] - order[b.tier]).slice(0, 6);
}
