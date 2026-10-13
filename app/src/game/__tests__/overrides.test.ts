import { beforeEach, describe, expect, it } from 'vitest';
import type { MemoryStorage } from './memoryStorage';
import { installStorage } from './memoryStorage';
import {
  applyShelfEdits, discardShelfEdit, exportBackup, loadImported, loadManual, loadPreviousSync,
  persistImported, rebaseShelfEdit, recordShelfEdit, saveManual, shelfKey,
} from '../overrides';
import type { ShelfEdit } from '../overrides';
import { fixtureData } from '../fixtures';
import type { ParkData } from '../types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// TROPA (channel index 1), product p2: sync says allocated 30, sold 18.
const CH = 'TROPA';
const P = 'p2';
const withSold = (sold: number): ParkData => {
  const d = clone(fixtureData);
  d.channels[1].stock[1].sold = sold;
  return d;
};
const soldOf = (d: ParkData) => d.channels[1].stock[1].sold;

let store: MemoryStorage;
beforeEach(() => { store = installStorage(); });

describe('shelf edits (contract case 8, adapted to shelf counts)', () => {
  const at = new Date('2026-10-13T10:00:00Z');

  it('records the sync value it replaced and when', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    expect(edits).toEqual([{ channel: CH, productId: P, field: 'sold', value: 20, base: 18, editedAt: at.toISOString() }]);
  });

  it('survives a reload', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    saveManual({ shelfEdits: edits });
    const reloaded = loadManual().shelfEdits ?? [];
    expect(soldOf(applyShelfEdits(withSold(18), reloaded).data)).toBe(20);
  });

  it('an import with the old sync value does not overwrite the correction', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    const r = applyShelfEdits(withSold(18), edits);
    expect(soldOf(r.data)).toBe(20);
    expect(r.status[0].state).toBe('applied');
  });

  it('an import that moved the value exposes a conflict and still shows the correction', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    const r = applyShelfEdits(withSold(22), edits);
    expect(soldOf(r.data)).toBe(20);
    expect(r.status[0]).toMatchObject({ state: 'conflict', syncValue: 22 });
  });

  it('replaying the same correction changes nothing', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    const again = recordShelfEdit(edits, withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, new Date('2026-10-14T00:00:00Z'));
    expect(again).toBe(edits);
  });

  it('setting a cell back to the sync value retires the edit', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    expect(recordShelfEdit(edits, withSold(18), { channel: CH, productId: P, field: 'sold', value: 18 }, at)).toEqual([]);
  });

  it('resolving: USE SYNC drops the edit; KEEP MINE re-bases it so the conflict clears', () => {
    const edits = recordShelfEdit([], withSold(18), { channel: CH, productId: P, field: 'sold', value: 20 }, at);
    const key = shelfKey(edits[0]);
    expect(soldOf(applyShelfEdits(withSold(22), discardShelfEdit(edits, key)).data)).toBe(22);
    const kept = rebaseShelfEdit(edits, withSold(22), key);
    const r = applyShelfEdits(withSold(22), kept);
    expect(soldOf(r.data)).toBe(20);
    expect(r.status[0].state).toBe('applied');
  });

  it('an edit whose row vanished from the sync is reported, not applied', () => {
    const edits: ShelfEdit[] = [{ channel: 'GONE', productId: P, field: 'sold', value: 3, base: 1, editedAt: at.toISOString() }];
    const r = applyShelfEdits(withSold(18), edits);
    expect(r.status[0].state).toBe('orphaned');
    expect(r.data.channels).toEqual(withSold(18).channels);
  });
});

describe('imported snapshot storage', () => {
  it('a stored snapshot that fails validation is reported, not rendered, and stays exportable', () => {
    const bad = clone(fixtureData) as unknown as { products: Record<string, unknown>[] };
    delete bad.products[0].price;
    store.setItem('tfi-data-v1', JSON.stringify({ savedAt: '2026-10-01T00:00:00Z', payload: bad }));
    const loaded = loadImported();
    expect(loaded?.status).toBe('invalid');
    const backup = JSON.parse(exportBackup(new Date('2026-10-13T00:00:00Z')));
    expect(backup.imported.payload.products[0].name).toBe(fixtureData.products[0].name);
  });

  it('a failed write leaves the previous snapshot in place and reports failure', () => {
    persistImported(clone(fixtureData), new Date('2026-10-01T00:00:00Z'));
    store.failWrites = true;
    const next = clone(fixtureData);
    next.bankBalance = 1;
    expect(persistImported(next)).toBeNull();
    store.failWrites = false;
    const loaded = loadImported();
    expect(loaded?.status === 'ok' && loaded.payload.bankBalance).toBe(fixtureData.bankBalance);
  });

  it('archives the previous valid snapshot for the delta briefing', () => {
    persistImported(clone(fixtureData), new Date('2026-10-01T00:00:00Z'));
    const next = clone(fixtureData);
    next.bankBalance = 1;
    persistImported(next, new Date('2026-10-02T00:00:00Z'));
    expect(loadPreviousSync()?.bankBalance).toBe(fixtureData.bankBalance);
  });
});
