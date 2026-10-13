import { describe, expect, it } from 'vitest';
import { buildEraLayer, classify, withEra } from '../era';
import type { EraExtract, EraTxn } from '../era';
import { actualMonthlySpend, burnSource, buildNotices, cardOwed, computeMetrics, monthlyBurn, runwayMonths, syncedCash } from '../engine';
import { applyManual } from '../overrides';
import { validateParkData } from '../validate';
import { fixtureData } from '../fixtures';

// Synthetic extract — not real account data.
const tx = (date: string, account: string, amount: number, description: string, linkedTransfer = false, memo?: string): EraTxn =>
  ({ date, account, amount, description, linkedTransfer, ...(memo ? { memo } : {}) });

const extract = (): EraExtract => ({
  extractedAt: '2026-10-13T20:00:00Z',
  from: '2026-08-01',
  allowedAccounts: ['chk', 'sav', 'card'],
  accounts: [
    { id: 'chk', name: 'BIZ CHECKING', mask: '1111', kind: 'CHECKING', balance: -50, available: -50, asOf: '2026-10-13T00:00:00Z' },
    { id: 'sav', name: 'BIZ SAVINGS', mask: '2222', kind: 'SAVINGS', balance: 20, asOf: '2026-10-13T00:00:00Z' },
    { id: 'card', name: 'BIZ CARD', mask: '3333', kind: 'CARD', balance: 300, creditLimit: 5000, asOf: '2026-10-13T00:00:00Z' },
  ],
  transactions: [
    tx('2026-08-03', 'chk', 100, 'Shopify'),
    tx('2026-08-05', 'chk', 400, 'Real Time Transfer Recd From Owner', false, 'shop x sales'),
    tx('2026-08-06', 'chk', -500, 'Chase Credit Card', true),
    tx('2026-08-06', 'card', 500, 'Automatic Payment', true),
    tx('2026-08-10', 'card', -200, 'Facebook'),
    tx('2026-08-12', 'card', -60, 'Qwik Pack and Ship'),
    tx('2026-08-20', 'chk', -34, 'Overdraft Fee'),
    tx('2026-09-02', 'card', -60, 'Cursor'),
    tx('2026-09-02', 'card', 15, 'Cursor'),
    tx('2026-09-05', 'card', -40, 'Mystery Vendor'),
    tx('2026-09-15', 'sav', -10, 'Transfer to Checking', true),
    tx('2026-09-15', 'chk', 10, 'Odp Transfer From Savings', true),
    tx('2026-10-02', 'chk', 50, 'Shopify'),
  ],
  checks: [
    { account: 'chk', month: '2026-08', spending: 34 },
    { account: 'card', month: '2026-08', spending: 260 },
    { account: 'card', month: '2026-09', spending: 100 },
  ],
});

describe('ERA classification', () => {
  it('treats card payments and savings sweeps as internal moves, not spending or income', () => {
    expect(classify(tx('d', 'chk', -500, 'Chase Credit Card'), 'CHECKING').kind).toBe('INTERNAL');
    expect(classify(tx('d', 'card', 500, 'Automatic Payment'), 'CARD').kind).toBe('INTERNAL');
    expect(classify(tx('d', 'chk', 10, 'Odp Transfer From Savings'), 'CHECKING').kind).toBe('INTERNAL');
  });

  it('a Shopify deposit to checking is a payout; a Shopify card charge is software', () => {
    expect(classify(tx('d', 'chk', 100, 'Shopify'), 'CHECKING')).toEqual({ kind: 'IN', to: 'SHOPIFY_PAYOUTS' });
    expect(classify(tx('d', 'card', -40, 'Shopify'), 'CARD')).toEqual({ kind: 'OUT', to: 'SOFTWARE' });
  });

  it('UPS matches as a word, not inside other words', () => {
    expect(classify(tx('d', 'chk', -7, 'Certificate of Origin Ups-delbros Inte'), 'CHECKING')).toEqual({ kind: 'OUT', to: 'SHIPPING' });
    expect(classify(tx('d', 'card', -7, 'Meetup Groups'), 'CARD')).toEqual({ kind: 'OUT', to: 'OTHER' });
  });
});

describe('buildEraLayer', () => {
  it('summarises months without double-counting card payments', () => {
    const { cashflow } = buildEraLayer(extract());
    const aug = cashflow.find((m) => m.month === '2026-08')!;
    expect(aug.cashIn).toEqual({ SHOPIFY_PAYOUTS: 100, OWNER_TRANSFERS: 400 });
    expect(aug.spend).toEqual({ ADS: 200, SHIPPING: 60, BANK_FEES: 34 });
    const sep = cashflow.find((m) => m.month === '2026-09')!;
    expect(sep.spend).toEqual({ SOFTWARE: 45, OTHER: 40 }); // refund nets against software
    expect(cashflow.find((m) => m.month === '2026-10')!.partial).toBe(true);
    expect(cashflow.find((m) => m.month === '2026-08')!.partial).toBe(false);
  });

  it('flags overdrafts, owner transfers (not sales) and uncategorised spending', () => {
    const notes = buildEraLayer(extract()).notes.join('\n');
    expect(notes).toMatch(/BIZ CHECKING ••1111 is overdrawn/);
    expect(notes).toMatch(/Overdraft fees.*\$34\.00/);
    expect(notes).toMatch(/not counted as sales.*"shop x sales"/);
    expect(notes).toMatch(/Mystery Vendor/);
  });

  it('refuses accounts outside the approved list', () => {
    const x = extract();
    x.transactions.push(tx('2026-09-01', 'personal', -5, 'Coffee'));
    expect(() => buildEraLayer(x)).toThrow(/outside the approved list.*personal/);
  });

  it('refuses a copy that does not match ERA monthly totals', () => {
    const x = extract();
    x.checks[1].spending = 261;
    expect(() => buildEraLayer(x)).toThrow(/don't match ERA's monthly totals/);
  });
});

describe('synced bank in the dashboard', () => {
  const synced = () => applyManual(withEra({ ...structuredClone(fixtureData), costs: [] }, extract()), { bankBalance: 99999 });

  it('bank balance = checking + savings from the sync, overriding a manual entry', () => {
    const d = synced();
    expect(syncedCash(d)).toBe(-30);
    expect(d.bankBalance).toBe(-30);
    expect(cardOwed(d)).toBe(300);
  });

  it('without cost lines, burn is actual spending (complete months only), never zero', () => {
    const d = synced();
    expect(burnSource(d)).toBe('ACTUAL_SPEND');
    expect(actualMonthlySpend(d)).toEqual({ amount: (294 + 85) / 2, months: 2 });
    expect(monthlyBurn(d)).toBeCloseTo(189.5);
  });

  it('an overdrawn account means zero runway and a red alert', () => {
    const d = synced();
    expect(runwayMonths(d)).toBe(0);
    const n = buildNotices(d, computeMetrics(d, 7));
    expect(n.find((x) => x.text.includes('OVERDRAWN'))?.tier).toBe('red');
  });

  it('with no bank data and no costs there is no invented runway alarm', () => {
    const d = { ...structuredClone(fixtureData), bankBalance: 0, costs: [] };
    expect(runwayMonths(d)).toBe(Infinity);
    expect(buildNotices(d, computeMetrics(d, 7)).some((n) => /RUNWAY|OVERDRAWN/.test(n.text))).toBe(false);
  });

  it('the merged snapshot passes import validation', () => {
    expect(validateParkData(withEra(structuredClone(fixtureData), extract())).ok).toBe(true);
  });
});
