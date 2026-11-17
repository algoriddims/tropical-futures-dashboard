import { describe, expect, it } from 'vitest';
import {
  arrivalDate, blankRun, costCents, timelineModel, currentStage, parseRun, productionAlerts, runCashDue, runIncoming, runTotals, stageDates, storedRuns,
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

  it('an unknown stage stops the estimates: later stages are not guessed from an older date', () => {
    const r = capRun();
    r.leadTimes = { sampleDays: null, bulkDays: null, transitDays: null };
    r.stages.SAMPLES_ORDERED = { planned: null, done: null };
    r.stages.BULK_ORDERED = { planned: null, done: '2026-10-20' };
    const s = stageDates(r);
    expect(s.map((x) => [x.key, x.date, x.kind])).toEqual([
      ['SAMPLES_ORDERED', null, 'done'], ['SAMPLES_RECEIVED', null, 'done'], ['SAMPLES_APPROVED', null, 'done'],
      ['BULK_ORDERED', '2026-10-20', 'done'],
      ['BULK_FINISHED', null, null], ['SHIPPED', null, null], ['RECEIVED', null, null],
    ]);
    // so the timeline draws bulk with an open end and no transit bar
    expect(timelineModel([r], '2026-11-17').rows[0].phases.map((p) => [p.key, p.to])).toEqual([['BULK', null]]);
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

describe('run timeline', () => {
  it('draws each phase from its dates: done part solid up to today, the rest estimated, an unknown end left open', () => {
    const t = timelineModel([capRun()], '2026-11-20');
    const row = t.rows[0];
    expect(row.sub).toBe('300 units · DDP · Philippines');
    expect(row.phases).toEqual([
      { key: 'SAMPLING', label: 'Sampling', from: '2026-11-17', to: '2026-12-07', doneUntil: '2026-11-20', startKind: 'done' },
      { key: 'BULK', label: 'Bulk', from: '2026-12-07', to: '2027-01-01', doneUntil: null, startKind: 'estimate' },
      { key: 'TRANSIT', label: 'Transit', from: '2027-01-01', to: null, doneUntil: null, startKind: 'estimate' },
    ]);
    expect(row.received).toBe(false);
  });

  it('groups payments by date: paid ones where they were paid, unpaid ones on their due date, undated ones flagged', () => {
    const p = timelineModel([capRun()], '2026-11-20').rows[0].payments;
    expect(p.map((x) => [x.date, x.paid, x.amount, x.unknownLines])).toEqual([
      ['2026-11-17', true, 40000, 0],         // samples paid
      [null, false, 118400, 0],               // due, date not set → drawn at today, so it sorts there
      ['2026-12-08', false, 41200, 0],
    ]);
    // the freight is paid with no date: nothing to place on the calendar
    expect(p.some((x) => x.lines.includes('DDP sea freight'))).toBe(false);
  });

  it('ends transit at the shipment ETA, and a received run is solid to the end', () => {
    const r = capRun();
    r.shipments = [{ id: 's', mode: 'SEA', carrier: 'Line', tracking: 'X', url: null, shipped: '2027-01-02', eta: '2027-01-20', delivered: null }];
    expect(timelineModel([r], '2026-11-20').rows[0].phases[2]).toMatchObject({ to: '2027-01-20', doneUntil: null });
    r.stages.RECEIVED = { planned: null, done: '2027-01-22' };
    const row = timelineModel([r], '2027-02-01').rows[0];
    expect(row.received).toBe(true);
    // stages in between were never dated: bulk has nothing to draw, transit starts when the shipment left
    expect(row.phases.map((x) => [x.key, x.from, x.to, x.doneUntil])).toEqual([
      ['SAMPLING', '2026-11-17', '2026-11-17', '2026-11-17'],
      ['TRANSIT', '2027-01-02', '2027-01-22', '2027-01-22'],
    ]);
  });

  it('frames the window around the runs and today, and marks Chinese New Year when it falls inside', () => {
    const t = timelineModel([capRun()], '2026-11-20');
    expect(t.from <= '2026-11-06').toBe(true);
    expect(t.to >= '2027-02-12').toBe(true);        // at least 12 weeks past today
    expect(t.holidays).toEqual([{ label: 'Chinese New Year', day: '2027-02-06', from: '2027-01-27', to: '2027-02-20' }]);
    expect(timelineModel([], '2026-06-01').holidays).toEqual([]);
  });
});
