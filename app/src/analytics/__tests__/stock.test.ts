// Stock desk figures — hand-checkable fixture (USD cents).
import { describe, expect, it } from 'vitest';
import type { AnalyticsSnapshot, VariantDailyRow, VariantRecord } from '../types';
import { lastCompleteDays } from '../period';
import { productPerformance, stockRisk } from '../metrics';
import { ageBand, runway, shelfValue, sizeCurves, splitBySales, stockAge, stockByLocation, stockSegments } from '../stock';
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

describe('stock age', () => {
  // published dates: cap 1 Aug 2026 (89 days at the stock read), tee 1 Mar 2026 (242), sarong 15 Nov 2025 (348), hoodie never
  const aged = (): AnalyticsSnapshot => {
    const s = fixture();
    const pub: Record<string, string | null> = { cap: '2026-08-01T12:00:00Z', tee: '2026-03-01T12:00:00Z', sarong: '2025-11-15T12:00:00Z', hood: null };
    return { ...s, variants: s.variants.map((v) => ({ ...v, productPublishedAt: pub[v.productId] })) };
  };

  it('bands by days on the webstore: under 180 new, 180 aged, 270 last call, 360 archive', () => {
    expect([0, 179, 180, 269, 270, 359, 360, 900].map((d) => ageBand(d, false))).toEqual(['NEW', 'NEW', 'AGED', 'AGED', 'LAST_CALL', 'LAST_CALL', 'ARCHIVE', 'ARCHIVE']);
    expect(ageBand(900, true)).toBe('TIMELESS');
    expect(ageBand(null, false)).toBe('UNKNOWN');
  });

  it('ages each product in stock, with the date it moves on and its value', () => {
    const a = stockAge(aged())!;
    expect(a.asOf).toBe('2026-10-29');
    const row = (id: string) => a.rows.find((r) => r.productId === id)!;
    expect(row('cap')).toMatchObject({ ageDays: 89, band: 'NEW', nextBand: 'AGED', nextBandOn: '2027-01-28', units: 10, atCost: 7000, atRetail: 45000, sales90: 112000 });
    expect(row('tee')).toMatchObject({ ageDays: 242, band: 'AGED', nextBand: 'LAST_CALL', nextBandOn: '2026-11-26', units: 9, sales90: 16000 });
    expect(row('sarong')).toMatchObject({ ageDays: 348, band: 'LAST_CALL', nextBand: 'ARCHIVE', nextBandOn: '2026-11-10', sales90: 0, lastSale: '2026-05-01' });
    expect(row('hood')).toMatchObject({ ageDays: null, band: 'UNKNOWN', nextBandOn: null, unitsNoCost: 2 });
    expect(a.rows.map((r) => r.productId)).toEqual(['sarong', 'tee', 'cap', 'hood']);
  });

  it('totals units, cost and 90-day sales per band, and lists what reaches archive within 30 days', () => {
    const a = stockAge(aged())!;
    expect(a.bands.map((b) => [b.band, b.units, b.atCost, b.sales90])).toEqual([
      ['NEW', 10, 7000, 112000], ['AGED', 9, 13500, 16000], ['LAST_CALL', 40, 108000, 0], ['UNKNOWN', 2, 0, 0],
    ]);
    expect(a.units).toBe(61);
    expect(a.sales90).toBe(128000);
    expect(a.archiveSoon.map((r) => r.productId)).toEqual(['sarong']);
  });

  it('a timeless product never ages', () => {
    const a = stockAge(aged(), ['sarong'])!;
    expect(a.rows.find((r) => r.productId === 'sarong')).toMatchObject({ band: 'TIMELESS', nextBand: null, nextBandOn: null });
    expect(a.archiveSoon).toEqual([]);
    expect(a.bands.find((b) => b.band === 'TIMELESS')!.units).toBe(40);
  });
});

describe('stock by location', () => {
  it('values each location\'s stock at cost, split by the design\'s age band', () => {
    const base = fixture();
    const s: AnalyticsSnapshot = {
      ...base,
      variants: base.variants.map((v) => {
        const pub = v.productId === 'cap' ? '2026-08-01T12:00:00Z' : '2025-01-02T00:00:00Z';
        // the sarong is split: 30 in the warehouse, 10 at the studio
        const inventory = v.productId === 'sarong' ? [loc(30), { ...loc(10), locationId: 'L2', locationName: 'Studio' }] : v.inventory;
        return { ...v, productPublishedAt: pub, inventory };
      }),
    };
    const byLoc = stockByLocation(s, stockAge(s)!);
    expect(byLoc.map((l) => [l.location, l.units, l.atCost, l.unitsNoCost])).toEqual([
      ['Shop', 51, 7000 + 13500 + 81000, 2],
      ['Studio', 10, 27000, 0],
    ]);
    expect(byLoc[0].bands).toEqual([{ band: 'NEW', units: 10, atCost: 7000 }, { band: 'ARCHIVE', units: 41, atCost: 94500 }]);
    expect(byLoc[0].top[0]).toEqual({ title: 'Sarong', units: 30, atCost: 81000 });
    // every unit is in exactly one location
    expect(byLoc.reduce((n, l) => n + l.units, 0)).toBe(stockAge(s)!.units);
  });
});
