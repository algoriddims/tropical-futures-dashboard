// ── Stock desk figures ─────────────────────────────────────────────────────
// Pure functions over the snapshot for the Stock desk: when each selling size
// runs out (with stock on the way), which sizes sell, and where the money tied
// up in stock sits. Pace and the sales-at-risk estimate come from stockRisk in
// metrics.ts, so this page and the "look into" list agree.

import type { AnalyticsSnapshot, StockPlan, VariantRecord } from './types';
import type { DayRange, Ymd } from './period';
import { addDays, coverage, inRange, todayIn } from './period';
import type { ProductPerf } from './metrics';
import { coverWindow, sizeKey, sizeOf, sortSizes, stockPosition, stockRisk } from './metrics';

// ── runway: when each selling size runs out ─────────────────────────────────

/** A stretch of days from the stock read, [from, to): sold from stock in hand, from stock on the way, or short. */
export interface Segment { kind: 'hand' | 'incoming' | 'short'; from: number; to: number }

export interface RunwayRow {
  key: string;
  productId: string;
  variantId: string;
  product: string;
  /** Size, colour or variant title; null for a product with one variant. */
  variant: string | null;
  sellable: number;
  /** Net units sold in the 28 days before the stock read (all channels). */
  unitsInWindow: number;
  dailyPace: number;
  runsOutOn: Ymd;
  reorderBy: Ymd | null;
  /** Arrivals counted (future-dated), as days after the stock read. */
  arrivals: { date: Ymd; day: number; units: number; note?: string }[];
  /** Day-by-day outlook over the chart horizon, merged into stretches. */
  segments: Segment[];
  /** First day (1-based) without enough stock, or null if none within the horizon. */
  firstShortDay: number | null;
  /** From stockRisk: sales at risk over the next 28 days, minor units. */
  atRisk: number;
  gapDays28: number;
}

export interface Runway {
  asOf: Ymd;
  horizonDays: number;
  leadDays: number | null;
  rows: RunwayRow[];
  /** Variants that sold in the window but fewer than minUnits times: too few to project. */
  thin: { label: string; units: number }[];
}

const variantLabel = (v: VariantRecord, siblings: number): string | null => {
  if (siblings <= 1 && (v.variantTitle === 'Default Title' || !v.options.length)) return null;
  return sizeOf(v) ?? v.options.find((o) => /^colou?r$/i.test(o.name))?.value ?? v.variantTitle;
};

/**
 * Day-by-day: stock in hand is sold first, then dated arrivals. A day is
 * "short" when stock can't meet that day's demand at the pace (the same rule
 * as stockRisk's gap days).
 */
export function stockSegments(sellable: number, pace: number, arrivals: { day: number; units: number }[], horizonDays: number): Segment[] {
  const out: Segment[] = [];
  let hand = Math.max(0, sellable);
  let inc = 0;
  for (let i = 1; i <= horizonDays; i++) {
    for (const a of arrivals) if (a.day === i) inc += a.units;
    let kind: Segment['kind'];
    if (hand >= pace) { kind = 'hand'; hand -= pace; }
    else if (hand + inc >= pace) { kind = 'incoming'; inc -= pace - hand; hand = 0; }
    else { kind = 'short'; hand = 0; inc = 0; }
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.to = i;
    else out.push({ kind, from: i - 1, to: i });
  }
  return out;
}

export function runway(s: AnalyticsSnapshot, products: ProductPerf[], plan: StockPlan, horizonDays = 84, minUnits = 2): Runway | null {
  if (!s.timezone) return null;
  const asOf = todayIn(s.timezone, new Date(s.inventoryAsOf));
  const leadDays = plan.leadTimeWeeks && plan.leadTimeWeeks > 0 ? Math.round(plan.leadTimeWeeks * 7) : null;
  const rows: RunwayRow[] = [];
  const thin: Runway['thin'] = [];
  for (const p of products) {
    if (!p.inCatalog) continue;
    for (const vp of p.variants) {
      const r = stockRisk(s, vp.variant, plan, p.variants.length);
      if (!r) continue;
      const label = variantLabel(vp.variant, p.variants.length);
      if (vp.cover.unitsInWindow < minUnits) {
        thin.push({ label: label ? `${p.title} · ${label}` : p.title, units: vp.cover.unitsInWindow });
        continue;
      }
      const arrivals = r.arrivals.map((a) => ({ date: a.expectedDate, day: Math.round((Date.parse(`${a.expectedDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000), units: a.units, note: a.note }));
      const segments = stockSegments(r.sellable, r.dailyPace, arrivals, horizonDays);
      const short = segments.find((x) => x.kind === 'short');
      rows.push({
        key: vp.variant.variantId, productId: p.productId, variantId: vp.variant.variantId, product: p.title, variant: label,
        sellable: r.sellable, unitsInWindow: vp.cover.unitsInWindow, dailyPace: r.dailyPace, runsOutOn: r.runsOutOn, reorderBy: r.reorderBy,
        arrivals, segments, firstShortDay: short ? short.from + 1 : null, atRisk: r.atRisk, gapDays28: r.gapDays,
      });
    }
  }
  rows.sort((a, b) => (a.firstShortDay ?? Infinity) - (b.firstShortDay ?? Infinity) || b.atRisk - a.atRisk || a.product.localeCompare(b.product));
  thin.sort((a, b) => a.label.localeCompare(b.label));
  return { asOf, horizonDays, leadDays, rows, thin };
}

// ── size curve: which sizes sell vs what's on the shelf ─────────────────────

export interface SizeCurve {
  type: string;
  sizes: { size: string; sold: number; stock: number }[];
  soldTotal: number;
  stockTotal: number;
}

export interface SizeCurves {
  window: DayRange | null;
  /** Days of the window the sales data covers. */
  covered: number;
  total: number;
  curves: SizeCurve[];
}

/**
 * Net units sold per size over `days` complete days before the stock read,
 * by product type, next to sellable stock per size now. Sizes are grouped by
 * their canonical spelling (Small = S). Types without sizes are left out.
 */
export function sizeCurves(s: AnalyticsSnapshot, days = 365): SizeCurves {
  const w = coverWindow(s, days);
  const byType = new Map<string, Map<string, { sold: number; stock: number }>>();
  const sizeOfVariant = new Map<string, { type: string; size: string }>();
  for (const v of s.variants) {
    const sz = sizeOf(v);
    if (!sz || v.isBundle) continue;
    const size = sizeKey(sz);
    sizeOfVariant.set(v.variantId, { type: v.productType || 'Other', size });
    const t = byType.get(v.productType || 'Other') ?? new Map();
    const cell = t.get(size) ?? { sold: 0, stock: 0 };
    if (v.tracked) cell.stock += stockPosition(v).sellable;
    t.set(size, cell);
    byType.set(v.productType || 'Other', t);
  }
  if (w) {
    for (const r of s.variantDaily) {
      if (!inRange(r.date, w)) continue;
      const k = sizeOfVariant.get(r.variantId);
      if (!k) continue;
      byType.get(k.type)!.get(k.size)!.sold += r.netItems;
    }
  }
  const curves: SizeCurve[] = [...byType.entries()].map(([type, m]) => {
    const sizes = sortSizes([...m.keys()]).map((size) => ({ size, sold: Math.max(0, m.get(size)!.sold), stock: m.get(size)!.stock }));
    return { type, sizes, soldTotal: sizes.reduce((n, x) => n + x.sold, 0), stockTotal: sizes.reduce((n, x) => n + x.stock, 0) };
  }).filter((c) => c.sizes.length > 1).sort((a, b) => b.soldTotal - a.soldTotal || b.stockTotal - a.stockTotal || a.type.localeCompare(b.type));
  const cov = w ? coverage(w, s.salesCoverage) : { covered: 0, total: 0 };
  return { window: w, covered: cov.covered, total: cov.total, curves };
}

// ── shelf value: money tied up in stock ─────────────────────────────────────

export interface ShelfRow {
  productId: string;
  title: string;
  units: number;
  /** Sellable units × recorded unit cost, minor units, over the units that have a cost. */
  atCost: number;
  unitsNoCost: number;
  /** Net units sold in the window before the stock read. */
  soldInWindow: number;
  lastSale: Ymd | null;
}

export interface ShelfValue {
  window: DayRange | null;
  covered: number;
  total: number;
  rows: ShelfRow[];
  units: number;
  atCost: number;
  unitsNoCost: number;
  /** Products with stock and no net sales in the window. */
  idleAtCost: number;
  idleUnits: number;
}

export function shelfValue(s: AnalyticsSnapshot, days = 90): ShelfValue {
  const w = coverWindow(s, days);
  const by = new Map<string, ShelfRow>();
  for (const v of s.variants) {
    if (v.isBundle || !v.tracked) continue;
    const n = stockPosition(v).sellable;
    const row = by.get(v.productId) ?? { productId: v.productId, title: v.productTitle, units: 0, atCost: 0, unitsNoCost: 0, soldInWindow: 0, lastSale: null };
    row.units += n;
    if (v.unitCost === null) row.unitsNoCost += n;
    else row.atCost += n * v.unitCost;
    by.set(v.productId, row);
  }
  for (const r of s.variantDaily) {
    const row = by.get(r.productId);
    if (!row || r.netItems <= 0) continue;
    if (w && inRange(r.date, w)) row.soldInWindow += r.netItems;
    if (!w || r.date <= w.to) row.lastSale = !row.lastSale || r.date > row.lastSale ? r.date : row.lastSale;
  }
  const rows = [...by.values()].filter((r) => r.units > 0).sort((a, b) => b.atCost - a.atCost || b.units - a.units || a.title.localeCompare(b.title));
  const idle = rows.filter((r) => r.soldInWindow <= 0);
  const cov = w ? coverage(w, s.salesCoverage) : { covered: 0, total: 0 };
  return {
    window: w, covered: cov.covered, total: cov.total, rows,
    units: rows.reduce((n, r) => n + r.units, 0),
    atCost: rows.reduce((n, r) => n + r.atCost, 0),
    unitsNoCost: rows.reduce((n, r) => n + r.unitsNoCost, 0),
    idleAtCost: idle.reduce((n, r) => n + r.atCost, 0),
    idleUnits: idle.reduce((n, r) => n + r.units, 0),
  };
}

/** Day offset → date, for chart labels. */
export const dayToDate = (asOf: Ymd, day: number): Ymd => addDays(asOf, day);

/**
 * Split `units` across sizes in proportion to units sold (largest remainder,
 * so the parts add up to `units`). Null when nothing sold — no basis.
 */
export function splitBySales(curve: SizeCurve, units: number): { size: string; units: number }[] | null {
  if (curve.soldTotal <= 0 || units <= 0) return null;
  const raw = curve.sizes.map((x) => ({ size: x.size, exact: (x.sold / curve.soldTotal) * units }));
  const out = raw.map((x) => ({ size: x.size, units: Math.floor(x.exact), rem: x.exact - Math.floor(x.exact) }));
  let left = units - out.reduce((n, x) => n + x.units, 0);
  for (const x of [...out].sort((a, b) => b.rem - a.rem)) { if (left <= 0) break; x.units += 1; left -= 1; }
  return out.map(({ size, units: u }) => ({ size, units: u }));
}

// ── stock age: new → aged → last call → archive (sample sale), or timeless ──

export type AgeBand = 'NEW' | 'AGED' | 'LAST_CALL' | 'ARCHIVE' | 'TIMELESS' | 'UNKNOWN';

/** Day thresholds, from the date the product went up on the webstore. */
export const AGE_BANDS: { band: Exclude<AgeBand, 'TIMELESS' | 'UNKNOWN'>; from: number; label: string; range: string }[] = [
  { band: 'NEW', from: 0, label: 'New', range: 'under 6 months' },
  { band: 'AGED', from: 180, label: 'Aged', range: '6–9 months' },
  { band: 'LAST_CALL', from: 270, label: 'Last call', range: '9–12 months' },
  { band: 'ARCHIVE', from: 360, label: 'Archive · sample sale', range: '12 months +' },
];
export const BAND_ORDER: AgeBand[] = ['NEW', 'AGED', 'LAST_CALL', 'ARCHIVE', 'TIMELESS', 'UNKNOWN'];

export function ageBand(ageDays: number | null, timeless: boolean): AgeBand {
  if (timeless) return 'TIMELESS';
  if (ageDays === null) return 'UNKNOWN';
  let b: AgeBand = 'NEW';
  for (const x of AGE_BANDS) if (ageDays >= x.from) b = x.band;
  return b;
}

export interface AgeRow {
  productId: string;
  title: string;
  /** Webstore publish date (business timezone), null when never published to the online store. */
  published: Ymd | null;
  ageDays: number | null;
  band: AgeBand;
  units: number;
  /** Sellable units × unit cost over the units with a recorded cost (minor units). */
  atCost: number;
  unitsNoCost: number;
  /** Sellable units × current price (minor units). */
  atRetail: number;
  /** Lowest and highest recorded unit cost / price across the product's variants (minor units). */
  unitCost: number | null;
  price: number;
  /** Net sales (minor units) in the 90 days before the stock read. */
  sales90: number;
  lastSale: Ymd | null;
  /** The day it moves into the next band (null for archive, timeless or unknown). */
  nextBandOn: Ymd | null;
  nextBand: AgeBand | null;
}

export interface BandTotal { band: AgeBand; products: number; units: number; atCost: number; atRetail: number; sales90: number }

export interface StockAge {
  asOf: Ymd;
  rows: AgeRow[];
  bands: BandTotal[];
  units: number;
  atCost: number;
  sales90: number;
  /** Products that move into the archive band within `soonDays` (still in stock). */
  archiveSoon: AgeRow[];
  soonDays: number;
}

const daysBetween = (a: Ymd, b: Ymd) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Age of each product in stock, from its webstore publish date to the stock
 * read. A restock doesn't reset it and re-publishing does: it is the age of
 * the design on the webstore, not of the units on the shelf. Timeless
 * products (marked by the owner) never age. Products with no publish date are
 * UNKNOWN, not new.
 */
export function stockAge(s: AnalyticsSnapshot, timeless: readonly string[] = [], soonDays = 30): StockAge | null {
  if (!s.timezone) return null;
  const tz = s.timezone;
  const asOf = todayIn(tz, new Date(s.inventoryAsOf));
  const w90 = coverWindow(s, 90);
  const marked = new Set(timeless);
  const by = new Map<string, AgeRow>();
  for (const v of s.variants) {
    if (v.isBundle || !v.tracked) continue;
    const n = stockPosition(v).sellable;
    let row = by.get(v.productId);
    if (!row) {
      const published = v.productPublishedAt ? todayIn(tz, new Date(v.productPublishedAt)) : null;
      const ageDays = published ? Math.max(0, daysBetween(published, asOf)) : null;
      const band = ageBand(ageDays, marked.has(v.productId));
      const next = band === 'NEW' || band === 'AGED' || band === 'LAST_CALL' ? AGE_BANDS[AGE_BANDS.findIndex((x) => x.band === band) + 1] : null;
      row = {
        productId: v.productId, title: v.productTitle, published, ageDays, band, units: 0, atCost: 0, unitsNoCost: 0, atRetail: 0,
        unitCost: null, price: v.price, sales90: 0, lastSale: null,
        nextBandOn: next && published ? addDays(published, next.from) : null, nextBand: next?.band ?? null,
      };
      by.set(v.productId, row);
    }
    row.units += n;
    row.atRetail += n * v.price;
    row.price = Math.max(row.price, v.price);
    if (v.unitCost === null) row.unitsNoCost += n;
    else { row.atCost += n * v.unitCost; row.unitCost = Math.max(row.unitCost ?? 0, v.unitCost); }
  }
  for (const r of s.variantDaily) {
    const row = by.get(r.productId);
    if (!row) continue;
    if (w90 && inRange(r.date, w90)) row.sales90 += r.netSales;
    if (r.netItems > 0 && (!w90 || r.date <= w90.to)) row.lastSale = !row.lastSale || r.date > row.lastSale ? r.date : row.lastSale;
  }
  const rows = [...by.values()].filter((r) => r.units > 0)
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1) || a.title.localeCompare(b.title));
  // bands in display order; sales share includes products sold out now (their sales still tell which ages sell)
  const salesBy = new Map<AgeBand, number>();
  for (const r of by.values()) salesBy.set(r.band, (salesBy.get(r.band) ?? 0) + r.sales90);
  const bands: BandTotal[] = BAND_ORDER.map((band) => {
    const xs = rows.filter((r) => r.band === band);
    return {
      band, products: xs.length, units: xs.reduce((n, r) => n + r.units, 0), atCost: xs.reduce((n, r) => n + r.atCost, 0),
      atRetail: xs.reduce((n, r) => n + r.atRetail, 0), sales90: Math.max(0, salesBy.get(band) ?? 0),
    };
  }).filter((b) => b.units > 0 || b.sales90 > 0);
  const soonTo = addDays(asOf, soonDays);
  return {
    asOf, rows, bands,
    units: rows.reduce((n, r) => n + r.units, 0),
    atCost: rows.reduce((n, r) => n + r.atCost, 0),
    sales90: bands.reduce((n, b) => n + b.sales90, 0),
    archiveSoon: rows.filter((r) => r.nextBand === 'ARCHIVE' && r.nextBandOn !== null && r.nextBandOn <= soonTo).sort((a, b) => a.nextBandOn!.localeCompare(b.nextBandOn!)),
    soonDays,
  };
}
