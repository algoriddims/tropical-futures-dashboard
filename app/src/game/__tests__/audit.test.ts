// Regression checks for the 13 Oct 2026 audit (docs/reviews/2026-10-13-audit.md).
import { describe, expect, it } from 'vitest';
import {
  buildMoves, buildNotices, computeMetrics, forecastCashflow, forecastVerdict, isSlowStock, monthToDateSales,
  netCash, runwayMonths,
} from '../engine';
import { extractManual, applyManual } from '../overrides';
import { validateParkData } from '../validate';
import { money, pct, plural } from '../format';
import { fixtureData } from '../fixtures';
import type { BankAccount, ParkData, Product } from '../types';

const clone = <T,>(x: T): T => structuredClone(x);
const acct = (kind: BankAccount['kind'], balance: number, mask = '0000'): BankAccount =>
  ({ id: `${kind}-${mask}`, name: kind, mask, kind, balance, asOf: '2026-10-13T04:09:11Z' });

/** The shape of the real 13 Oct position: checking overdrawn, a little savings, a card balance. */
function synced(): ParkData {
  const d = clone(fixtureData);
  d.accounts = [acct('CHECKING', -136.27, '9318'), acct('SAVINGS', 41, '2216'), acct('CARD', 1431.18, '2670')];
  d.bankBalance = -95.27;
  d.costs = [{ id: 'k', name: 'BURN', category: 'OPS', amount: 1970.75, cadence: 'MONTHLY', active: true }];
  d.pipeline = [];
  d.campaigns = [];
  d.channels = [];
  d.days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, revenue: 518.25 / 30, orders: 0 }));
  return d;
}

const product = (p: Partial<Product>): Product => ({
  id: 'p', name: 'P', drop: 'D', price: 50, unitCost: 20, stock: 0, startInventory: 0,
  sold7d: 0, soldPrev7d: 0, soldTotal: 0, published: true, ...p,
});

describe('cash is net of the card (audit 1.1, 1.8)', () => {
  it('net cash = bank − card owed; runway is 0 when that is negative', () => {
    const d = synced();
    expect(netCash(d)).toBeCloseTo(-1526.45, 2);
    expect(runwayMonths(d)).toBe(0);
    // positive bank, but a bigger card balance: still short
    const d2 = { ...synced(), bankBalance: 500 };
    expect(netCash(d2)).toBeCloseTo(-931.18, 2);
    expect(runwayMonths(d2)).toBe(0);
  });

  it('forecast opens at net cash, starts with the prorated rest of this month, then 6 full months', () => {
    const now = new Date(2026, 9, 13); // 13 Oct: 18 of 31 days left
    const fc = forecastCashflow(synced(), 518.25, 6, now);
    expect(fc).toHaveLength(7);
    expect(fc[0].label).toBe('OCT 26 (REST)');
    expect(fc[0].opening).toBeCloseTo(-1526.45, 2);
    expect(fc[0].fraction).toBeCloseTo(18 / 31, 5);
    expect(fc[0].net).toBeCloseTo((518.25 - 1970.75) * (18 / 31), 2);
    expect(fc[1].label).toBe('NOV 26');
    // end of November is much deeper than the old "$1,548 short" figure
    expect(fc[1].closing).toBeLessThan(-3500);
    expect(forecastVerdict(fc).text).toMatch(/^SHORT NOW — −\$1,526 NET OF CARD/);
  });

  it('top move says cash is short now, sized to the real gap, with no production advice when nothing is in production', () => {
    const d = synced();
    const moves = buildMoves(d, computeMetrics(d, 7), 518.25);
    const short = moves.find((m) => m.text === 'CASH IS SHORT NOW');
    expect(short?.impact).toBe(1526);
    expect(short?.detail).toContain('$1,431');
    expect(short?.detail).not.toMatch(/production run/i);
  });

  it('a card balance gets its own notice; red when it exceeds cash', () => {
    const n = buildNotices(synced(), computeMetrics(synced(), 7));
    const card = n.find((x) => x.text.startsWith('CARD OWES'));
    expect(card?.tier).toBe('red');
    expect(card?.text).toBe('CARD OWES $1,431.18');
    // no duplicate "RUNWAY 0.0 MONTHS" on top of the overdrawn + card notices
    expect(n.some((x) => x.text.startsWith('RUNWAY'))).toBe(false);
  });
});

describe('an unknown bank balance stays unknown (audit 1.3)', () => {
  const noBank = () => {
    const raw: Record<string, unknown> = clone(fixtureData) as unknown as Record<string, unknown>;
    delete raw.bankBalance;
    delete raw.accounts;
    const v = validateParkData(raw);
    if (!v.ok) throw new Error(v.errors.join('; '));
    return v.data;
  };

  it('validates to null, not $0', () => {
    expect(noBank().bankBalance).toBeNull();
  });

  it('no runway, no forecast, no red alarm — an amber "unknown" prompt instead', () => {
    const d = noBank();
    expect(runwayMonths(d)).toBeNull();
    expect(forecastCashflow(d, 500)).toEqual([]);
    expect(forecastVerdict([]).tone).toBe('amber');
    const n = buildNotices(d, computeMetrics(d, 7));
    expect(n.some((x) => /RUNWAY/.test(x.text))).toBe(false);
    expect(n.find((x) => x.text === 'CASH POSITION UNKNOWN')?.tier).toBe('amber');
  });
});

describe('synced bank never leaks into manual entries (audit 1.2)', () => {
  it('extractManual omits bankBalance while accounts are synced', () => {
    expect('bankBalance' in extractManual(synced())).toBe(false);
    const manual = { ...clone(fixtureData), accounts: undefined, bankBalance: 1200 };
    expect(extractManual(manual).bankBalance).toBe(1200);
  });

  it('a later sync without the bank does not resurrect the synced figure', () => {
    const edited = { ...synced(), annualBudget: 12000 };
    const saved = extractManual(edited); // what an edit would persist
    const laterNoBank = { ...clone(fixtureData), accounts: undefined, bankBalance: null };
    expect(applyManual(laterNoBank, saved).bankBalance).toBeNull();
  });
});

describe('score (audit 1.5)', () => {
  it('no goals → goal progress left out, not a made-up 70', () => {
    const d = { ...clone(fixtureData), quests: [] };
    expect(computeMetrics(d, 7).ratingParts.find((p) => p.label === 'GOAL PROGRESS')?.score).toBeNull();
  });

  it('includes cash, and never reads well while cash is short', () => {
    const m = computeMetrics(synced(), 7);
    expect(m.ratingParts.find((p) => p.label === 'CASH & RUNWAY')?.score).toBe(0);
    expect(m.ratingBand).toBe('CASH SHORT');
  });

  it("doesn't move with the range being viewed", () => {
    const d = clone(fixtureData);
    expect(new Set([1, 7, 30].map((r) => computeMetrics(d, r).rating)).size).toBe(1);
  });
});

describe('slow stock and sellout noise (audit 1.6, 1.7)', () => {
  it('slow = a year or more of stock at the 12-month pace', () => {
    expect(isSlowStock(product({ stock: 46, soldTotal: 9 }))).toBe(true);   // ~61 months
    expect(isSlowStock(product({ stock: 20, soldTotal: 26 }))).toBe(false); // ~9 months
    expect(isSlowStock(product({ stock: 46, soldTotal: 9, tracked: false }))).toBe(false);
  });

  it('the clear-out move states what 50% off really clears', () => {
    const d = { ...clone(fixtureData), campaigns: [], channels: [], pipeline: [], costs: [], bankBalance: 50000, accounts: undefined,
      products: [product({ name: 'SARONG', stock: 46, price: 55, unitCost: 26.97, soldTotal: 9 })] };
    const mv = buildMoves(d, computeMetrics(d, 7), 0).find((m) => m.text === 'CLEAR SARONG');
    expect(mv?.impact).toBe(1265);
    expect(mv?.detail).toContain('$24 over cost');
    expect(mv?.detail).toContain('only if they sell');
  });

  it('out-of-stock lines with no sales are one tidy-up notice; untracked items never "sell out"', () => {
    const d = { ...clone(fixtureData), campaigns: [], channels: [], pipeline: [], quests: [],
      products: [
        product({ id: 'a', name: 'A' }), product({ id: 'b', name: 'B' }),
        product({ id: 'c', name: 'C', soldTotal: 5 }),
        product({ id: 'd', name: 'D', tracked: false }),
      ] };
    const n = buildNotices(d, computeMetrics(d, 7));
    expect(n.filter((x) => /SOLD OUT/.test(x.text)).map((x) => x.text)).toEqual(['C SOLD OUT — RESTOCK OR RETIRE?']);
    expect(n.find((x) => x.text.startsWith('2 LISTINGS AT 0 STOCK'))?.tier).toBe('green');
    expect(n.find((x) => x.text.startsWith('C SOLD OUT'))?.detail).toBe('5 units sold in the last 12 months. No restock policy set for this product.');
  });

  it('notices carry no invented clock time', () => {
    expect(buildNotices(synced(), computeMetrics(synced(), 7)).every((n) => n.time === '')).toBe(true);
  });
});

describe('formatting (audit 2.5)', () => {
  it('money: one style everywhere', () => {
    expect(money(-8810.4)).toBe('−$8,810');
    expect(money(17625.5)).toBe('$17,626');
    expect(money(1970.753)).toBe('$1,971');
    expect(money(-136.27, { cents: true })).toBe('−$136.27');
    expect(money(37.5, { cents: true })).toBe('$37.50');
    expect(money(24, { signed: true })).toBe('+$24');
    expect(money(-0.4)).toBe('$0');
    expect(money(null)).toBe('—');
    expect(money(Number.NaN)).toBe('—');
  });

  it('plural and pct', () => {
    expect(plural(1, 'unit')).toBe('1 unit');
    expect(plural(3, 'unit')).toBe('3 units');
    expect(plural(2, 'LISTING')).toBe('2 LISTINGS');
    expect(pct(-12.4)).toBe('−12%');
    expect(pct(null)).toBe('—');
  });
});

describe('month-to-date sales for the goal (audit 2.2)', () => {
  it('sums this calendar month from dated days; null without years in the dates', () => {
    const d = { days: [
      { date: '2026-09-30', revenue: 100, orders: 1 },
      { date: '2026-10-01', revenue: 40, orders: 1 },
      { date: '2026-10-13', revenue: 55.5, orders: 1 },
    ] };
    expect(monthToDateSales(d, new Date(2026, 9, 13))).toBe(95.5);
    expect(monthToDateSales({ days: [{ date: '10-13', revenue: 5, orders: 1 }] }, new Date(2026, 9, 13))).toBeNull();
  });
});

describe('sync deltas (audit low: overlapping partial day)', () => {
  it('late orders on a day both syncs cover are counted', async () => {
    const { diffSnapshots } = await import('../engine');
    const prev = { ...clone(fixtureData), days: [{ date: '2026-10-12', revenue: 100, orders: 2 }, { date: '2026-10-13', revenue: 40, orders: 1 }] };
    const next = { ...clone(fixtureData), days: [{ date: '2026-10-12', revenue: 100, orders: 2 }, { date: '2026-10-13', revenue: 135, orders: 2 }, { date: '2026-10-14', revenue: 20, orders: 1 }] };
    const d = diffSnapshots(prev, next);
    expect(d.revenue).toBe(115);
    expect(d.orders).toBe(2);
  });
});
