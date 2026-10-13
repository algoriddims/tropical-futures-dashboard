// ── Data freshness ────────────────────────────────────────────────────────
// Three different clocks, never conflated:
//   coverage  — the last moment the records describe (coverageEnd)
//   extracted — when the sync pulled them from Shopify/Meta/etc.
//   imported  — when they were pasted into this terminal
// Importing an old export today makes it IMPORTED recently, not CURRENT.
// A date the snapshot doesn't carry is shown as unknown, never as fresh.

import type { SnapshotMeta } from './types';

// Low-volume brand: a 2–3×/week sync rhythm is healthy, so data only counts
// as stale once its coverage is more than 72 hours behind the clock.
export const STALE_AFTER_HOURS = 72;
const CLOCK_SKEW_HOURS = 5 / 60;

export type FreshnessTone = 'ok' | 'warn' | 'unknown';

export interface FreshnessItem {
  label: string;
  text: string;
  tone: FreshnessTone;
}

export interface Freshness {
  mode: 'sample' | 'imported';
  /** True when coverage is older than the threshold — or unknown. */
  stale: boolean;
  /** Last moment the data covers, if known (ISO). */
  coverageEnd: string | null;
  items: FreshnessItem[];
}

export function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function hoursSince(iso: string | undefined | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now.getTime() - t) / 36e5;
}

function ageItem(label: string, iso: string | undefined | null, now: Date, warnAfterHours?: number): FreshnessItem {
  const h = hoursSince(iso, now);
  if (h === null) return { label, text: 'UNKNOWN', tone: 'unknown' };
  // Beyond small skew (the UI clock ticks once a second; machines drift), a
  // future timestamp means a clock or timezone problem — flag, don't trust.
  if (h < -CLOCK_SKEW_HOURS) return { label, text: 'IN FUTURE', tone: 'warn' };
  const age = Math.max(0, h);
  const warn = warnAfterHours !== undefined && age >= warnAfterHours;
  return { label, text: `${fmtAge(age)} AGO`, tone: warn ? 'warn' : 'ok' };
}

export function describeFreshness(args: {
  imported: boolean;
  importedAt: string | null;
  meta: SnapshotMeta | undefined;
  now: Date;
}): Freshness {
  const { imported, importedAt, meta, now } = args;
  if (!imported) {
    return {
      mode: 'sample',
      stale: true,
      coverageEnd: null,
      items: [{ label: 'SAMPLE DATA', text: 'NOT LIVE', tone: 'warn' }],
    };
  }
  const coverageEnd = meta?.coverageEnd ?? null;
  const coverage = ageItem('COVERAGE', coverageEnd, now, STALE_AFTER_HOURS);
  const items: FreshnessItem[] = [coverage, ageItem('EXTRACTED', meta?.extractedAt, now), ageItem('IMPORTED', importedAt, now)];
  for (const s of meta?.sources ?? []) {
    items.push(ageItem(s.label.toUpperCase(), s.extractedAt ?? s.coverageEnd, now, STALE_AFTER_HOURS));
  }
  return { mode: 'imported', stale: coverage.tone !== 'ok', coverageEnd, items };
}
