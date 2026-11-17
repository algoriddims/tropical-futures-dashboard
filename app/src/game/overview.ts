// ── Overview figures ──────────────────────────────────────────────────────
// The few numbers the overview's top tiles and charts need that aren't
// already a metric elsewhere. Pure; dollars in and out, sums in cents.

import type { ParkData } from './types';
import { netCash } from './engine';
import { arrivalDate, runCashDue, runTotals } from './production';
import type { DateKind, ProductionRun } from './production';
import { monthMoney } from './moneyIn';
import type { MonthMoney } from './moneyIn';
import type { AnalyticsSnapshot } from '../analytics/types';
import type { DayRange, Ymd } from '../analytics/period';
import { eachDay, inRange } from '../analytics/period';
import type { ProductPerf } from '../analytics/metrics';

const cents = (n: number) => Math.round(n * 100);

export interface CashPosition {
  /** Bank minus card (or the typed-in balance); null = unknown. */
  cash: number | null;
  /** Unpaid production costs with a known amount. */
  due: number;
  /** Unpaid production lines with no amount yet (not in `due`). */
  dueUnknown: number;
  /** cash − due; null when cash is unknown. */
  after: number | null;
}

/** Cash now, and what's left once the production costs still owed are paid. */
export function cashPosition(d: Pick<ParkData, 'bankBalance' | 'accounts' | 'productionRuns'>): CashPosition {
  const cash = netCash(d);
  const runs = d.productionRuns ?? [];
  const due = runCashDue(runs).reduce((s, c) => s + cents(c.amount), 0) / 100;
  const dueUnknown = runs.reduce((s, r) => s + runTotals(r).toPayUnknown, 0);
  return { cash, due, dueUnknown, after: cash === null ? null : (cents(cash) - cents(due)) / 100 };
}

export interface NextArrival {
  run: ProductionRun;
  date: Ymd;
  kind: DateKind | 'eta';
  units: number;
  /** The date has passed without the run being marked received. */
  late: boolean;
  /** Other runs not yet received (with or without a date). */
  others: number;
}

/**
 * The run expected soonest among those not received. An overdue arrival
 * counts (it's the most pressing); runs with no arrival date are only counted
 * in `others`. null when nothing is on the way with a date.
 */
export function nextArrival(runs: ProductionRun[], today: Ymd): NextArrival | null {
  const open = runs.map((r) => ({ r, a: arrivalDate(r) })).filter((x) => x.a.kind !== 'done');
  const dated = open.filter((x) => x.a.date).sort((x, y) => x.a.date!.localeCompare(y.a.date!));
  if (!dated.length) return null;
  const { r, a } = dated[0];
  return {
    run: r, date: a.date!, kind: a.kind!, late: a.date! < today,
    units: r.costs.filter((c) => c.kind === 'GOODS').reduce((n, c) => n + (c.units ?? 0), 0),
    others: open.length - 1,
  };
}

/** Net sales per day over a range (all channels), in dollars; days with no sales are 0. */
export function dailySales(a: AnalyticsSnapshot, range: DayRange): { date: Ymd; net: number }[] {
  const by = new Map<Ymd, number>();
  for (const r of a.daily) if (inRange(r.date, range)) by.set(r.date, (by.get(r.date) ?? 0) + r.netSales);
  return eachDay(range).map((date) => ({ date, net: (by.get(date) ?? 0) / 100 }));
}

export interface ShareRow { label: string; net: number; share: number; productId: string | null; others: number }

/** The top products by net sales in the period, then everything else as one row. Shares of the positive total. */
export function salesShare(products: ProductPerf[], top = 4): { rows: ShareRow[]; total: number } {
  const selling = products.filter((p) => p.current.netSales > 0).sort((a, b) => b.current.netSales - a.current.netSales);
  const total = selling.reduce((s, p) => s + p.current.netSales, 0);
  if (!total) return { rows: [], total: 0 };
  const head = selling.slice(0, top).map((p) => ({ label: p.title, net: p.current.netSales / 100, share: p.current.netSales / total, productId: p.productId, others: 0 }));
  const rest = selling.slice(top);
  const restNet = rest.reduce((s, p) => s + p.current.netSales, 0);
  const rows = rest.length === 1 ? [...head, { label: rest[0].title, net: restNet / 100, share: restNet / total, productId: rest[0].productId, others: 0 }]
    : rest.length ? [...head, { label: `${rest.length} others`, net: restNet / 100, share: restNet / total, productId: null, others: rest.length }] : head;
  return { rows, total: total / 100 };
}

/** The last `count` months of money in vs out (bank basis), oldest first. */
export function monthSeries(d: Pick<ParkData, 'cashflow' | 'deposits' | 'depositTags'>, count = 7): MonthMoney[] {
  return (d.cashflow ?? []).map((m) => m.month).sort().slice(-count).map((m) => monthMoney(d, m)!).filter(Boolean);
}
