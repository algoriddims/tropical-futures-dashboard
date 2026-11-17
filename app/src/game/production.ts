// ── Production runs ───────────────────────────────────────────────────────
// A run is one supplier order: what it costs (and what's been paid), where it
// is (sampling → bulk → shipping → received), how it ships (tracking), and
// where the files are. Runs are the owner's records — typed in on the
// production desk or pasted in from a Claude session — and are saved with the
// other manual entries, never taken from a sync.
//
// The money in a run feeds the cash forecast (unpaid costs on their due
// dates), its goods lines feed stock on the way (when linked to a Shopify
// product and an arrival date is known), and its dates feed the "look into"
// list (late stages, payments coming due). Pure functions; dollars in, sums
// in cents.

import { z } from 'zod';
import { addDays } from '../analytics/period';
import type { Ymd } from '../analytics/period';
import type { IncomingStock } from '../analytics/types';

// No eval (the hosted page's CSP forbids it); set before any schema is built.
z.config({ jitless: true });

export const STAGES = [
  { key: 'SAMPLES_ORDERED', label: 'Samples ordered' },
  { key: 'SAMPLES_RECEIVED', label: 'Samples in hand' },
  { key: 'SAMPLES_APPROVED', label: 'Samples approved' },
  { key: 'BULK_ORDERED', label: 'Bulk ordered' },
  { key: 'BULK_FINISHED', label: 'Bulk finished' },
  { key: 'SHIPPED', label: 'Shipped' },
  { key: 'RECEIVED', label: 'Received' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];

export type CostKind = 'GOODS' | 'SAMPLES' | 'FREIGHT' | 'DUTIES' | 'OTHER';
export type ShipMode = 'SEA' | 'AIR' | 'COURIER' | 'OTHER';

export interface RunCost {
  id: string;
  kind: CostKind;
  description: string;
  /** Goods and samples: units × unit price. Other kinds use `amount`. */
  units: number | null;
  unitPrice: number | null;
  /** Used when units/unitPrice aren't both set. null = amount not known (never treated as $0). */
  amount: number | null;
  paid: boolean;
  /** Paid on (when paid) or due on (when not). null = not known. */
  date: Ymd | null;
  /** Goods only: the Shopify product (and variant) this line restocks; null for a new design. */
  productId: string | null;
  variantId: string | null;
}

export interface Shipment {
  id: string;
  mode: ShipMode;
  carrier: string;
  tracking: string;
  /** Tracking page link (http/https only). */
  url: string | null;
  shipped: Ymd | null;
  eta: Ymd | null;
  delivered: Ymd | null;
}

export interface RunLink { id: string; label: string; url: string }

export interface ProductionRun {
  id: string;
  name: string;
  supplier: string;
  invoiceRef: string;
  invoiceDate: Ymd | null;
  /** e.g. "Pay upfront", "30% deposit, balance before shipping". */
  terms: string;
  /** e.g. EXW, FOB, DDP — who pays freight and duties. */
  incoterm: string;
  destination: string;
  /** Supplier's stated days; used to estimate dates you haven't set. null = not known. */
  leadTimes: { sampleDays: number | null; bulkDays: number | null; transitDays: number | null };
  stages: Record<StageKey, { planned: Ymd | null; done: Ymd | null }>;
  costs: RunCost[];
  shipments: Shipment[];
  links: RunLink[];
  notes: string;
  createdAt: string;
}

// ── validation (pasted runs and stored runs) ──

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const httpUrl = z.string().max(500).regex(/^https?:\/\/\S+$/i, 'must start with http:// or https://');
const shortText = (max: number) => z.string().max(max);
const days = z.number().int().min(0).max(365).nullable();

const costSchema = z.object({
  id: z.string().min(1).max(60),
  kind: z.enum(['GOODS', 'SAMPLES', 'FREIGHT', 'DUTIES', 'OTHER']),
  description: shortText(160),
  units: z.number().int().min(0).max(1_000_000).nullable(),
  unitPrice: z.number().finite().min(0).max(1_000_000).nullable(),
  amount: z.number().finite().min(0).max(10_000_000).nullable(),
  paid: z.boolean(),
  date: ymd.nullable(),
  productId: z.string().max(60).nullable(),
  variantId: z.string().max(60).nullable(),
});

const stage = z.object({ planned: ymd.nullable(), done: ymd.nullable() });

export const runSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  supplier: shortText(120),
  invoiceRef: shortText(60),
  invoiceDate: ymd.nullable(),
  terms: shortText(160),
  incoterm: shortText(20),
  destination: shortText(80),
  leadTimes: z.object({ sampleDays: days, bulkDays: days, transitDays: days }),
  stages: z.object(Object.fromEntries(STAGES.map((s) => [s.key, stage])) as Record<StageKey, typeof stage>),
  costs: z.array(costSchema).max(100),
  shipments: z.array(z.object({
    id: z.string().min(1).max(60),
    mode: z.enum(['SEA', 'AIR', 'COURIER', 'OTHER']),
    carrier: shortText(80),
    tracking: shortText(120),
    url: httpUrl.nullable(),
    shipped: ymd.nullable(),
    eta: ymd.nullable(),
    delivered: ymd.nullable(),
  })).max(20),
  links: z.array(z.object({ id: z.string().min(1).max(60), label: shortText(80), url: httpUrl })).max(30),
  notes: shortText(2000),
  createdAt: z.string().max(40),
});

export type ParsedRun = { ok: true; run: ProductionRun } | { ok: false; errors: string[] };

/** Validate a run pasted as JSON (e.g. prepared by Claude from an invoice). */
export function parseRun(raw: string): ParsedRun {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Not valid JSON — paste the whole block, including the first { and the last }.'] };
  }
  const r = runSchema.safeParse(value);
  if (!r.success) {
    return { ok: false, errors: r.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(run)'}: ${i.message}`) };
  }
  const ids = r.data.costs.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return { ok: false, errors: ['costs: two cost lines share an id'] };
  return { ok: true, run: r.data as ProductionRun };
}

/** Keep only well-formed runs from storage; anything else is reported, not shown half-broken. */
export function storedRuns(value: unknown): { runs: ProductionRun[]; dropped: number } {
  if (!Array.isArray(value)) return { runs: [], dropped: 0 };
  const runs: ProductionRun[] = [];
  for (const x of value) {
    const r = runSchema.safeParse(x);
    if (r.success) runs.push(r.data as ProductionRun);
  }
  return { runs, dropped: value.length - runs.length };
}

// ── new records ──

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function blankRun(name: string, now = new Date()): ProductionRun {
  return {
    id: uid('run'), name, supplier: '', invoiceRef: '', invoiceDate: null, terms: '', incoterm: '', destination: '',
    leadTimes: { sampleDays: null, bulkDays: null, transitDays: null },
    stages: Object.fromEntries(STAGES.map((s) => [s.key, { planned: null, done: null }])) as ProductionRun['stages'],
    costs: [], shipments: [], links: [], notes: '', createdAt: now.toISOString(),
  };
}

export const blankCost = (kind: CostKind): RunCost => ({
  id: uid('cost'), kind, description: '', units: null, unitPrice: null, amount: null, paid: false, date: null, productId: null, variantId: null,
});

export const blankShipment = (): Shipment => ({ id: uid('ship'), mode: 'SEA', carrier: '', tracking: '', url: null, shipped: null, eta: null, delivered: null });

export const blankLink = (label: string, url: string): RunLink => ({ id: uid('link'), label, url });

// ── money ──

const toCents = (n: number) => Math.round(n * 100);

/** The line's cost in cents, or null when it isn't known. */
export function costCents(c: RunCost): number | null {
  if (c.units !== null && c.unitPrice !== null) return Math.round(c.units * c.unitPrice * 100);
  return c.amount === null ? null : toCents(c.amount);
}

export interface RunTotals {
  /** Sum of the costs that are known (cents). */
  known: number;
  /** Cost lines with no amount yet — totals are then partial. */
  unknownLines: number;
  paid: number;
  /** Unpaid, known amounts (cents). */
  toPay: number;
  /** Unpaid lines with no amount. */
  toPayUnknown: number;
  goodsUnits: number;
  /** Everything the run costs ÷ goods units, in cents; null without goods units. Partial when unknownLines > 0. */
  costPerUnit: number | null;
}

export function runTotals(r: ProductionRun): RunTotals {
  let known = 0, unknownLines = 0, paid = 0, toPay = 0, toPayUnknown = 0, goodsUnits = 0;
  for (const c of r.costs) {
    const v = costCents(c);
    if (c.kind === 'GOODS') goodsUnits += c.units ?? 0;
    if (v === null) {
      unknownLines += 1;
      if (!c.paid) toPayUnknown += 1;
      continue;
    }
    known += v;
    if (c.paid) paid += v; else toPay += v;
  }
  return { known, unknownLines, paid, toPay, toPayUnknown, goodsUnits, costPerUnit: goodsUnits > 0 ? Math.round(known / goodsUnits) : null };
}

// ── dates ──

export type DateKind = 'done' | 'planned' | 'estimate';
export interface StageDate { key: StageKey; label: string; date: Ymd | null; kind: DateKind | null }

/**
 * One date per stage: done if it happened, else the date you planned, else an
 * estimate chained from the stage before using the supplier's lead times.
 * An estimate needs a known date before it and a known gap, so a missing
 * transit time leaves arrival unknown instead of guessing.
 */
export function stageDates(r: ProductionRun): StageDate[] {
  const gap: Partial<Record<StageKey, number | null>> = {
    SAMPLES_RECEIVED: r.leadTimes.sampleDays,
    SAMPLES_APPROVED: 0,
    BULK_ORDERED: 0,
    BULK_FINISHED: r.leadTimes.bulkDays,
    SHIPPED: 0,
    RECEIVED: r.leadTimes.transitDays,
  };
  const out: StageDate[] = [];
  // a later stage marked done means the earlier ones happened, dated or not
  const lastDone = STAGES.reduce((n, s, i) => (r.stages[s.key].done ? i : n), -1);
  let prev: Ymd | null = null;
  STAGES.forEach((s, i) => {
    const st = r.stages[s.key];
    let date: Ymd | null = null;
    let kind: DateKind | null = null;
    if (st.done) { date = st.done; kind = 'done'; }
    else if (i < lastDone) { date = null; kind = 'done'; }
    else if (st.planned) { date = st.planned; kind = 'planned'; }
    else if (prev && s.key !== 'SAMPLES_ORDERED') {
      const g = gap[s.key];
      if (g !== null && g !== undefined) { date = addDays(prev, g); kind = 'estimate'; }
    }
    out.push({ key: s.key, label: s.label, date, kind });
    if (date) prev = date;
  });
  return out;
}

/** The first stage not yet done; null once received. */
export function currentStage(r: ProductionRun): StageDate | null {
  return stageDates(r).find((s) => s.kind !== 'done') ?? null;
}

/** When the goods should arrive: the latest shipment ETA if one is set, else the received stage's date. */
export function arrivalDate(r: ProductionRun): { date: Ymd | null; kind: DateKind | 'eta' | null } {
  const rec = stageDates(r).find((s) => s.key === 'RECEIVED')!;
  if (rec.kind === 'done') return { date: rec.date, kind: 'done' };
  const etas = r.shipments.filter((s) => !s.delivered && s.eta).map((s) => s.eta!).sort();
  if (etas.length) return { date: etas[etas.length - 1], kind: 'eta' };
  return { date: rec.date, kind: rec.kind };
}

// ── links into the rest of the dashboard ──

/** Goods lines linked to a Shopify product, as stock on the way, dated by the run's arrival. Received runs add nothing. */
export function runIncoming(runs: ProductionRun[]): IncomingStock[] {
  const out: IncomingStock[] = [];
  for (const r of runs) {
    const a = arrivalDate(r);
    if (a.kind === 'done' || !a.date) continue;
    for (const c of r.costs) {
      if (c.kind !== 'GOODS' || !c.productId || !c.units) continue;
      out.push({ id: `run:${r.id}:${c.id}`, productId: c.productId, variantId: c.variantId, units: c.units, expectedDate: a.date, note: `${r.name}${a.kind === 'estimate' ? ' · estimated date' : ''}` });
    }
  }
  return out;
}

export interface CashDue { run: string; description: string; amount: number; due: Ymd | null }

/** Unpaid costs with a known amount (dollars), for the cash forecast. */
export function runCashDue(runs: ProductionRun[]): CashDue[] {
  const out: CashDue[] = [];
  for (const r of runs) {
    for (const c of r.costs) {
      const v = costCents(c);
      if (c.paid || v === null || v === 0) continue;
      out.push({ run: r.name, description: c.description || c.kind, amount: v / 100, due: c.date });
    }
  }
  return out;
}

export interface ProductionAlert {
  id: string;
  run: string;
  title: string;
  numbers: string[];
  rule: string;
}

const short = (d: Ymd) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What needs attention today: a stage whose date has passed without being
 * marked done (planned or estimated), and unpaid costs due within `soonDays`
 * (or overdue). Received runs are quiet.
 */
export function productionAlerts(runs: ProductionRun[], today: Ymd, soonDays = 7): ProductionAlert[] {
  const out: ProductionAlert[] = [];
  for (const r of runs) {
    const cur = currentStage(r);
    if (!cur) continue;
    if (cur.date && cur.date < today) {
      out.push({
        id: `prod-late-${r.id}`, run: r.name,
        title: `${r.name}: ${cur.label.toLowerCase()} was due ${short(cur.date)}`,
        numbers: [`${cur.kind === 'estimate' ? 'Estimated' : 'Planned'} for ${short(cur.date)}, not marked done`],
        rule: 'A production stage\'s planned or estimated date has passed and it isn\'t marked done. Mark it done, or set a new date.',
      });
    }
    const horizon = addDays(today, soonDays);
    const due = r.costs.filter((c) => !c.paid && c.date && c.date <= horizon);
    if (due.length) {
      const known = due.map(costCents).filter((v): v is number => v !== null);
      out.push({
        id: `prod-due-${r.id}`, run: r.name,
        title: `${r.name}: ${due.length === 1 ? 'a payment is' : `${due.length} payments are`} due${due.some((c) => c.date! < today) ? ' or overdue' : ''}`,
        numbers: due.map((c) => `${c.description || c.kind}: ${costCents(c) === null ? 'amount not set' : usd(costCents(c)!)} due ${short(c.date!)}`)
          .concat(known.length > 1 ? [`Together ${usd(known.reduce((a, b) => a + b, 0))}`] : []),
        rule: `An unpaid production cost is due within ${soonDays} days, or its due date has passed.`,
      });
    }
  }
  return out;
}

// ── Timeline (all runs on one calendar) ──

export type PhaseKey = 'SAMPLING' | 'BULK' | 'TRANSIT';
export const PHASES: { key: PhaseKey; label: string; from: StageKey; to: StageKey }[] = [
  { key: 'SAMPLING', label: 'Sampling', from: 'SAMPLES_ORDERED', to: 'SAMPLES_APPROVED' },
  { key: 'BULK', label: 'Bulk', from: 'BULK_ORDERED', to: 'BULK_FINISHED' },
  { key: 'TRANSIT', label: 'Transit', from: 'SHIPPED', to: 'RECEIVED' },
];

export interface TimelinePhase {
  key: PhaseKey;
  label: string;
  from: Ymd;
  /** null = the end isn't known (e.g. no transit time set). */
  to: Ymd | null;
  /** The part up to this date happened (solid); the rest is planned or estimated (hatched). null = none of it happened yet. */
  doneUntil: Ymd | null;
  /** Whether the start date is itself a plan or estimate. */
  startKind: DateKind;
}

export interface TimelinePayment {
  /** null = no date set; drawn at today, as the cash forecast counts it. */
  date: Ymd | null;
  paid: boolean;
  /** Known amounts summed in cents; null when none of the grouped lines has an amount. */
  amount: number | null;
  unknownLines: number;
  lines: string[];
}

export interface TimelineRow {
  runId: string;
  name: string;
  sub: string;
  phases: TimelinePhase[];
  payments: TimelinePayment[];
  arrival: { date: Ymd | null; kind: DateKind | 'eta' | null };
  received: boolean;
}

export interface Timeline {
  from: Ymd;
  to: Ymd;
  today: Ymd;
  rows: TimelineRow[];
  /** Chinese New Year inside the window (factories close for weeks around it). */
  holidays: { label: string; day: Ymd; from: Ymd; to: Ymd }[];
}

// Chinese New Year (lunar new year's day). Closure windows vary by factory;
// the band is an approximation, labelled as such.
const CNY: Ymd[] = ['2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'];

const later = (a: Ymd | null, b: Ymd | null) => (!a ? b : !b ? a : a > b ? a : b);
const earlier = (a: Ymd | null, b: Ymd | null) => (!a ? b : !b ? a : a < b ? a : b);

/**
 * Every run as a row of phases (sampling, bulk, transit) on one calendar.
 * A phase whose start isn't known is left out; one whose end isn't known has
 * to = null. The window runs from two weeks before the earliest date (or
 * today) to two weeks after the latest, and at least 12 weeks past today.
 */
export function timelineModel(runs: ProductionRun[], today: Ymd): Timeline {
  let lo: Ymd = addDays(today, -14);
  let hi: Ymd = addDays(today, 84);
  const rows: TimelineRow[] = runs.map((r) => {
    const dates = stageDates(r);
    const at = (k: StageKey) => dates.find((d) => d.key === k)!;
    const phases: TimelinePhase[] = [];
    for (const p of PHASES) {
      const a = at(p.from);
      const b = at(p.to);
      // transit can start from a shipment's shipped date when the stage has none
      const shipped = r.shipments.map((x) => x.shipped).filter((d): d is Ymd => !!d).sort()[0] ?? null;
      const from = a.date ?? (p.key === 'TRANSIT' ? shipped : null);
      if (!from) continue;
      let to = b.date;
      // transit ends at the shipment ETA when one is set
      if (p.key === 'TRANSIT' && b.kind !== 'done') {
        const eta = arrivalDate(r);
        if (eta.kind === 'eta') to = eta.date;
      }
      if (!to && b.kind === 'done') to = from;   // marked done without dates: a stub, not an open end
      const doneUntil = b.kind === 'done' ? (to ?? from)
        : a.kind === 'done' ? (to && today > to ? to : today < from ? null : today)
          : null;
      phases.push({ key: p.key, label: p.label, from, to, doneUntil, startKind: a.date ? (a.kind ?? 'estimate') : 'done' });
      lo = earlier(lo, from)!;
      hi = later(hi, to ?? from)!;
    }
    // payments: grouped by date and paid/due
    const groups = new Map<string, TimelinePayment>();
    for (const c of r.costs) {
      const date = c.date ?? (c.paid ? r.invoiceDate : null);
      if (c.paid && !date) continue;      // paid, no date known: nothing to place
      const key = `${date ?? 'none'}|${c.paid}`;
      const g = groups.get(key) ?? { date, paid: c.paid, amount: null, unknownLines: 0, lines: [] };
      const v = costCents(c);
      if (v === null) g.unknownLines += 1; else g.amount = (g.amount ?? 0) + v;
      g.lines.push(c.description || c.kind);
      groups.set(key, g);
      if (date) { lo = earlier(lo, date)!; hi = later(hi, date)!; }
    }
    const goods = r.costs.filter((c) => c.kind === 'GOODS').reduce((n, c) => n + (c.units ?? 0), 0);
    const arrival = arrivalDate(r);
    return {
      runId: r.id, name: r.name,
      sub: [goods ? `${goods} units` : '', r.incoterm, r.destination].filter(Boolean).join(' · '),
      phases,
      payments: [...groups.values()].sort((a, b) => (a.date ?? today).localeCompare(b.date ?? today)),
      arrival, received: arrival.kind === 'done',
    };
  });
  const from = addDays(lo, -7);
  const to = addDays(hi, 21);
  const holidays = CNY.filter((d) => d >= from && d <= to)
    .map((day) => ({ label: 'Chinese New Year', day, from: addDays(day, -10), to: addDays(day, 14) }));
  return { from, to, today, rows, holidays };
}
