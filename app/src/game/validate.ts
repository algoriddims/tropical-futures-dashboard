// ── Import validation ─────────────────────────────────────────────────────
// A pasted snapshot must pass the COMPLETE schema — every nested record and
// field the engine reads — before it can replace the last good snapshot.
// Unknown extra fields are kept (loose objects) so nothing the sync sent is
// silently thrown away; only what the engine depends on is enforced.

import { z } from 'zod';

import type { ParkData } from './types';

// No eval: the hosted page's Content-Security-Policy forbids it, and zod's
// JIT probe would otherwise log a violation on every load.
z.config({ jitless: true });

const num = z.number().finite();
const nonNeg = num.nonnegative();
const count = z.number().int().nonnegative();
const rate = num.min(0).max(1);
const text = z.string();
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date');

const product = z.looseObject({
  id: text.min(1),
  name: text,
  drop: text,
  price: nonNeg,
  unitCost: nonNeg.nullable(),
  stock: count,
  startInventory: count,
  sold7d: count,
  soldPrev7d: count,
  soldTotal: count,
  published: z.boolean(),
  restockPolicy: z.enum(['REPLENISH', 'LIMITED']).optional(),
  tracked: z.boolean().optional(),
});

const pipelineItem = z.looseObject({
  id: text.min(1),
  name: text,
  kind: text,
  qty: count,
  unitCost: nonNeg,
  retail: num.positive(),
  status: z.enum(['DESIGN', 'SAMPLES', 'PRODUCTION', 'READY']),
  etaWeeks: nonNeg,
  expectedSellThrough: rate,
});

const channel = z.looseObject({
  name: text.min(1),
  location: text,
  type: z.enum(['ONLINE', 'STOCKIST', 'POPUP']),
  revenue: num,
  orders: count,
  revenueDays: count.positive().optional(),
  stock: z.array(z.looseObject({ productId: text.min(1), allocated: count, sold: count })),
});

const order = z.looseObject({ id: text, time: text, label: text, value: num, returning: z.boolean() });

const campaign = z.looseObject({
  id: text.min(1),
  name: text,
  status: z.enum(['ACTIVE', 'PAUSED']),
  spend: nonNeg,
  revenue: nonNeg,
  clicks: count,
  impressions: count,
  frequency: nonNeg,
  dailySpend: z.array(nonNeg),
});

const day = z.looseObject({ date: text.min(1), revenue: num, orders: count, spend: nonNeg.optional(), sessions: count.optional() });

const quest = z.looseObject({
  id: text, scenario: text, goal: text, unit: text,
  target: num.positive(), current: num, daysLeft: num, reward: text,
});

const cost = z.looseObject({
  id: text.min(1),
  name: text,
  category: z.enum(['SUBSCRIPTION', 'PAYROLL', 'PRODUCTION', 'OPS']),
  amount: nonNeg,
  cadence: z.enum(['MONTHLY', 'WEEKLY', 'ONE-OFF']),
  active: z.boolean(),
  note: text.optional(),
});

const meta = z.looseObject({
  sample: z.boolean().optional(),
  coverageStart: isoDate.optional(),
  coverageEnd: isoDate.optional(),
  extractedAt: isoDate.optional(),
  sources: z.array(z.looseObject({ label: text, extractedAt: isoDate.optional(), coverageEnd: isoDate.optional() })).optional(),
  notes: z.array(text).optional(),
});

const account = z.looseObject({
  id: text.min(1),
  name: text,
  mask: text,
  kind: z.enum(['CHECKING', 'SAVINGS', 'CARD']),
  balance: num,
  available: num.optional(),
  creditLimit: nonNeg.optional(),
  asOf: isoDate,
});

const money = z.record(z.string(), num);
const cashMonth = z.looseObject({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'must be YYYY-MM'),
  partial: z.boolean(),
  cashIn: money,
  spend: money,
});

export const parkDataSchema = z.looseObject({
  products: z.array(product),
  pipeline: z.array(pipelineItem),
  channels: z.array(channel),
  orders: z.array(order),
  campaigns: z.array(campaign),
  days: z.array(day),
  quests: z.array(quest).default([]),
  // Manual slices: the terminal owns these and re-applies its own values
  // over any import (see overrides.ts), so a sync may omit them.
  costs: z.array(cost).default([]),
  bankBalance: num.nullable().optional(),
  monthlySalesGoal: nonNeg.optional(),
  growthTargetPct: num.optional(),
  wholesalePct: rate.optional(),
  nextDrop: z.object({ name: text, date: isoDate }).nullable().optional(),
  annualBudget: nonNeg.optional(),
  repeatRate: rate.optional(),
  refundRate: rate.optional(),
  meta: meta.optional(),
  accounts: z.array(account).optional(),
  cashflow: z.array(cashMonth).optional(),
  grossMargin: num.gt(0).max(1),
  targetRoas: num.positive(),
});

export type ValidationResult =
  | { ok: true; data: ParkData }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 8;

function fmtPath(path: PropertyKey[]): string {
  return path.reduce<string>((s, p) => (typeof p === 'number' ? `${s}[${p}]` : s ? `${s}.${String(p)}` : String(p)), '') || '(root)';
}

// Rules the schema can't express: identity and cross-references.
function crossCheck(d: ParkData): string[] {
  const errors: string[] = [];
  const dupes = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${what}: duplicate id "${id}"`);
      seen.add(id);
    }
  };
  dupes(d.products.map((p) => p.id), 'products');
  dupes(d.pipeline.map((p) => p.id), 'pipeline');
  dupes(d.channels.map((c) => c.name), 'channels (name)');
  dupes(d.costs.map((c) => c.id), 'costs');
  const productIds = new Set(d.products.map((p) => p.id));
  d.channels.forEach((c, ci) => {
    dupes(c.stock.map((s) => s.productId), `channels[${ci}].stock`);
    c.stock.forEach((s, si) => {
      if (!productIds.has(s.productId)) {
        errors.push(`channels[${ci}].stock[${si}].productId: "${s.productId}" is not in products`);
      }
      if (s.sold > s.allocated) {
        errors.push(`channels[${ci}].stock[${si}]: sold ${s.sold} exceeds allocated ${s.allocated}`);
      }
    });
  });
  return errors;
}

function valueAt(input: unknown, path: PropertyKey[]): unknown {
  let v: unknown = input;
  for (const k of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<PropertyKey, unknown>)[k];
  }
  return v;
}

// Plain-language reason: "missing" beats zod's generic "Invalid input".
function describeIssue(input: unknown, issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_type') {
    const actual = valueAt(input, issue.path);
    if (actual === undefined) return `missing (expected ${issue.expected})`;
    const got = actual === null ? 'null' : Array.isArray(actual) ? 'array' : typeof actual;
    return `expected ${issue.expected}, got ${got} ${JSON.stringify(actual)?.slice(0, 30) ?? ''}`.trim();
  }
  return issue.message;
}

export function validateParkData(input: unknown): ValidationResult {
  const parsed = parkDataSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${fmtPath(i.path)}: ${describeIssue(input, i)}`);
    return { ok: false, errors: errors.slice(0, MAX_ERRORS).concat(errors.length > MAX_ERRORS ? [`…and ${errors.length - MAX_ERRORS} more`] : []) };
  }
  // Defaults for omitted manual slices match applyManual's fallbacks; any
  // value the user has entered in the terminal is re-applied over these.
  const p = parsed.data;
  const data = {
    ...p,
    // unknown stays unknown: no bank sync and nothing entered is null, not $0
    bankBalance: p.bankBalance ?? null,
    monthlySalesGoal: p.monthlySalesGoal ?? 0,
    growthTargetPct: p.growthTargetPct ?? 25,
    wholesalePct: p.wholesalePct ?? 0.6,
    nextDrop: p.nextDrop ?? null,
    annualBudget: p.annualBudget ?? 0,
  } as ParkData;
  const cross = crossCheck(data);
  if (cross.length) {
    return { ok: false, errors: cross.slice(0, MAX_ERRORS).concat(cross.length > MAX_ERRORS ? [`…and ${cross.length - MAX_ERRORS} more`] : []) };
  }
  return { ok: true, data };
}
