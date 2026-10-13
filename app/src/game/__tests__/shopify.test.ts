import { describe, expect, it } from 'vitest';
import { buildShopifySnapshot, toImportFile } from '../shopify';
import type { ShopifyExtract } from '../shopify';
import { validateParkData } from '../validate';
import { computeMetrics } from '../engine';

// Small synthetic extract — not real store data.
const extract = (): ShopifyExtract => ({
  shop: { name: 'Test', domain: 'test.shop', currencyCode: 'USD', timezone: 'EDT', plan: 'Basic' },
  extractedAt: '2026-10-13T20:00:00Z',
  products: [
    { id: 'gid://shopify/Product/1', title: 'Cap', productType: 'Cap', totalInventory: 10,
      variants: [{ title: 'Navy', qty: 10, price: 45, unitCost: 15 }] },
    { id: 'gid://shopify/Product/2', title: 'Tee', productType: 'Tshirt', totalInventory: -1,
      variants: [{ title: 'S', qty: 2, price: 45, unitCost: 16 }, { title: 'M', qty: -3, price: 45, unitCost: 16 }] },
    { id: 'gid://shopify/Product/3', title: 'Shorts', productType: 'Shorts', totalInventory: 4,
      variants: [{ title: 'S', qty: 4, price: 80, unitCost: null }] },
  ],
  daily: [
    { date: '2026-10-12', orders: 1, netSales: 45, sessions: 30 },
    { date: '2026-10-13', orders: 2, netSales: 90, sessions: 40 },
  ],
  unitsSold365d: { Cap: 20, Tee: 5, Shorts: 2, '': 0, Archived: 3 },
  unitsSold7d: { Cap: 2 },
  unitsSoldPrev7d: { Cap: 1 },
  channels30d: [{ channel: 'Online Store', orders: 3, netSales: 135 }, { channel: 'Draft Orders', orders: 1, netSales: 0 }],
  recentOrders: [
    { name: '#2', createdAt: '2026-10-13T14:05:00Z', total: 90, customerOrderCount: 2, channel: 'Online Store',
      items: [{ title: 'Cap', variant: 'Navy', qty: 2 }] },
    { name: '#1', createdAt: '2026-10-12T09:00:00Z', total: 10, customerOrderCount: 1, channel: null,
      items: [{ title: 'Tee', variant: 'S', qty: 5 }] },
  ],
  returningCustomerRate90d: 0.0588,
});

describe('buildShopifySnapshot', () => {
  it('produces a snapshot that passes full import validation', () => {
    const v = validateParkData(toImportFile(buildShopifySnapshot(extract())));
    expect(v.ok).toBe(true);
  });

  it('counts negative variant stock as 0 and says so', () => {
    const s = buildShopifySnapshot(extract());
    expect(s.products.find((p) => p.name === 'Tee')?.stock).toBe(2);
    expect(s.meta?.notes?.join('\n')).toMatch(/negative stock.*Tee/);
  });

  it('leaves unknown unit cost as null (not 0) and keeps it out of stock-at-cost', () => {
    const s = buildShopifySnapshot(extract());
    expect(s.products.find((p) => p.name === 'Shorts')?.unitCost).toBeNull();
    const m = computeMetrics({ ...s, bankBalance: 0 }, 2);
    expect(m.inventoryCost).toBe(10 * 15 + 2 * 16);
    expect(m.inventoryUnitsWithoutCost).toBe(4);
  });

  it('carries measured sessions and no ad spend', () => {
    const s = buildShopifySnapshot(extract());
    const m = computeMetrics(s, 2);
    expect(m.guests).toBe(70);
    expect(m.conversionRate).toBeCloseTo((3 / 70) * 100);
    expect(m.spend).toBeNull();
    expect(m.roas).toBeNull();
  });

  it('estimates margin from list price and known costs, weighted by units sold', () => {
    // Cap 20 × (45−15), Tee 5 × (45−16); Shorts has no cost
    const rev = 20 * 45 + 5 * 45;
    const cost = 20 * 15 + 5 * 16;
    expect(buildShopifySnapshot(extract()).grossMargin).toBeCloseTo(Math.round(((rev - cost) / rev) * 100) / 100);
  });

  it('flags orders far below list price as possible wholesale/consignment', () => {
    expect(buildShopifySnapshot(extract()).meta?.notes?.join('\n')).toMatch(/far below list price.*#1/);
  });

  it('formats order times in the shop timezone and keeps no customer identity', () => {
    const s = buildShopifySnapshot(extract());
    expect(s.orders[0]).toEqual({ id: '#2', time: '13/10 10:05', label: 'Cap / Navy ×2', value: 90, returning: true });
  });

  it('reports unmatched sales lines and other channels', () => {
    const notes = buildShopifySnapshot(extract()).meta?.notes?.join('\n') ?? '';
    expect(notes).toMatch(/not matched.*Archived: 3/);
    expect(notes).toMatch(/Draft Orders 1 order/);
  });

  it('import file omits terminal-owned fields so imports never overwrite manual entries', () => {
    const f = toImportFile(buildShopifySnapshot(extract())) as Record<string, unknown>;
    for (const k of ['bankBalance', 'costs', 'growthTargetPct', 'wholesalePct', 'nextDrop', 'annualBudget']) expect(k in f).toBe(false);
  });

  it('refuses non-USD shops and transcription mismatches', () => {
    const eur = extract(); eur.shop.currencyCode = 'EUR';
    expect(() => buildShopifySnapshot(eur)).toThrow(/USD/);
    const bad = extract(); bad.products[0].totalInventory = 11;
    expect(() => buildShopifySnapshot(bad)).toThrow(/don't add up.*Cap/);
  });
});
