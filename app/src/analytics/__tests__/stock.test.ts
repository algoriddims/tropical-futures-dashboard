// Stock desk figures — hand-checkable fixture (USD cents).
import { describe, expect, it } from 'vitest';
import type { AnalyticsSnapshot, VariantDailyRow, VariantRecord } from '../types';
import { lastCompleteDays } from '../period';
import { productPerformance, stockRisk } from '../metrics';
import { runway, shelfValue, sizeCurves, splitBySales, stockSegments } from '../stock';
import { blankRun, suggestedLeadWeeks, unlinkedRunUnits } from '../../game/production';
import type { ProductionRun } from '../../game/production';

const loc = (available: number) => ({ locationId: 'L1', locationName: 'Shop', available, onHand: Math.max(0, available), committed: 0, incoming: 0, reserved: 0, unavailable: 0 });

const variant = (variantId: string, productId: string, productTitle: string, productType: string, size: string | null, available: number, extra: Partial<VariantRecord> = {}): VariantRecord => ({
  variantId, productId, productTitle, productType, variantTitle: size ?? 'Default Title', sku: null,
  options: size ? [{ name: 'Size', value: size }] : [], price: 4500, unitCost: 1500,
  productCreatedAt: '2025-01-01T00:00:00Z', productPublishedAt: '2025-01-02T00:00:00Z', tracked: true, isBundle: false, inventory: [loc(available)], ...extra,
});

const sale = (date: string, productId: string, variantId: string, units: number, net = units * 4000): VariantDailyRow => ({
  date, channel: 'Online Store', productId, variantId, grossSales: net, discounts: 0, returns: 0, netSales: net, cogs: null, netSalesWithCost: 0,
  qtyOrdered: units, qtyReturned: 0, netItems: units,
});

// Stock read 29 Oct 2026 (New York) → the 28-day window is 1–28 Oct.
function fixture(): AnalyticsSnapshot {
  return {
    version: 1, source: 'shopify', shop: 'test.shop', currency: 'USD', timezone: 'America/New_York',
    extractedAt: '2026-10-29T12:00:00Z', inventoryAsOf: '2026-10-29T12:00:00Z',
    salesCoverage: { from: '2025-10-01', to: '2026-10-28', missing: [] },
    daily: [],
    variantDaily: [
      sale('2026-10-15', 'cap', 'cap-1', 28),                 // 1 a day
      sale('2026-10-10', 'tee', 'tee-s', 3),                  // sold out, still selling
      sale('2026-10-12', 'tee', 'tee-m', 1),                  // one sale: too few to project
      sale('2026-03-01', 'tee', 'tee-s', 10),
      sale('2026-03-01', 'tee', 'tee-m', 6),
      sale('2026-03-01', 'tee', 'tee-l', 2),
      sale('2026-05-01', 'sarong', 'sarong-1', 1),            // before the 90-day window
    ],
    variants: [
      variant('cap-1', 'cap', 'Washed cap', 'Cap', null, 10, { unitCost: 700 }),
      variant('tee-s', 'tee', 'Logo tee', 'Tshirt', 'S', 0),
      variant('tee-m', 'tee', 'Logo tee', 'Tshirt', 'M', 5),
      variant('tee-l', 'tee', 'Logo tee', 'Tshirt', 'Large', 4),
      variant('sarong-1', 'sarong', 'Sarong', 'Sarong', null, 40, { unitCost: 2700 }),
      variant('hood-m', 'hood', 'Hoodie', 'Hoodie', 'M', 2, { unitCost: null }),
    ],
    customers: [], notes: [],
  };
}

const plan = { leadTimeWeeks: 4, incoming: [{ id: 'in-1', productId: 'cap', variantId: null, units: 100, expectedDate: '2026-11-18' }] };
const products = (s: AnalyticsSnapshot) => productPerformance(s, lastCompleteDays(28, 'America/New_York', new Date('2026-10-29T12:00:00Z')));

describe('stockSegments', () => {
  it('sells stock in hand, then is short, then sells what arrived', () => {
    expect(stockSegments(10, 1, [{ day: 20, units: 100 }], 84)).toEqual([
      { kind: 'hand', from: 0, to: 10 }, { kind: 'short', from: 10, to: 19 }, { kind: 'incoming', from: 19, to: 84 },
    ]);
  });
  it('is short from the first day when nothing is in stock or on the way', () => {
    expect(stockSegments(0, 0.5, [], 28)).toEqual([{ kind: 'short', from: 0, to: 28 }]);
  });
  it('an arrival before stock runs out leaves no gap', () => {
    expect(stockSegments(10, 1, [{ day: 5, units: 10 }], 30).map((x) => x.kind)).toEqual(['hand', 'incoming', 'short']);
    expect(stockSegments(10, 1, [{ day: 5, units: 10 }], 30)[1]).toEqual({ kind: 'incoming', from: 10, to: 20 });
  });
});

describe('runway', () => {
  it('lists sizes that sell, earliest shortage first, and agrees with stockRisk', () => {
    const s = fixture();
    const r = runway(s, products(s), plan)!;
    expect(r.asOf).toBe('2026-10-29');
    expect(r.leadDays).toBe(28);
    expect(r.rows.map((x) => `${x.product}|${x.variant}`)).toEqual(['Logo tee|S', 'Washed cap|null']);
    const cap = r.rows[1];
    expect(cap.firstShortDay).toBe(11);
    expect(cap.runsOutOn).toBe('2026-11-09');
    expect(cap.reorderBy).toBe('2026-10-12');
    expect(cap.arrivals).toEqual([{ date: '2026-11-18', day: 20, units: 100, note: undefined }]);
    const risk = stockRisk(s, s.variants[0], plan, 1)!;
    expect(cap.gapDays28).toBe(risk.gapDays);
    expect(cap.gapDays28).toBe(9);
    expect(cap.segments.filter((x) => x.kind === 'short' && x.from < 28).reduce((n, x) => n + Math.min(x.to, 28) - x.from, 0)).toBe(risk.gapDays);
    expect(cap.atRisk).toBe(9 * 4000);
    expect(r.rows[0].firstShortDay).toBe(1);
  });
  it('keeps one-sale sizes out of the chart but reports them', () => {
    const s = fixture();
    expect(runway(s, products(s), plan)!.thin).toEqual([{ label: 'Logo tee · M', units: 1 }]);
  });
  it('without a lead time there is no reorder-by date', () => {
    const s = fixture();
    const r = runway(s, products(s), { ...plan, leadTimeWeeks: null })!;
    expect(r.leadDays).toBeNull();
    expect(r.rows.every((x) => x.reorderBy === null)).toBe(true);
  });
  it('needs the business timezone', () => {
    const s = { ...fixture(), timezone: null };
    expect(runway(s, [], plan)).toBeNull();
  });
});

describe('sizeCurves', () => {
  it('counts 12 months of sales per size (spellings merged) next to stock now', () => {
    const c = sizeCurves(fixture());
    expect(c.window).toEqual({ from: '2025-10-29', to: '2026-10-28' });
    expect(c.covered).toBe(c.total);
    // the hoodie has one size, so no curve; caps and sarongs have no sizes
    expect(c.curves.map((x) => x.type)).toEqual(['Tshirt']);
    expect(c.curves[0].sizes).toEqual([{ size: 'S', sold: 13, stock: 0 }, { size: 'M', sold: 7, stock: 5 }, { size: 'L', sold: 2, stock: 4 }]);
    expect(c.curves[0].soldTotal).toBe(22);
    expect(c.curves[0].stockTotal).toBe(9);
  });
  it('splits a run across sizes by sales, adding up exactly', () => {
    const curve = sizeCurves(fixture()).curves[0];
    // 13 : 7 : 2 of 100 → 59.09 / 31.82 / 9.09
    expect(splitBySales(curve, 100)).toEqual([{ size: 'S', units: 59 }, { size: 'M', units: 32 }, { size: 'L', units: 9 }]);
    expect(splitBySales({ ...curve, soldTotal: 0 }, 100)).toBeNull();
  });
});

describe('shelfValue', () => {
  it('values sellable stock at recorded cost and flags products with no sales in 90 days', () => {
    const v = shelfValue(fixture());
    expect(v.window).toEqual({ from: '2026-07-31', to: '2026-10-28' });
    expect(v.rows.map((r) => r.title)).toEqual(['Sarong', 'Logo tee', 'Washed cap', 'Hoodie']);
    expect(v.rows[0]).toMatchObject({ units: 40, atCost: 108000, soldInWindow: 0, lastSale: '2026-05-01' });
    expect(v.rows[1]).toMatchObject({ units: 9, atCost: 13500, soldInWindow: 4 });
    expect(v.rows[3]).toMatchObject({ units: 2, atCost: 0, unitsNoCost: 2 });
    expect(v.units).toBe(61);
    expect(v.atCost).toBe(108000 + 13500 + 7000);
    expect(v.unitsNoCost).toBe(2);
    expect(v.idleAtCost).toBe(108000);
    expect(v.idleUnits).toBe(42);
  });
});

describe('lead time suggestion from production runs', () => {
  const run = (o: Partial<ProductionRun>): ProductionRun => ({ ...blankRun('r', new Date('2026-11-01T00:00:00Z')), ...o });
  it('uses bulk + transit days of the latest run that has both, to the half week', () => {
    const runs = [
      run({ name: 'Old', invoiceDate: '2026-09-01', leadTimes: { sampleDays: null, bulkDays: 30, transitDays: 30 } }),
      run({ name: 'Reorder', invoiceDate: '2026-11-03', leadTimes: { sampleDays: null, bulkDays: 20, transitDays: 12 } }),
      run({ name: 'Newest, no transit', invoiceDate: '2026-11-16', leadTimes: { sampleDays: 20, bulkDays: 25, transitDays: null } }),
    ];
    expect(suggestedLeadWeeks(runs)).toEqual({ weeks: 4.5, days: 32, run: 'Reorder' });
  });
  it('offers nothing when no run has both', () => {
    expect(suggestedLeadWeeks([run({ leadTimes: { sampleDays: 20, bulkDays: 25, transitDays: null } })])).toBeNull();
  });
  it('counts goods not linked to a Shopify product in runs still on the way', () => {
    const r = run({});
    const c = { id: 'g', kind: 'GOODS' as const, description: '', units: 50, unitPrice: 5, amount: null, paid: true, date: null, productId: null, variantId: null };
    expect(unlinkedRunUnits([{ ...r, costs: [c, { ...c, id: 'h', productId: 'p1' }] }])).toBe(50);
    expect(unlinkedRunUnits([{ ...r, costs: [c], stages: { ...r.stages, RECEIVED: { planned: null, done: '2026-11-01' } } }])).toBe(0);
  });
});
