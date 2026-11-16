// Deterministic, hand-checkable fixtures for the analytics layer.
// All money is USD cents unless stated.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convert, currencyExponent, formatMoney, parseMinor, sumMoney, totalsByCurrency } from '../money';
import { addDays, coverage, dayCount, lastCompleteDays, todayIn } from '../period';
import type { AnalyticsSnapshot, VariantDailyRow, VariantRecord } from '../types';
import {
  aovAtPurchase, buildExceptions, change, changePp, channelBreakdown, costCoverage, dropSellThrough, grossMargin, grossProfit,
  netProductRevenue, periodTotals, productPerformance, returningShare, returnRate, sizeKey, sortSizes, stockPosition, unitsPerOrder, weeksOfCover,
} from '../metrics';
import { channelGroup, dedupeWholesale } from '../channels';
import { buildAnalytics, resolveTimezone } from '../shopifyAdapter';
import type { RawShopifyAnalytics } from '../shopifyAdapter';
import { metricsMarkdown } from '../dictionary';

// ── fixture ────────────────────────────────────────────────────────────────

const loc = (available: number, extra: Partial<{ onHand: number; committed: number; incoming: number }> = {}, id = 'L1') =>
  ({ locationId: id, locationName: id, available, onHand: extra.onHand ?? Math.max(0, available), committed: extra.committed ?? 0, incoming: extra.incoming ?? 0, reserved: 0, unavailable: 0 });

const variant = (id: string, productId: string, title: string, size: string | null, inventory: ReturnType<typeof loc>[], extra: Partial<VariantRecord> = {}): VariantRecord => ({
  variantId: id, productId, productTitle: title, productType: 'Tshirt', variantTitle: size ?? 'Default Title', sku: null,
  options: size ? [{ name: 'Size', value: size }] : [], price: 4500, unitCost: 1500,
  productCreatedAt: '2026-01-01T00:00:00Z', productPublishedAt: '2026-01-02T00:00:00Z', tracked: true, isBundle: false, inventory, ...extra,
});

const vrow = (date: string, channel: string, productId: string, variantId: string, m: Partial<VariantDailyRow>): VariantDailyRow => ({
  date, channel, productId, variantId, grossSales: 0, discounts: 0, returns: 0, netSales: 0, cogs: null, netSalesWithCost: 0,
  qtyOrdered: 0, qtyReturned: 0, netItems: 0, ...m,
});

function fixture(): AnalyticsSnapshot {
  return {
    version: 1, source: 'shopify', shop: 'test.shop', currency: 'USD', timezone: 'America/New_York',
    extractedAt: '2026-10-11T12:00:00Z', inventoryAsOf: '2026-10-11T12:00:00Z',
    salesCoverage: { from: '2026-10-01', to: '2026-10-10', missing: ['2026-10-05'] },
    daily: [
      // $100 gross, $10 discount, 3 units, cost $30
      { date: '2026-10-02', channel: 'Online Store', orders: 2, grossSales: 10000, discounts: -1000, returns: 0, netSales: 9000, cogs: 3000, netSalesWithCost: 9000, qtyOrdered: 3, qtyReturned: 0, netItems: 3 },
      // a fully discounted draft order: 4 units out, $0 revenue, $20 cost
      { date: '2026-10-03', channel: 'Draft Orders', orders: 1, grossSales: 5000, discounts: -5000, returns: 0, netSales: 0, cogs: 2000, netSalesWithCost: 0, qtyOrdered: 4, qtyReturned: 0, netItems: 4 },
      // refund on 8 Oct of an order placed in September (cross-period); cost reversed
      { date: '2026-10-08', channel: 'Online Store', orders: 0, grossSales: 0, discounts: 0, returns: -2500, netSales: -2500, cogs: -800, netSalesWithCost: -2500, qtyOrdered: 0, qtyReturned: -1, netItems: -1 },
      // a sale with no recorded cost
      { date: '2026-10-09', channel: 'Online Store', orders: 1, grossSales: 4000, discounts: 0, returns: 0, netSales: 4000, cogs: null, netSalesWithCost: 0, qtyOrdered: 1, qtyReturned: 0, netItems: 1 },
    ],
    variantDaily: [
      vrow('2026-10-02', 'Online Store', 'P1', 'A', { grossSales: 10000, discounts: -1000, netSales: 9000, cogs: 3000, netSalesWithCost: 9000, qtyOrdered: 3, netItems: 3 }),
      vrow('2026-10-03', 'Draft Orders', 'P1', 'B', { grossSales: 5000, discounts: -5000, cogs: 2000, qtyOrdered: 4, netItems: 4 }),
      vrow('2026-10-08', 'Online Store', 'P1', 'A', { returns: -2500, netSales: -2500, cogs: -800, netSalesWithCost: -2500, qtyReturned: -1, netItems: -1 }),
      vrow('2026-10-09', 'Online Store', 'PZ', 'Z', { grossSales: 4000, netSales: 4000, qtyOrdered: 1, netItems: 1 }), // archived variant
    ],
    variants: [
      variant('A', 'P1', 'Tee', 'M', [loc(4, { incoming: 10 }), loc(2, {}, 'L2')]),
      variant('B', 'P1', 'Tee', 'L', [loc(0)]),
      variant('C', 'P1', 'Tee', 'S', [loc(5)]),
      variant('D', 'P2', 'Hoodie', 'M', [loc(-1)]),
      variant('E', 'P3', 'Bundle', null, [loc(3)], { isBundle: true }),
      variant('F', 'P4', 'Cap', null, [loc(8)], { options: [{ name: 'Color', value: 'Navy' }] }),
    ],
    customers: [{ from: '2026-10-06', to: '2026-10-10', channel: 'Online Store', customers: 4, returningCustomers: 1, orders: 4 }],
    notes: [],
  };
}

const CUR = { from: '2026-10-06', to: '2026-10-10' };
const PRIOR = { from: '2026-10-01', to: '2026-10-05' };
const CMP = { current: CUR, prior: PRIOR, days: 5, timezone: 'America/New_York' };

// ── money ──────────────────────────────────────────────────────────────────

describe('money (minor units, exact parsing)', () => {
  it('parses decimal strings without float error and rounds half away from zero', () => {
    expect(parseMinor('423.25', 'USD')).toBe(42325);
    expect(parseMinor('-6.75', 'USD')).toBe(-675);
    expect(parseMinor('52.906', 'USD')).toBe(5291);
    expect(parseMinor('0.1', 'USD')).toBe(10);
    expect(parseMinor('', 'USD')).toBeNull();          // not reported ≠ 0
    expect(() => parseMinor('1e3', 'USD')).toThrow();
  });

  it('respects currencies without two decimals', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(parseMinor('1500.5', 'JPY')).toBe(1501);
    expect(currencyExponent('KWD')).toBe(3);
    expect(parseMinor('1.2345', 'KWD')).toBe(1235);
  });

  it('never adds mixed currencies; shows separate totals or converts with a dated rate', () => {
    const items = [{ currency: 'USD', minor: 1000 }, { currency: 'EUR', minor: 500 }, { currency: 'USD', minor: 250 }];
    expect(() => sumMoney(items, 'USD')).toThrow(/without a conversion rate/);
    expect(totalsByCurrency(items)).toEqual([{ currency: 'USD', minor: 1250 }, { currency: 'EUR', minor: 500 }]);
    expect(convert({ currency: 'EUR', minor: 500 }, 'USD', { from: 'EUR', to: 'USD', rate: 1.1, asOf: '2026-10-13' })).toEqual({ currency: 'USD', minor: 550 });
  });

  it('formats with a true minus sign', () => {
    expect(formatMoney({ currency: 'USD', minor: -152645 }, { cents: true })).toBe('−$1,526.45');
    expect(formatMoney({ currency: 'JPY', minor: 1500 })).toBe('¥1,500');
  });
});

// ── periods ────────────────────────────────────────────────────────────────

describe('reporting periods (business timezone, complete days, resolved at runtime)', () => {
  it('last 30 complete days vs the 30 before, in New York time', () => {
    const c = lastCompleteDays(30, 'America/New_York', new Date('2026-10-14T06:40:00Z'));
    expect(c.current).toEqual({ from: '2026-09-14', to: '2026-10-13' });
    expect(c.prior).toEqual({ from: '2026-08-15', to: '2026-09-13' });
    expect(dayCount(c.current)).toBe(30);
  });

  it('just before midnight in New York, "today" is still the 13th', () => {
    expect(todayIn('America/New_York', new Date('2026-10-14T03:30:00Z'))).toBe('2026-10-13');
    expect(lastCompleteDays(7, 'America/New_York', new Date('2026-10-14T03:30:00Z')).current.to).toBe('2026-10-12');
  });

  it('days outside coverage are unknown, not zero', () => {
    const f = fixture();
    expect(coverage(PRIOR, f.salesCoverage)).toEqual({ covered: 4, total: 5, uncovered: ['2026-10-05'] });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

// ── revenue, profit, margin ────────────────────────────────────────────────

describe('net product revenue, gross profit, margin', () => {
  it('prior period, all channels: partial (a missing day), discounts already netted once', () => {
    const t = periodTotals(fixture(), PRIOR);
    const rev = netProductRevenue(t, 'USD');
    expect(rev.status).toBe('partial');
    expect(rev.value).toEqual({ currency: 'USD', minor: 9000 });  // 10000 − 1000 + 0 (draft order nets to 0)
    const gp = grossProfit(t, 'USD');
    expect(gp.value?.minor).toBe(4000);                             // 9000 − (3000 + 2000): the draft order's cost lowers profit
    expect(grossMargin(t, 'USD').value).toBeCloseTo(44.444, 2);     // 4000 / 9000
  });

  it('DTC only: draft order excluded by the channel filter', () => {
    const t = periodTotals(fixture(), PRIOR, 'DTC');
    expect(t.netSales).toBe(9000);
    expect(grossProfit(t, 'USD').value?.minor).toBe(6000);
    expect(grossMargin(t, 'USD').value).toBeCloseTo(66.667, 2);
  });

  it('current period: a cross-period refund lowers this period; missing cost makes profit partial/unavailable', () => {
    const t = periodTotals(fixture(), CUR);
    expect(netProductRevenue(t, 'USD')).toMatchObject({ status: 'valid', value: { minor: 1500 } }); // −2500 refund + 4000 sale
    expect(costCoverage(t)).toBe(0);                    // the only positive sale has no cost
    expect(grossProfit(t, 'USD').status).toBe('partial');
    expect(grossMargin(t, 'USD').status).toBe('unavailable'); // no positive revenue with recorded cost
  });

  it('a period with no data at all is unavailable, not $0', () => {
    expect(netProductRevenue(periodTotals(fixture(), { from: '2026-09-01', to: '2026-09-05' }), 'USD').status).toBe('unavailable');
  });
});

describe('basket metrics at purchase', () => {
  it('AOV uses discounted merchandise on orders placed; refunds excluded', () => {
    const t = periodTotals(fixture(), PRIOR);
    expect(aovAtPurchase(t, 'USD').value?.minor).toBe(3000); // (15000 − 6000) / 3 orders
    expect(unitsPerOrder(t).value).toBeCloseTo(7 / 3, 6);
    const cur = periodTotals(fixture(), CUR);
    expect(aovAtPurchase(cur, 'USD').value?.minor).toBe(4000); // the refund day adds no order and no gross
  });
});

describe('comparisons', () => {
  it('growth % only from a positive baseline', () => {
    expect(change(1500, 9000)).toMatchObject({ abs: -7500 });
    expect(change(1500, 9000).pct).toBeCloseTo(-83.333, 2);
    expect(change(500, 0)).toEqual({ abs: 500, pct: null, note: 'no prior-period value to compare against' });
    expect(change(500, -200)).toEqual({ abs: 700, pct: null, note: 'prior period was negative' });
    expect(changePp(63.2, 60.1).abs).toBeCloseTo(3.1, 6);
  });
});

// ── inventory and cover ────────────────────────────────────────────────────

describe('inventory position and weeks of cover', () => {
  it('sums locations, keeps incoming out of available, flags oversold', () => {
    const f = fixture();
    expect(stockPosition(f.variants[0])).toMatchObject({ available: 6, sellable: 6, incoming: 10, committed: 0 });
    expect(stockPosition(f.variants[3])).toMatchObject({ available: -1, sellable: 0, oversold: 1 });
  });

  it('cover = sellable ÷ weekly velocity over 28 days to the inventory cutoff; partial when the window isn\'t covered', () => {
    const f = fixture();
    const a = weeksOfCover(f, f.variants[0]);         // 3 sold − 1 returned = 2 units in 28 days → 0.5 / week
    expect(a.unitsInWindow).toBe(2);
    expect(a.cover).toEqual({ kind: 'weeks', weeks: 12 }); // 6 ÷ 0.5
    expect(a.status).toBe('partial');                  // coverage starts 1 Oct, window starts 13 Sep
  });

  it('no recent sales is not infinity; a stocked-out seller is flagged as constrained; bundles aren\'t double counted', () => {
    const f = fixture();
    expect(weeksOfCover(f, f.variants[2]).cover).toEqual({ kind: 'no-recent-sales' });
    const b = weeksOfCover(f, f.variants[1]);
    expect(b.cover).toEqual({ kind: 'out-of-stock' });
    expect(b.flags.some((x) => /stocked out/.test(x))).toBe(true);
    expect(weeksOfCover(f, f.variants[4]).cover).toEqual({ kind: 'bundle' });
    const perf = productPerformance(f, CMP);
    expect(perf.find((p) => p.productId === 'P3')!.stock.available).toBe(0); // bundle stock not counted
  });

  it('sizes sort in garment order', () => {
    expect(sortSizes(['XL', 'S', '2XL', 'M', 'L'])).toEqual(['S', 'M', 'L', 'XL', '2XL']);
    // the store spells sizes several ways; the matrix groups them
    expect(['Small', 'X-Large', 'Extra Large', '2X-Large', 'XXL', 'Medium', 'Tall'].map(sizeKey)).toEqual(['S', 'XL', 'XL', '2XL', '2XL', 'M', 'TALL']);
    expect(sortSizes(['Large', 'XS', '2X-Large', 'Small'])).toEqual(['XS', 'Small', 'Large', '2X-Large']);
  });
});

// ── products ───────────────────────────────────────────────────────────────

describe('product performance', () => {
  it('shows zero sellers and archived-variant sales; totals reconcile with the period totals', () => {
    const f = fixture();
    const perf = productPerformance(f, CMP);
    expect(perf.find((p) => p.productId === 'P4')).toBeDefined();           // never sold, still listed
    const archived = perf.find((p) => !p.inCatalog);
    expect(archived?.current.netSales).toBe(4000);
    const sum = perf.reduce((s, p) => s + p.current.netSales, 0);
    expect(sum).toBe(periodTotals(f, CUR).netSales);                        // 1500
    const tee = perf.find((p) => p.productId === 'P1')!;
    expect(tee.sizesOut).toEqual(['L']);
    expect(tee.stock.incoming).toBe(10);
  });
});

// ── customers ──────────────────────────────────────────────────────────────

describe('returning-customer share', () => {
  it('is partial (identity coverage not reported) and needs an exact-period extract', () => {
    const f = fixture();
    const r = returningShare(f, CUR);
    expect(r.status).toBe('partial');
    expect(r.value).toEqual({ share: 0.25, customers: 4, returning: 1 });
    expect(returningShare(f, PRIOR).status).toBe('unavailable');
    expect(returningShare({ ...f, customers: [{ ...f.customers[0], customers: 0, returningCustomers: 0 }] }, CUR).status).toBe('unavailable');
  });
});

// ── channels and wholesale ─────────────────────────────────────────────────

describe('channels and wholesale de-duplication', () => {
  it('unmapped channels stay visible', () => {
    expect(channelGroup('Online Store')).toBe('DTC');
    expect(channelGroup('Draft Orders')).toBe('UNMAPPED');
    const lines = channelBreakdown(fixture(), PRIOR);
    expect(lines.map((l) => [l.channel, l.group])).toEqual([['Online Store', 'DTC'], ['Draft Orders', 'UNMAPPED']]);
  });

  it('a wholesale row already in Shopify, or imported twice, counts once', () => {
    const rows = [
      { id: 'w1', shopifyOrderName: '#2025-2044', account: 'Shop A', invoicedMinor: 95000, currency: 'USD' },
      { id: 'w2', shopifyOrderName: null, account: 'Shop B', invoicedMinor: 50000, currency: 'USD' },
      { id: 'w2', shopifyOrderName: null, account: 'Shop B', invoicedMinor: 50000, currency: 'USD' },
    ];
    const r = dedupeWholesale(rows, ['#2025-2044']);
    expect(r.kept.map((x) => x.id)).toEqual(['w2']);
    expect(r.duplicates.map((x) => x.reason)).toEqual(['already counted in Shopify as #2025-2044', 'row w2 imported more than once']);
  });
});

describe('explicitly unavailable metrics', () => {
  it('drop sell-through and return rate say what is missing', () => {
    expect(dropSellThrough()).toMatchObject({ status: 'unavailable', value: null });
    expect(dropSellThrough().reason).toMatch(/drop → product mapping/);
    expect(returnRate().reason).toMatch(/linked to the fulfilled orders/);
  });
});

// ── exceptions ─────────────────────────────────────────────────────────────

describe('exceptions', () => {
  it('names the item, numbers and rule; drafts in the current period are flagged as unmapped', () => {
    const f = fixture();
    const ex = buildExceptions(f, { ...CMP, current: PRIOR }, productPerformance(f, { ...CMP, current: PRIOR }));
    const oos = ex.find((e) => e.id === 'oos-P1');
    expect(oos?.title).toBe('Tee: L unavailable');
    expect(oos?.numbers[0]).toBe('L: 4 sold in the last 28 days, 0 available');
    expect(ex.find((e) => e.id === 'unmapped')?.numbers[0]).toBe('Draft Orders: 1 orders, 4 units, $0.00 net product revenue');
    expect(ex.every((e) => e.rule.length > 10 && e.drill.desk)).toBe(true);
  });
});

// ── adapter ────────────────────────────────────────────────────────────────

const rawBase = (): RawShopifyAnalytics => ({
  shop: { name: 'T', domain: 't.shop', currencyCode: 'USD', timezone: 'EDT' },
  extractedAt: '2026-10-14T06:50:00Z', inventoryAsOf: '2026-10-14T06:45:00Z',
  salesRange: { from: '2026-10-01', to: '2026-10-03' },
  dailyRows: [
    { day: '2026-10-01', sales_channel: '', orders: '0', gross_sales: '0', discounts: '0', returns: '0', net_sales: '0', cost_of_goods_sold: '', net_sales_with_cost_recorded: '0', quantity_ordered: '0', quantity_returned: '0', net_items_sold: '0' },
    { day: '2026-10-02', sales_channel: 'Online Store', orders: '1', gross_sales: '45', discounts: '-6.75', returns: '0', net_sales: '38.25', cost_of_goods_sold: '14.03', net_sales_with_cost_recorded: '38.25', quantity_ordered: '1', quantity_returned: '0', net_items_sold: '1' },
  ],
  variantDailyRows: [
    { day: '2026-10-02', sales_channel: 'Online Store', product_id: '1', product_variant_id: '11', gross_sales: '45', discounts: '-6.75', returns: '0', net_sales: '38.25', cost_of_goods_sold: '14.03', net_sales_with_cost_recorded: '38.25', quantity_ordered: '1', quantity_returned: '0', net_items_sold: '1' },
  ],
  variantNodes: [{
    id: 'gid://shopify/ProductVariant/11', title: 'M', sku: 'X-M', price: '45.00', requiresComponents: false,
    selectedOptions: [{ name: 'Size', value: 'M' }],
    product: { id: 'gid://shopify/Product/1', title: 'Cap', productType: 'Cap', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', publishedAt: '2026-01-02T00:00:00Z' },
    inventoryItem: { id: 'gid://shopify/InventoryItem/9', tracked: true, unitCost: { amount: '14.03', currencyCode: 'USD' }, inventoryLevels: { nodes: [
      { location: { id: 'gid://shopify/Location/1', name: 'A' }, quantities: [{ name: 'available', quantity: 3 }, { name: 'on_hand', quantity: 5 }, { name: 'committed', quantity: 2 }, { name: 'incoming', quantity: 4 }] },
    ] } },
  }],
  customerWindows: [],
});

describe('Shopify adapter', () => {
  it('normalizes money, ids, coverage and inventory states', () => {
    const a = buildAnalytics(rawBase());
    expect(a.timezone).toBe('America/New_York');
    expect(a.daily).toHaveLength(1);
    expect(a.daily[0]).toMatchObject({ netSales: 3825, discounts: -675, cogs: 1403 });
    expect(a.salesCoverage.missing).toEqual(['2026-10-03']);                // not returned → unknown
    expect(a.variants[0]).toMatchObject({ variantId: '11', productId: '1', unitCost: 1403 });
    expect(a.variants[0].inventory[0]).toMatchObject({ available: 3, onHand: 5, committed: 2, incoming: 4 });
  });

  it('repeated identical rows count once; conflicting duplicates are refused', () => {
    const r = rawBase();
    r.dailyRows.push({ ...r.dailyRows[1] });
    const a = buildAnalytics(r);
    expect(a.daily).toHaveLength(1);
    expect(a.notes.some((n) => /repeated daily sales/.test(n))).toBe(true);
    const bad = rawBase();
    bad.dailyRows.push({ ...bad.dailyRows[1], net_sales: '99' });
    expect(() => buildAnalytics(bad)).toThrow(/two different rows/);
  });

  it('timezone gaps and foreign-currency costs are surfaced, not guessed', () => {
    const r = rawBase();
    r.shop.timezone = 'XYZ';
    const a = buildAnalytics(r);
    expect(a.timezone).toBeNull();
    expect(a.notes[0]).toMatch(/configuration gap/);
    expect(resolveTimezone('Europe/Rome')).toBe('Europe/Rome');
    const fx = rawBase();
    fx.variantNodes[0].inventoryItem.unitCost = { amount: '10', currencyCode: 'EUR' };
    expect(() => buildAnalytics(fx)).toThrow(/dated FX rate/);
  });
});

describe('metric dictionary', () => {
  it('docs/metrics.md is generated from dictionary.ts and in sync', () => {
    const doc = readFileSync(resolve(__dirname, '../../../../docs/metrics.md'), 'utf8');
    expect(doc).toBe(metricsMarkdown());
  });
});
