import { describe, expect, it } from 'vitest';
import { describeFreshness } from '../freshness';

describe('describeFreshness (contract case 7)', () => {
  it('an old export imported today is flagged stale, with three distinct dates', () => {
    const f = describeFreshness({
      imported: true,
      importedAt: '2026-09-26T09:00:00Z',
      meta: { coverageEnd: '2026-09-01T23:59:59Z', extractedAt: '2026-09-02T08:00:00Z' },
      now: new Date('2026-09-26T10:00:00Z'),
    });
    expect(f.stale).toBe(true);
    const by = Object.fromEntries(f.items.map((i) => [i.label, i]));
    expect(by.COVERAGE).toMatchObject({ text: '24d AGO', tone: 'warn' });
    expect(by.EXTRACTED.text).toBe('24d AGO');
    expect(by.IMPORTED).toMatchObject({ text: '1h AGO', tone: 'ok' });
  });

  it('recent coverage is current', () => {
    const f = describeFreshness({
      imported: true,
      importedAt: '2026-10-13T09:00:00Z',
      meta: { coverageEnd: '2026-10-13T06:00:00Z' },
      now: new Date('2026-10-13T10:00:00Z'),
    });
    expect(f.stale).toBe(false);
  });

  it('a snapshot without dates is unknown and stale — never "fresh"', () => {
    const f = describeFreshness({ imported: true, importedAt: '2026-10-13T09:59:00Z', meta: undefined, now: new Date('2026-10-13T10:00:00Z') });
    expect(f.stale).toBe(true);
    expect(f.items.find((i) => i.label === 'COVERAGE')).toMatchObject({ text: 'UNKNOWN', tone: 'unknown' });
  });

  it('a future timestamp is flagged rather than trusted', () => {
    const f = describeFreshness({ imported: true, importedAt: null, meta: { coverageEnd: '2026-12-01T00:00:00Z' }, now: new Date('2026-10-13T10:00:00Z') });
    expect(f.items[0]).toMatchObject({ text: 'IN FUTURE', tone: 'warn' });
    expect(f.stale).toBe(true);
  });

  it('an import a moment "ahead" of the ticking UI clock reads as just now, not future', () => {
    const f = describeFreshness({ imported: true, importedAt: '2026-10-13T10:00:00.800Z', meta: undefined, now: new Date('2026-10-13T10:00:00Z') });
    expect(f.items.find((i) => i.label === 'IMPORTED')).toMatchObject({ text: '1m AGO', tone: 'ok' });
  });

  it('sample mode says so and claims no source ages', () => {
    const f = describeFreshness({ imported: false, importedAt: null, meta: { sample: true }, now: new Date() });
    expect(f.mode).toBe('sample');
    expect(f.items).toEqual([{ label: 'SAMPLE DATA', text: 'NOT LIVE', tone: 'warn' }]);
  });
});

describe('per-source age', () => {
  it('uses when the source data is from (e.g. bank balance date), not when it was fetched', () => {
    const f = describeFreshness({
      imported: true,
      importedAt: '2026-10-13T20:30:00Z',
      meta: { coverageEnd: '2026-10-13T20:00:00Z', sources: [{ label: 'ERA', extractedAt: '2026-10-13T20:25:00Z', coverageEnd: '2026-10-13T00:09:00Z' }] },
      now: new Date('2026-10-13T20:31:00Z'),
    });
    expect(f.items.find((i) => i.label === 'ERA')?.text).toBe('20h AGO');
  });
});
