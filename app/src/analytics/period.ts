// ── Reporting periods ─────────────────────────────────────────────────────
// Dates are calendar days (YYYY-MM-DD) in the business timezone. "Complete"
// days end before today in that timezone. Periods are resolved at runtime from
// the clock — never hard-coded — and never shifted to hide stale data:
// a period that runs past the data's coverage is reported as partial.

export type Ymd = string; // YYYY-MM-DD

export interface DayRange { from: Ymd; to: Ymd } // inclusive

export interface Comparison {
  current: DayRange;
  prior: DayRange;
  days: number;
  timezone: string;
}

/** Today's calendar date in an IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): Ymd {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Pure calendar arithmetic (no timezone involved). */
export function addDays(d: Ymd, n: number): Ymd {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function dayCount(r: DayRange): number {
  return Math.round((Date.UTC(+r.to.slice(0, 4), +r.to.slice(5, 7) - 1, +r.to.slice(8, 10)) -
    Date.UTC(+r.from.slice(0, 4), +r.from.slice(5, 7) - 1, +r.from.slice(8, 10))) / 86400000) + 1;
}

export function eachDay(r: DayRange): Ymd[] {
  const out: Ymd[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const inRange = (d: Ymd, r: DayRange) => d >= r.from && d <= r.to;

/** The last `days` complete days in `timezone`, and the `days` immediately before them. */
export function lastCompleteDays(days: number, timezone: string, now: Date = new Date()): Comparison {
  const to = addDays(todayIn(timezone, now), -1);
  const from = addDays(to, -(days - 1));
  const priorTo = addDays(from, -1);
  return { current: { from, to }, prior: { from: addDays(priorTo, -(days - 1)), to: priorTo }, days, timezone };
}

/** How many days of `r` the source actually covers (missing days are unknown, not zero). */
export function coverage(r: DayRange, covered: { from: Ymd; to: Ymd; missing: Ymd[] }): { covered: number; total: number; uncovered: Ymd[] } {
  const all = eachDay(r);
  const missing = new Set(covered.missing);
  const uncovered = all.filter((d) => d < covered.from || d > covered.to || missing.has(d));
  return { covered: all.length - uncovered.length, total: all.length, uncovered };
}

/** "14 Sep – 13 Oct 2026" */
export function formatRange(r: DayRange): string {
  const f = (d: Ymd, year: boolean) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return r.from === r.to ? f(r.from, true) : `${f(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${f(r.to, true)}`;
}
