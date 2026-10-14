// One place where the desks get their analytics: the same period, channel
// filter and metric functions for every panel, so totals, tables and charts
// reconcile.
import { useMemo } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { lastCompleteDays } from '@/analytics/period';
import type { Comparison } from '@/analytics/period';
import * as M from '@/analytics/metrics';
import type { AnalyticsSnapshot } from '@/analytics/types';

export interface AnalyticsView {
  a: AnalyticsSnapshot;
  cmp: Comparison;
  cur: M.PeriodTotals;
  prior: M.PeriodTotals;
  products: M.ProductPerf[];
  exceptions: M.Exception[];
}

export type AnalyticsState =
  | { kind: 'none' }                                  // snapshot has no analytics block (sample or older sync)
  | { kind: 'no-timezone'; a: AnalyticsSnapshot }     // configuration gap
  | { kind: 'ok'; view: AnalyticsView };

export function useAnalytics(): AnalyticsState {
  const { data, range, channelFilter } = useTerminal();
  const a = data?.analytics;
  return useMemo<AnalyticsState>(() => {
    if (!a) return { kind: 'none' };
    if (!a.timezone) return { kind: 'no-timezone', a };
    // Resolved at runtime: the last N complete days in the business timezone.
    const cmp = lastCompleteDays(range, a.timezone, new Date());
    const products = M.productPerformance(a, cmp, channelFilter);
    // Stock exceptions use all channels: every channel draws on the same stock.
    const stockProducts = channelFilter === 'ALL' ? products : M.productPerformance(a, cmp, 'ALL');
    return {
      kind: 'ok',
      view: {
        a, cmp,
        cur: M.periodTotals(a, cmp.current, channelFilter),
        prior: M.periodTotals(a, cmp.prior, channelFilter),
        products,
        exceptions: M.buildExceptions(a, cmp, stockProducts),
      },
    };
  }, [a, range, channelFilter]);
}
