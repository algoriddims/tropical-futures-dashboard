import { describe, expect, it } from 'vitest';
import { validateParkData } from '../validate';
import { fixtureData } from '../fixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('validateParkData', () => {
  it('accepts the sample fixture', () => {
    const r = validateParkData(clone(fixtureData));
    expect(r.ok).toBe(true);
  });

  it('rejects a missing nested field and names its path', () => {
    const d = clone(fixtureData) as unknown as { products: Record<string, unknown>[] };
    delete d.products[2].stock;
    const r = validateParkData(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain('products[2].stock: missing (expected number)');
  });

  it('rejects wrong types deep in the tree (the old validator only checked top-level arrays)', () => {
    const d = clone(fixtureData) as unknown as { channels: { stock: Record<string, unknown>[] }[] };
    d.channels[1].stock[0].sold = '21';
    const r = validateParkData(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('channels[1].stock[0].sold');
  });

  it('rejects shelf rows pointing at unknown products', () => {
    const d = clone(fixtureData);
    d.channels[1].stock[0].productId = 'nope';
    const r = validateParkData(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/"nope" is not in products/);
  });

  it('rejects shelf rows that sold more than were allocated', () => {
    const d = clone(fixtureData);
    d.channels[1].stock[0].sold = 99;
    expect(validateParkData(d).ok).toBe(false);
  });

  it('rejects duplicate product ids', () => {
    const d = clone(fixtureData);
    d.products[1].id = d.products[0].id;
    expect(validateParkData(d).ok).toBe(false);
  });

  it('rejects a zero gross margin (break-even ROAS would be infinite)', () => {
    const d = clone(fixtureData);
    d.grossMargin = 0;
    expect(validateParkData(d).ok).toBe(false);
  });

  it('accepts an older sync that omits terminal-owned manual slices, filling defaults', () => {
    const d = clone(fixtureData) as unknown as Record<string, unknown>;
    for (const k of ['bankBalance', 'costs', 'growthTargetPct', 'wholesalePct', 'nextDrop', 'annualBudget', 'quests']) delete d[k];
    const r = validateParkData(d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.costs).toEqual([]);
      expect(r.data.nextDrop).toBeNull();
    }
  });

  it('keeps unknown extra fields the sync sent (e.g. legacy guestsToday)', () => {
    const d = { ...clone(fixtureData), guestsToday: 486 };
    const r = validateParkData(d);
    expect(r.ok && (r.data as unknown as { guestsToday: number }).guestsToday).toBe(486);
  });

  it('rejects non-object input', () => {
    expect(validateParkData(null).ok).toBe(false);
    expect(validateParkData([]).ok).toBe(false);
  });
});
