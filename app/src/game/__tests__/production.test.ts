import { describe, expect, it } from 'vitest';
import {
  arrivalDate, blankRun, costCents, currentStage, parseRun, productionAlerts, runCashDue, runIncoming, runTotals, stageDates, storedRuns,
} from '../production';
import type { ProductionRun, RunCost } from '../production';
import { forecastCashflow } from '../engine';
import { applyManual } from '../overrides';
import { fixtureData } from '../fixtures';

// Synthetic — modelled on a cap order, not the real invoice.
const cost = (o: Partial<RunCost>): RunCost => ({
  id: o.id ?? `c${Math.random()}`, kind: 'GOODS', description: '', units: null, unitPrice: null, amount: null,
  paid: false, date: null, productId: null, variantId: null, ...o,
});

function capRun(): ProductionRun {
  const r = blankRun('Cap run', new Date('2026-11-16T12:00:00Z'));
  return {
    ...r, id: 'run-1', supplier: 'Cap factory', terms: 'Pay upfront', incoterm: 'DDP', destination: 'Philippines',
    leadTimes: { sampleDays: 20, bulkDays: 25, transitDays: null },
    stages: { ...r.stages, SAMPLES_ORDERED: { planned: null, done: '2026-11-17' } },
    costs: [
      cost({ id: 'g1', description: 'Grey', units: 100, unitPrice: 4.12, date: '2026-12-08' }),
      cost({ id: 'g2', description: 'Green + olive', units: 200, unitPrice: 5.92 }),
      cost({ id: 's1', kind: 'SAMPLES', description: 'Samples', units: 5, unitPrice: 80, paid: true, date: '2026-11-17' }),
      cost({ id: 'f1', kind: 'FREIGHT', description: 'DDP sea freight', paid: true }),          // paid, amount not known
    ],
  };
}

describe('production run money', () => {
  it('prices lines exactly in cents, and an unknown amount stays unknown', () => {
    expect(costCents(cost({ units: 100, unitPrice: 4.12 }))).toBe(41200);
    expect(costCents(cost({ kind: 'FREIGHT', amount: 123.45 }))).toBe(12345);
    expect(costCents(cost({ kind: 'FREIGHT' }))).toBeNull();
  });

  it('totals what is known, what is paid and what is still to pay; cost per unit is over goods units only', () => {
    const t = runTotals(capRun());
    expect(t.known).toBe(41200 + 118400 + 40000);
    expect(t.paid).toBe(40000);
    expect(t.toPay).toBe(159600);
    expect(t.unknownLines).toBe(1);          // the freight: the per-unit figure is partial
    expect(t.goodsUnits).toBe(300);
    expect(t.costPerUnit).toBe(Math.round(199600 / 300));
  });

  it('feeds unpaid, priced costs to the cash forecast — undated ones now, dated ones in their month', () => {
    const due = runCashDue([capRun()]);
    expect(due.map((d) => [d.description, d.amount, d.due])).toEqual([['Grey', 412, '2026-12-08'], ['Green + olive', 1184, null]]);
    const d = { ...applyManual(fixtureData, { productionRuns: [capRun()] }), bankBalance: 5000, accounts: undefined, costs: [], pipeline: [] };
    const fc = forecastCashflow(d, 0, 2, new Date(2026, 10, 17));
    expect(fc[0].productionOut).toBe(1184);
    expect(fc[0].events.map((e) => e.text)).toContain('CAP RUN: GREEN + OLIVE DUE (DATE NOT SET)');
    expect(fc[1].productionOut).toBe(412);
    expect(fc[1].events[0].amount).toBe(-412);
  });
});

describe('production run dates', () => {
  it('chains estimates from the last known date using the supplier lead times; no transit time, no arrival guess', () => {
    const s = stageDates(capRun());
    expect(s.map((x) => [x.key, x.date, x.kind])).toEqual([
      ['SAMPLES_ORDERED', '2026-11-17', 'done'],
      ['SAMPLES_RECEIVED', '2026-12-07', 'estimate'],
      ['SAMPLES_APPROVED', '2026-12-07', 'estimate'],
      ['BULK_ORDERED', '2026-12-07', 'estimate'],
      ['BULK_FINISHED', '2027-01-01', 'estimate'],
      ['SHIPPED', '2027-01-01', 'estimate'],
      ['RECEIVED', null, null],
    ]);
    expect(currentStage(capRun())!.key).toBe('SAMPLES_RECEIVED');
  });

  it('a planned or done date replaces the estimate and later estimates follow it', () => {
    const r = capRun();
    r.leadTimes.transitDays = 14;
    r.stages.SAMPLES_APPROVED = { planned: '2026-12-15', done: null };
    const s = stageDates(r);
    expect(s.find((x) => x.key === 'BULK_FINISHED')).toMatchObject({ date: '2027-01-09', kind: 'estimate' });
    expect(arrivalDate(r)).toEqual({ date: '2027-01-23', kind: 'estimate' });
  });

  it('a shipment ETA wins over the estimate; a received run is done', () => {
    const r = capRun();
    r.shipments = [{ id: 's', mode: 'SEA', carrier: 'Line', tracking: 'ABC123', url: null, shipped: '2027-01-02', eta: '2027-01-20', delivered: null }];
    expect(arrivalDate(r)).toEqual({ date: '2027-01-20', kind: 'eta' });
    r.stages.RECEIVED = { planned: null, done: '2027-01-21' };
    expect(arrivalDate(r)).toEqual({ date: '2027-01-21', kind: 'done' });
    expect(currentStage(r)).toBeNull();
    // the stages in between count as done without dates, so nothing is "late"
    expect(stageDates(r).find((x) => x.key === 'BULK_FINISHED')).toMatchObject({ date: null, kind: 'done' });
    expect(productionAlerts([r], '2027-02-01').filter((a) => a.id.startsWith('prod-late'))).toEqual([]);
  });
});

describe('production runs in the rest of the dashboard', () => {
  it('goods lines linked to a Shopify product become stock on the way; new designs and received runs do not', () => {
    const r = capRun();
    r.leadTimes.transitDays = 14;
    r.costs[0] = { ...r.costs[0], productId: 'CAP', variantId: 'CAP1' };
    expect(runIncoming([r])).toEqual([{ id: 'run:run-1:g1', productId: 'CAP', variantId: 'CAP1', units: 100, expectedDate: '2027-01-15', note: 'Cap run · estimated date' }]);
    r.leadTimes.transitDays = null;
    expect(runIncoming([r])).toEqual([]);                  // no arrival date → not counted
    r.stages.RECEIVED = { planned: null, done: '2027-01-15' };
    expect(runIncoming([r])).toEqual([]);
  });

  it('raises a late stage and payments coming due, and stays quiet otherwise', () => {
    const a = productionAlerts([capRun()], '2026-12-03');
    expect(a.map((x) => x.id)).toEqual(['prod-due-run-1']);
    expect(a[0].numbers).toEqual(['Grey: $412.00 due 8 Dec']);
    const late = productionAlerts([capRun()], '2026-12-10');
    expect(late.map((x) => x.title)).toEqual(['Cap run: samples in hand was due 7 Dec', 'Cap run: a payment is due or overdue']);
    expect(productionAlerts([capRun()], '2026-11-20')).toEqual([]);
  });
});

describe('pasted and stored runs', () => {
  it('accepts a well-formed run and rejects bad JSON, bad dates, unsafe links and duplicate lines', () => {
    expect(parseRun(JSON.stringify(capRun()))).toMatchObject({ ok: true });
    expect(parseRun('{ not json')).toMatchObject({ ok: false });
    expect(parseRun(JSON.stringify({ ...capRun(), invoiceDate: '16/11/2026' }))).toMatchObject({ ok: false });
    const bad = parseRun(JSON.stringify({ ...capRun(), links: [{ id: 'l', label: 'x', url: 'javascript:alert(1)' }] }));
    expect(bad.ok ? '' : bad.errors[0]).toContain('links.0.url');
    const dup = capRun();
    dup.costs[1] = { ...dup.costs[1], id: 'g1' };
    expect(parseRun(JSON.stringify(dup))).toEqual({ ok: false, errors: ['costs: two cost lines share an id'] });
  });

  it('keeps well-formed stored runs and leaves out the rest', () => {
    expect(storedRuns([capRun(), { id: 'broken' }])).toMatchObject({ dropped: 1 });
    expect(storedRuns(undefined)).toEqual({ runs: [], dropped: 0 });
    // and an import can't bring runs in: they're the owner's records
    expect(applyManual({ ...fixtureData, productionRuns: [capRun()] }, {}).productionRuns).toEqual([]);
  });
});
