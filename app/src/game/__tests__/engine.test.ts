import { describe, expect, it } from 'vitest';
import {
  buildInsights, buildMoves, buildNotices, combineRating, computeMetrics, forecastCashflow, rideState, sellThrough,
} from '../engine';
import { fixtureData } from '../fixtures';
import type { DayPoint, ParkData, Product } from '../types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Contract case 6: limited drop receives 10, sells 10, no planned replenishment.
const limited: Product = {
  id: 'ltd', name: 'LIMITED TEE', drop: 'ONE-OFF', price: 50, unitCost: 20,
  stock: 0, startInventory: 10, sold7d: 4, soldPrev7d: 6, soldTotal: 10, published: true, restockPolicy: 'LIMITED',
};
const withProducts = (ps: Product[]): ParkData => ({ ...clone(fixtureData), products: ps, channels: [], campaigns: [], quests: [] });

describe('intentional sellout (contract case 6)', () => {
  it('is SOLD OUT with 100% batch sell-through, never "broken"', () => {
    expect(rideState(limited)).toBe('SOLD OUT');
    expect(sellThrough(limited)).toBe(1);
  });

  it('produces a green completion notice — no red alert or restock move', () => {
    const d = withProducts([limited]);
    const m = computeMetrics(d, 7);
    const shop = buildNotices(d, m).filter((n) => n.source === 'SHOP');
    expect(shop).toHaveLength(1);
    expect(shop[0].tier).toBe('green');
    expect(shop[0].text).not.toMatch(/BROKEN/);
    expect(buildMoves(d, m, 0).some((mv) => mv.text.startsWith('RESTOCK'))).toBe(false);
  });

  it('does not count against ride health or inventory discipline', () => {
    const live: Product = { ...limited, id: 'core', name: 'CORE', stock: 40, sold7d: 14, restockPolicy: undefined };
    const a = computeMetrics(withProducts([live]), 7).ratingParts;
    const b = computeMetrics(withProducts([live, limited]), 7).ratingParts;
    const pick = (ps: typeof a, l: string) => ps.find((p) => p.label === l)?.score;
    expect(pick(b, 'PRODUCT HEALTH')).toBe(pick(a, 'PRODUCT HEALTH'));
    expect(pick(b, 'INVENTORY DISCIPLINE')).toBe(pick(a, 'INVENTORY DISCIPLINE'));
  });

  it('a limited run sold through at a stockist gets no "ship a restock" notice or move', () => {
    const d = withProducts([{ ...limited, stock: 0 }]);
    d.channels = [{ name: 'SHOP', location: 'X', type: 'STOCKIST', revenue: 0, orders: 0, stock: [{ productId: 'ltd', allocated: 10, sold: 10 }] }];
    const m = computeMetrics(d, 7);
    expect(buildNotices(d, m).some((n) => n.text.includes('NEARLY SOLD THROUGH'))).toBe(false);
    expect(buildMoves(d, m, 0).some((mv) => mv.text.startsWith('SHIP'))).toBe(false);
  });

  it('a REPLENISH item selling out is red with a restock move; no policy is an amber decision', () => {
    const core = { ...limited, id: 'cap', name: 'CAP', restockPolicy: 'REPLENISH' as const };
    const unset = { ...limited, id: 'x', name: 'X', restockPolicy: undefined };
    const d = withProducts([core, unset]);
    const m = computeMetrics(d, 7);
    const shop = buildNotices(d, m).filter((n) => n.source === 'SHOP');
    expect(shop.find((n) => n.text.startsWith('CAP'))?.tier).toBe('red');
    expect(shop.find((n) => n.text.startsWith('X'))?.tier).toBe('amber');
    const moves = buildMoves(d, m, 0).map((mv) => mv.text);
    expect(moves).toContain('RESTOCK CAP');
    expect(moves).not.toContain('RESTOCK X');
  });
});

describe('sessions and conversion are measured or unavailable (contract case 7)', () => {
  const day = (date: string, orders: number, sessions?: number): DayPoint =>
    ({ date, revenue: orders * 50, orders, spend: 0, ...(sessions === undefined ? {} : { sessions }) });

  it('sales are reported, conversion is unavailable when sessions are absent', () => {
    const d = { ...clone(fixtureData), days: [day('09-01', 2)] };
    const m = computeMetrics(d, 1);
    expect(m.revenue).toBe(100);
    expect(m.guests).toBeNull();
    expect(m.conversionRate).toBeNull();
  });

  it('a window with only some days measured is unavailable, not a partial count', () => {
    const d = { ...clone(fixtureData), days: [day('09-01', 2, 100), day('09-02', 2)] };
    expect(computeMetrics(d, 2).conversionRate).toBeNull();
  });

  it('uses measured sessions when every day has them', () => {
    const d = { ...clone(fixtureData), days: [day('09-01', 2, 100), day('09-02', 3, 150)] };
    const m = computeMetrics(d, 2);
    expect(m.guests).toBe(250);
    expect(m.conversionRate).toBeCloseTo(2);
  });

  it('revenue change vs previous period is unavailable without a full previous window', () => {
    const d = { ...clone(fixtureData), days: [day('09-01', 2)] };
    const m = computeMetrics(d, 1);
    expect(m.revenueDeltaPct).toBeNull();
    expect(m.ratingParts.find((p) => p.label === 'SALES MOMENTUM')?.score).toBeNull();
    const two = { ...clone(fixtureData), days: [day('09-01', 4), day('09-02', 6)] };
    expect(computeMetrics(two, 1).revenueDeltaPct).toBeCloseTo(50);
  });

  it('a % change needs a few orders on both sides — 4 vs 2 orders is noise, not +100%', () => {
    const few = { ...clone(fixtureData), days: [day('09-01', 2), day('09-02', 4)] };
    expect(computeMetrics(few, 1).revenueDeltaPct).toBeNull();
  });

  it('missing refund/repeat rates leave GUEST HAPPINESS out of the rating instead of scoring it', () => {
    const d = clone(fixtureData);
    delete d.refundRate;
    delete d.repeatRate;
    const parts = computeMetrics(d, 7).ratingParts;
    expect(parts.find((p) => p.label === 'REFUNDS & REPEAT BUYERS')?.score).toBeNull();
  });

  it('a complete rating is unchanged by the renormalisation (weights sum to 10)', () => {
    const parts = [
      { label: 'a', score: 50, weight: 4, note: '' },
      { label: 'b', score: 100, weight: 6, note: '' },
    ];
    expect(combineRating(parts)).toBe(800);
    expect(combineRating([...parts, { label: 'c', score: null, weight: 5, note: '' }])).toBe(800);
  });
});

describe('no invented money owed', () => {
  it('stockist shelf sales do not change the cash forecast', () => {
    const d = clone(fixtureData);
    const noShelves = { ...clone(fixtureData), channels: d.channels.map((c) => ({ ...c, stock: [], revenue: 0 })) };
    const a = forecastCashflow(d, 1000, 6).map((m) => m.closing);
    const b = forecastCashflow(noShelves, 1000, 6).map((m) => m.closing);
    expect(a).toEqual(b);
  });

  it('there is no "collect stockist payouts" move', () => {
    const d = clone(fixtureData);
    const moves = buildMoves(d, computeMetrics(d, 7), 0);
    expect(moves.some((m) => /PAYOUT|OWED|COLLECT/.test(m.text))).toBe(false);
  });
});

describe('plain business language', () => {
  it('no generated message, label or band uses theme-park vocabulary', () => {
    const d = clone(fixtureData);
    for (const range of [1, 7, 30]) {
      const m = computeMetrics(d, range);
      const text = [
        m.ratingBand,
        ...m.ratingParts.flatMap((p) => [p.label, p.note]),
        ...buildNotices(d, m).flatMap((n) => [n.source, n.text, n.detail]),
        ...buildMoves(d, m, 5000).flatMap((mv) => [mv.text, mv.detail]),
        ...buildInsights(d, m, 5000).flatMap((i) => [i.text, i.detail]),
      ].join('\n');
      expect(text).not.toMatch(/\b(PARK|RIDES?|GUESTS?|QUESTS?|SCENARIOS?|MECHANIC|BROKEN|REWARD)\b/i);
    }
  });
});

describe('low-volume honesty (found on real Shopify data)', () => {
  const base: Product = { id: 'x', name: 'X', drop: 'D', price: 45, unitCost: 15, stock: 4, startInventory: 8, sold7d: 0, soldPrev7d: 0, soldTotal: 4, published: true };

  it('no sales this week is never THRIVING, however good lifetime sell-through looks', () => {
    expect(rideState(base)).not.toBe('THRIVING');
  });

  it('one or two units is not a trend', () => {
    expect(rideState({ ...base, sold7d: 2, soldPrev7d: 0 })).not.toBe('THRIVING');
    expect(rideState({ ...base, sold7d: 4, soldPrev7d: 1 })).toBe('THRIVING');
  });

  it('nothing sold and nothing in stock gives 0, not NaN', () => {
    expect(sellThrough({ ...base, stock: 0, soldTotal: 0 })).toBe(0);
  });
});
