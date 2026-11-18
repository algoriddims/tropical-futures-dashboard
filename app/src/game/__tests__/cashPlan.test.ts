// Cash plan — hand-checkable fixture, dollars.
import { describe, expect, it } from 'vitest';
import { cashPlan, cashVerdict } from '../cashPlan';
import { blankRun } from '../production';
import type { ProductionRun, RunCost } from '../production';
import type { CashMonth, ParkData } from '../types';
import { fixtureData } from '../fixtures';

const cost = (o: Partial<RunCost>): RunCost => ({
  id: o.id ?? 'c', kind: 'GOODS', description: 'Caps', units: null, unitPrice: null, amount: null, paid: false, date: null, productId: null, variantId: null, ...o,
});

function data(over: Partial<ParkData> = {}): ParkData {
  const run: ProductionRun = {
    ...blankRun('Cap run', new Date('2026-11-01T00:00:00Z')), id: 'r1',
    costs: [cost({ id: 'bal', amount: 500, date: '2027-01-10' }), cost({ id: 'ship', kind: 'FREIGHT', amount: 200 }), cost({ id: 'paid', amount: 999, paid: true })],
  };
  const cashflow: CashMonth[] = [
    { month: '2026-08', partial: false, cashIn: { SHOPIFY_PAYOUTS: 600 }, spend: { PRODUCTION: 600, ADS: 300, SOFTWARE: 300 } },
    { month: '2026-09', partial: false, cashIn: { SHOPIFY_PAYOUTS: 900 }, spend: { ADS: 300, SOFTWARE: 300, SHIPPING: 300 } },
    { month: '2026-10', partial: false, cashIn: { SHOPIFY_PAYOUTS: 600, PAYPAL: 300, OTHER_IN: 1000 }, spend: { SOFTWARE: 300, SHIPPING: 300, PRODUCTION: 300 } },
    { month: '2026-11', partial: true, cashIn: { SHOPIFY_PAYOUTS: 400 }, spend: { SOFTWARE: 300 } },
  ];
  return {
    ...structuredClone(fixtureData),
    costs: [], bankBalance: 6000,
    accounts: [
      { id: 'chk', name: 'Checking', mask: '0001', kind: 'CHECKING', balance: 6000, asOf: '2026-11-16T05:00:00Z' },
      { id: 'card', name: 'Card', mask: '0002', kind: 'CARD', balance: 1000, asOf: '2026-11-16T05:00:00Z' },
    ],
    cashflow,
    deposits: [
      { id: 'd1', date: '2026-10-20', amount: 1000, kind: 'OTHER_IN', label: 'Client' },
      { id: 'd2', date: '2026-09-02', amount: 300, kind: 'OTHER_IN', label: 'Unknown' },
    ],
    depositTags: { d1: 'CLIENT' },
    days: Array.from({ length: 30 }, (_, i) => ({ ...fixtureData.days[0], date: `2026-10-${String(i + 1).padStart(2, '0')}`, revenue: 50 })),
    productionRuns: [run],
    analytics: undefined,
    ...over,
  };
}

describe('cashPlan', () => {
  it('counts money in as payouts reaching the bank, plus tagged money, never untagged', () => {
    const p = cashPlan(data())!;
    expect(p.start).toBe(5000);
    expect(p.from).toBe('2026-11-16');
    expect(p.basisMonths).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(p.moneyIn.payouts).toBe(800);                // (600 + 900 + 900) / 3
    expect(p.moneyIn.tagged).toBeCloseTo(333.33, 2);     // 1000 client / 3
    expect(p.moneyIn.untaggedInBasis).toBe(100);         // 300 untagged / 3, not counted
    expect(p.moneyIn.recentSales).toBe(1500);
    expect(p.moneyIn.payoutRate).toBeNull();             // no analytics block
  });

  it('leaves production out of running costs and plans it from the runs instead (counted once)', () => {
    const p = cashPlan(data())!;
    expect(p.moneyOut.source).toBe('ACTUAL');
    expect(p.moneyOut.monthly).toBe(700);                // (600 + 900 + 600) / 3, production excluded
    expect(p.moneyOut.productionAvg).toBe(300);
    expect(p.due.map((x) => [x.index, x.amount, x.dated])).toEqual([[2, 500, true], [0, 200, false]]);
  });

  it('runs each case month by month from the balance date', () => {
    const p = cashPlan(data())!;
    expect(p.months).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(p.firstFraction).toBeCloseTo(14 / 30, 6);
    const low = p.scenarios[0];
    // rest of Nov: +100 × 14/30 − 200 undated; Dec +100; Jan +100 − 500; then +100 a month
    expect(low.closing[0]).toBeCloseTo(4846.67, 2);
    expect(low.closing[1]).toBeCloseTo(4946.67, 2);
    expect(low.closing[2]).toBeCloseTo(4546.67, 2);
    expect(low.closing[6]).toBeCloseTo(4946.67, 2);
    expect(low.low.index).toBe(2);
    expect(p.scenarios[1].monthlyIn).toBeCloseTo(1133.33, 2);
    expect(p.scenarios[2].monthlyIn).toBeCloseTo(1833.33, 2); // 1500 sales (no payout rate known) + tagged
    expect(cashVerdict(p).tone).toBe('green');
  });

  it('says when cash runs out in the cautious case, and whether the sales pace saves it', () => {
    const d = data({ accounts: [{ id: 'chk', name: 'Checking', mask: '0001', kind: 'CHECKING', balance: 1200, asOf: '2026-11-16T05:00:00Z' }, { id: 'card', name: 'Card', mask: '0002', kind: 'CARD', balance: 1000, asOf: '2026-11-16T05:00:00Z' }], bankBalance: 1200 });
    d.cashflow = d.cashflow!.map((m) => ({ ...m, spend: { ...m.spend, ADS: (m.spend.ADS ?? 0) + 600 } }));
    const p = cashPlan(d)!;
    expect(p.scenarios[0].runsOutAt).toBe(0);
    const v = cashVerdict(p);
    expect(v.tone).toBe('red');
    expect(v.title).toBe('AT PAYOUTS ONLY, CASH RUNS OUT IN NOV ’26');
  });

  it('a steady decline at payouts only is amber with the monthly fall', () => {
    const d = data();
    d.cashflow = d.cashflow!.map((m) => ({ ...m, spend: { ...m.spend, ADS: (m.spend.ADS ?? 0) + 200 } }));
    const v = cashVerdict(cashPlan(d)!);
    expect(v.tone).toBe('amber');
    expect(v.title).toBe('AT PAYOUTS ONLY, CASH FALLS ABOUT $100 A MONTH');
  });

  it('uses the owner\'s recurring cost lines when there are any', () => {
    const p = cashPlan(data({ costs: [{ id: 'x', name: 'Studio', category: 'OPS', amount: 400, cadence: 'MONTHLY', active: true }] }))!;
    expect(p.moneyOut.source).toBe('COST_LINES');
    expect(p.moneyOut.monthly).toBe(400);
  });

  it('makes no forecast without a cash figure or without complete synced months', () => {
    expect(cashPlan(data({ bankBalance: null, accounts: [] }))).toBeNull();
    expect(cashPlan(data({ cashflow: [{ month: '2026-11', partial: true, cashIn: {}, spend: {} }] }))).toBeNull();
  });
});

describe('one cash answer across the dashboard', () => {
  it('alerts and insights use the plan, not runway = cash ÷ burn or a sales-based "self-funding"', async () => {
    const { buildNotices, buildInsights, computeMetrics, trailing30dRevenue } = await import('../engine');
    const d = data();
    d.cashflow = d.cashflow!.map((m) => ({ ...m, spend: { ...m.spend, ADS: (m.spend.ADS ?? 0) + 200 } }));
    const m = computeMetrics(d, 30);
    const notices = buildNotices(d, m).map((n) => n.text);
    expect(notices.some((t) => t.startsWith('RUNWAY'))).toBe(false);
    expect(notices).toContain('AT PAYOUTS ONLY, CASH FALLS ABOUT $100 A MONTH');
    const insights = buildInsights(d, m, trailing30dRevenue(d)).map((i) => i.text);
    expect(insights).toContain('SIX-MONTH CASH: AT PAYOUTS ONLY, CASH FALLS ABOUT $100 A MONTH');
    expect(insights.some((t) => t.includes('SELF-FUNDING'))).toBe(false);
  });
});
