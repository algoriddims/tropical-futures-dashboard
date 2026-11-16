import { describe, expect, it } from 'vitest';
import { goalPace, monthMoney, recurringCharges, taggedDeposits } from '../moneyIn';
import type { ParkData } from '../types';

// Synthetic — not real account data.
type D = Pick<ParkData, 'cashflow' | 'deposits' | 'depositTags' | 'vendorSpend' | 'vendorMarks'>;
const base = (): D => ({
  cashflow: [
    { month: '2026-10', partial: false, cashIn: { SHOPIFY_PAYOUTS: 900.1, PAYPAL: 100.2, OWNER_TRANSFERS: 700, OTHER_IN: 300 }, spend: { SOFTWARE: 400, SHIPPING: 250.55 } },
    { month: '2026-11', partial: true, cashIn: { SHOPIFY_PAYOUTS: 500 }, spend: { SOFTWARE: 100 } },
  ],
  deposits: [
    { id: 'd1', date: '2026-10-03', amount: 500, kind: 'OWNER_TRANSFERS', label: 'Transfer', memo: 'shop x october sales' },
    { id: 'd2', date: '2026-10-20', amount: 200, kind: 'OWNER_TRANSFERS', label: 'Transfer' },
    { id: 'd3', date: '2026-10-25', amount: 300, kind: 'OTHER_IN', label: 'Invoice payment' },
  ],
});

describe('money in vs money out (all channels, bank basis)', () => {
  it('counts payouts automatically and other deposits only once tagged', () => {
    const none = monthMoney(base(), '2026-10')!;
    expect(none.counted).toBe(1000.3);                // Shopify + PayPal only
    expect(none.untagged).toBe(1000);
    expect(none.untaggedCount).toBe(3);
    expect(none.status).toBe('partial');              // a floor until the deposits are tagged
    expect(none.spending).toBe(650.55);
    expect(none.net).toBe(349.75);

    const tagged = monthMoney({ ...base(), depositTags: { d1: 'STOCKIST', d2: 'NOT_REVENUE', d3: 'CLIENT' } }, '2026-10')!;
    expect(tagged.stockist).toBe(500);
    expect(tagged.client).toBe(300);
    expect(tagged.notRevenue).toBe(200);              // the owner's own money is never revenue
    expect(tagged.counted).toBe(1800.3);
    expect(tagged.untagged).toBe(0);
    expect(tagged.status).toBe('valid');
    expect(tagged.net).toBe(1149.75);
  });

  it('a month without bank data is unknown, not zero', () => {
    expect(monthMoney(base(), '2026-09')).toBeNull();
    expect(monthMoney({}, '2026-10')).toBeNull();
  });

  it('an older snapshot without the deposit list shows the lump as untagged and uncounted', () => {
    const d = base();
    delete d.deposits;
    const m = monthMoney(d, '2026-10')!;
    expect(m.untagged).toBe(1000);
    expect(m.untaggedCount).toBeNull();
    expect(m.counted).toBe(1000.3);
  });

  it('tags for deposits that are not in this snapshot change nothing', () => {
    expect(monthMoney({ ...base(), depositTags: { gone: 'STOCKIST' } }, '2026-10')!.counted).toBe(1000.3);
  });

  it('lists deposits newest first with their tags', () => {
    const list = taggedDeposits({ ...base(), depositTags: { d3: 'CLIENT' } });
    expect(list.map((x) => [x.id, x.tag])).toEqual([['d3', 'CLIENT'], ['d2', null], ['d1', null]]);
  });
});

describe('goal pace', () => {
  it('says what the rest of the month needs per day', () => {
    const p = goalPace(893, 2000, '2026-11-15')!;
    expect(p.daysInMonth).toBe(30);
    expect(p.runningPerDay).toBeCloseTo(59.53, 2);
    expect(p.neededPerDay).toBeCloseTo(73.8, 2);
    expect(p.met).toBe(false);
  });
  it('is met at or above the goal, has no per-day figure on the last day, and needs a goal', () => {
    expect(goalPace(2500, 2000, '2026-11-15')).toMatchObject({ met: true, neededPerDay: 0 });
    expect(goalPace(500, 2000, '2026-11-30')!.neededPerDay).toBeNull();
    expect(goalPace(500, 0, '2026-11-15')).toBeNull();
    expect(goalPace(100, 2000, '2028-02-29')!.daysInMonth).toBe(29);
  });
});

describe('recurring charges', () => {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const every = (amount: number, ms = months) => Object.fromEntries(ms.map((m) => [m, amount]));
  const d = (): D => ({
    cashflow: [...months.map((month) => ({ month, partial: false, cashIn: {}, spend: {} })), { month: '2026-11', partial: true, cashIn: {}, spend: {} }],
    vendorSpend: [
      { vendor: 'Design Suite', kind: 'SOFTWARE', byMonth: { ...every(74.19), '2026-11': 74.19 } },
      { vendor: 'Email Tool', kind: 'SOFTWARE', byMonth: { ...every(45), '2026-10': 60 } },
      { vendor: 'Forms', kind: 'SOFTWARE', byMonth: every(33.5, months.slice(0, 4)) },          // stopped after August
      { vendor: 'New Editor', kind: 'SOFTWARE', byMonth: every(60, months.slice(3)) },           // started in August
      { vendor: 'Annual Plan', kind: 'SOFTWARE', byMonth: { '2026-07': 228 } },
      { vendor: 'Coffee', kind: 'OTHER', byMonth: { '2026-06': 18 } },
      { vendor: 'Refunded', kind: 'SOFTWARE', byMonth: { '2026-06': 0 } },
    ],
  });

  it('lists what is charged most months, active ones first and largest first', () => {
    const r = recurringCharges(d())!;
    expect(r.monthsLooked).toEqual(months);
    expect(r.recurring.map((x) => [x.vendor, x.typicalMonthly, x.monthsSeen, x.active])).toEqual([
      ['Design Suite', 74.19, 6, true],
      ['New Editor', 60, 3, true],
      ['Email Tool', 45, 6, true],          // the median, not the one-month bump to $60
      ['Forms', 33.5, 4, false],            // not charged in the last two months: shown, not totalled
    ]);
    expect(r.monthlyTotal).toBe(179.19);
    expect(r.recurring[0].lastMonth).toBe('2026-11');
  });

  it('puts annual plans and one-offs in their own list above the size threshold', () => {
    expect(recurringCharges(d())!.occasional).toEqual([{ vendor: 'Annual Plan', total: 228, lastMonth: '2026-07' }]);
  });

  it('totals what is marked to cut', () => {
    const r = recurringCharges({ ...d(), vendorMarks: { 'Email Tool': 'CUT', Forms: 'CUT', 'Design Suite': 'KEEP' } })!;
    expect(r.markedToCut).toBe(45);         // Forms is already inactive, so it adds nothing
    expect(r.recurring.find((x) => x.vendor === 'Email Tool')!.mark).toBe('CUT');
  });

  it('is unavailable without vendor spending or a complete month', () => {
    expect(recurringCharges({})).toBeNull();
    expect(recurringCharges({ vendorSpend: [], cashflow: [{ month: '2026-11', partial: true, cashIn: {}, spend: {} }] })).toBeNull();
  });
});
