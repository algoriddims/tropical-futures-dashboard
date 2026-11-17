import { describe, expect, it } from 'vitest';
import { cashPosition, dailySales, monthSeries, nextArrival, salesShare } from '../overview';
import { blankRun } from '../production';
import type { ProductionRun, RunCost } from '../production';
import type { AnalyticsSnapshot } from '../../analytics/types';
import type { ProductPerf } from '../../analytics/metrics';

// Synthetic — not real business data.
const cost = (o: Partial<RunCost>): RunCost => ({ id: `c${Math.random()}`, kind: 'GOODS', description: '', units: null, unitPrice: null, amount: null, paid: false, date: null, productId: null, variantId: null, ...o });
const run = (id: string, o: Partial<ProductionRun> = {}): ProductionRun => ({ ...blankRun(id, new Date('2026-11-01T00:00:00Z')), id, name: id, ...o });

describe('cash position', () => {
  it('takes what is still owed on production off cash on hand; unpriced lines are counted, not guessed', () => {
    const runs = [
      run('a', { costs: [cost({ units: 100, unitPrice: 27.8 }), cost({ kind: 'FREIGHT' })] }),     // $2,780 due + 1 unpriced
      run('b', { costs: [cost({ kind: 'FREIGHT', amount: 160 }), cost({ units: 10, unitPrice: 5, paid: true })] }),
    ];
    const p = cashPosition({ bankBalance: 9906.42, accounts: [{ id: 'c', name: 'C', mask: '1', kind: 'CARD', balance: 1705.2, asOf: '2026-11-16T00:00:00Z' }], productionRuns: runs });
    expect(p).toEqual({ cash: 8201.22, due: 2940, dueUnknown: 1, after: 5261.22 });
  });
  it('unknown cash stays unknown', () => {
    expect(cashPosition({ bankBalance: null, productionRuns: [] })).toEqual({ cash: null, due: 0, dueUnknown: 0, after: null });
  });
});

describe('next arrival', () => {
  const stages = (planned: string | null, done: string | null = null) => ({ ...blankRun('x').stages, RECEIVED: { planned, done } });
  it('is the soonest dated arrival among runs not yet received', () => {
    const runs = [
      run('late-dec', { stages: stages('2026-12-20'), costs: [cost({ units: 500 })] }),
      run('early-dec', { stages: stages('2026-12-05'), costs: [cost({ units: 100 }), cost({ units: 50 }), cost({ kind: 'FREIGHT', amount: 5 })] }),
      run('no-date'),
      run('received', { stages: stages(null, '2026-11-10') }),
    ];
    const n = nextArrival(runs, '2026-11-17')!;
    expect([n.run.id, n.date, n.kind, n.units, n.late, n.others]).toEqual(['early-dec', '2026-12-05', 'planned', 150, false, 2]);
  });
  it('an arrival date that has passed without receipt is flagged late; nothing dated is null', () => {
    expect(nextArrival([run('a', { stages: stages('2026-11-10') })], '2026-11-17')!.late).toBe(true);
    expect(nextArrival([run('a')], '2026-11-17')).toBeNull();
  });
});

describe('daily sales and sales share', () => {
  it('fills every day of the range, summing channels, with no-sale days as 0', () => {
    const a = { daily: [
      { date: '2026-11-02', channel: 'Online Store', netSales: 4500 },
      { date: '2026-11-02', channel: 'Draft Orders', netSales: -500 },
      { date: '2026-11-04', channel: 'Online Store', netSales: 9000 },
      { date: '2026-11-09', channel: 'Online Store', netSales: 100 },
    ] } as unknown as AnalyticsSnapshot;
    expect(dailySales(a, { from: '2026-11-01', to: '2026-11-04' })).toEqual([
      { date: '2026-11-01', net: 0 }, { date: '2026-11-02', net: 40 }, { date: '2026-11-03', net: 0 }, { date: '2026-11-04', net: 90 },
    ]);
  });

  it('ranks products by net sales and folds the tail into one row; a single leftover keeps its name', () => {
    const p = (title: string, net: number) => ({ productId: title, title, current: { netSales: net } }) as unknown as ProductPerf;
    const s = salesShare([p('Cap', 119600), p('Jersey', 9500), p('Fan tee', 9000), p('Logo tee', 7500), p('A', 4750), p('B', 4500), p('C', 4000), p('D', 3750), p('Returned', -2000), p('Idle', 0)]);
    expect(s.total).toBe(1626);
    expect(s.rows.map((r) => [r.label, r.net, Math.round(r.share * 100)])).toEqual([['Cap', 1196, 74], ['Jersey', 95, 6], ['Fan tee', 90, 6], ['Logo tee', 75, 5], ['4 others', 170, 10]]);
    expect(salesShare([p('Cap', 100), p('Tee', 50)], 1).rows.map((r) => r.label)).toEqual(['Cap', 'Tee']);
    expect(salesShare([p('Idle', 0)])).toEqual({ rows: [], total: 0 });
  });
});

describe('month series', () => {
  it('returns the last N months of money in vs out, oldest first', () => {
    const cashflow = ['2026-03', '2026-04', '2026-05'].map((month) => ({ month, partial: false, cashIn: { SHOPIFY_PAYOUTS: 100 }, spend: { SOFTWARE: 40 } }));
    expect(monthSeries({ cashflow, deposits: [] }, 2).map((m) => [m.month, m.counted, m.spending, m.net])).toEqual([['2026-04', 100, 40, 60], ['2026-05', 100, 40, 60]]);
    expect(monthSeries({})).toEqual([]);
  });
});
