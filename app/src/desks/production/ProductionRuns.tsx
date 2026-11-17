// Production runs: one card per supplier order — stages and dates, what it
// costs and what's paid, shipments with tracking, and links to the files.
// Edits save with the other manual entries. The numbers come from
// src/game/production.ts; this file only edits and formats them.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import {
  arrivalDate, blankCost, blankLink, blankRun, blankShipment, costCents, currentStage, parseRun, runTotals, stageDates,
} from '@/game/production';
import type { CostKind, ProductionRun, RunCost, ShipMode, Shipment, StageKey } from '@/game/production';
import { todayIn } from '@/analytics/period';
import { money } from '@/game/format';
import { useAnalytics } from '../analytics/useAnalytics';
import { RunTimeline } from './RunTimeline';

const box = 'bg-[var(--crt-dark)] border border-[var(--crt-line)] px-1.5 py-0.5 text-[0.8rem] min-w-0 w-full';
const btn = 'tap border border-[var(--crt-line)] px-2 py-0.5 font-display text-xs';
const cents = (c: number | null, opts: { cents?: boolean } = { cents: true }) => (c === null ? '—' : money(c / 100, opts));
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase() : '—');
const KIND_LABEL: Record<CostKind, string> = { GOODS: 'GOODS', SAMPLES: 'SAMPLES', FREIGHT: 'FREIGHT', DUTIES: 'DUTIES & TAX', OTHER: 'OTHER' };

// ── fields: commit on blur or Enter, Esc puts the old value back ──

function TextField({ value, onCommit, label, placeholder, mono }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; mono?: boolean }) {
  return (
    <input
      key={value}
      aria-label={label}
      className={`${box} ${mono ? 'font-mono' : ''}`}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== value) onCommit(v); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { e.currentTarget.value = value; e.currentTarget.blur(); }
      }}
    />
  );
}

function NumField({ value, onCommit, label, step = 'any', min = 0 }: { value: number | null; onCommit: (v: number | null) => void; label: string; step?: string; min?: number }) {
  return (
    <input
      key={String(value)}
      aria-label={label}
      type="number" inputMode="decimal" step={step} min={min}
      className={`${box} text-right`}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const n = raw === '' ? null : Number(raw);
        if (n !== null && (!Number.isFinite(n) || n < min)) { e.target.value = value === null ? '' : String(value); return; }
        if (n !== value) onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { e.currentTarget.value = value === null ? '' : String(value); e.currentTarget.blur(); }
      }}
    />
  );
}

function DateField({ value, onCommit, label }: { value: string | null; onCommit: (v: string | null) => void; label: string }) {
  return (
    <input aria-label={label} type="date" className={box} value={value ?? ''} onChange={(e) => onCommit(e.target.value || null)} />
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-0 block">
      <span className="stat-label block">{label}</span>
      {children}
    </label>
  );
}

// ── one run ──

function RunCard({ run, onChange, onDelete, today, open, onToggle }: { run: ProductionRun; onChange: (mut: (r: ProductionRun) => ProductionRun) => void; onDelete: () => void; today: string; open: boolean; onToggle: () => void }) {
  const an = useAnalytics();
  const [asText, setAsText] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const t = runTotals(run);
  const dates = stageDates(run);
  const cur = currentStage(run);
  const arrival = arrivalDate(run);
  const products = an.kind === 'ok' ? an.view.products.filter((p) => p.inCatalog).sort((a, b) => a.title.localeCompare(b.title)) : [];

  const set = <K extends keyof ProductionRun>(k: K, v: ProductionRun[K]) => onChange((r) => ({ ...r, [k]: v }));
  const setStage = (key: StageKey, field: 'planned' | 'done', v: string | null) =>
    onChange((r) => ({ ...r, stages: { ...r.stages, [key]: { ...r.stages[key], [field]: v } } }));
  const setCost = (id: string, patch: Partial<RunCost>) => onChange((r) => ({ ...r, costs: r.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setShip = (id: string, patch: Partial<Shipment>) => onChange((r) => ({ ...r, shipments: r.shipments.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/i.test(linkUrl.trim())) return setLinkError('LINKS MUST START WITH http:// OR https://');
    onChange((r) => ({ ...r, links: [...r.links, blankLink(linkLabel.trim() || 'File', linkUrl.trim())] }));
    setLinkLabel(''); setLinkUrl(''); setLinkError(null);
  };

  const arrivalText = arrival.kind === 'done' ? `RECEIVED ${day(arrival.date)}`
    : arrival.date ? `ARRIVES ~${day(arrival.date)}${arrival.kind === 'estimate' ? ' (ESTIMATE)' : arrival.kind === 'eta' ? ' (SHIPMENT ETA)' : ''}`
      : 'ARRIVAL UNKNOWN';

  return (
    <section id={`run-${run.id}`} className="window scroll-mt-2" aria-label={`Production run ${run.name}`}>
      <div className="window-head flex-wrap gap-2">
        <h2 className="wh-title">{run.name}</h2>
        <span className="wh-note flex flex-wrap items-center gap-2">
          <span className={`badge ${cur ? 'tier-amber' : 'tier-green'}`}>{cur ? `NEXT: ${cur.label.toUpperCase()}` : 'RECEIVED'}</span>
          <span>{arrivalText}</span>
          <button className={btn} onClick={onToggle} aria-expanded={open}>{open ? 'DONE EDITING' : 'EDIT'}</button>
        </span>
      </div>
      <div className="window-body space-y-4">
        {/* the money */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="stat-label">Total cost</div>
            <div className="font-display text-2xl">{cents(t.known, { cents: false })}{t.unknownLines > 0 && <span className="text-sm tier-amber"> + ?</span>}</div>
            <div className="stat-sub">{t.unknownLines > 0 ? `${t.unknownLines} LINE${t.unknownLines === 1 ? '' : 'S'} WITH NO AMOUNT YET` : 'ALL LINES PRICED'}</div>
          </div>
          <div>
            <div className="stat-label">Paid</div>
            <div className="font-display text-2xl tier-green">{cents(t.paid, { cents: false })}</div>
          </div>
          <div>
            <div className="stat-label">Still to pay</div>
            <div className={`font-display text-2xl ${t.toPay > 0 ? 'tier-red' : ''}`}>{cents(t.toPay, { cents: false })}{t.toPayUnknown > 0 && <span className="text-sm tier-amber"> + ?</span>}</div>
            <div className="stat-sub">IN THE CASH FORECAST ON ITS DUE DATE (UNDATED: THIS MONTH)</div>
          </div>
          <div>
            <div className="stat-label">Cost per unit, all in</div>
            <div className="font-display text-2xl">{cents(t.costPerUnit)}</div>
            <div className="stat-sub">{t.goodsUnits ? `${t.goodsUnits} UNITS · SAMPLES AND FREIGHT INCLUDED${t.unknownLines ? ' · PARTIAL' : ''}` : 'NO GOODS LINES YET'}</div>
          </div>
        </div>

        {open && <>
        {/* who, where, terms */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Run name"><TextField label="Run name" value={run.name} onCommit={(v) => v && set('name', v)} /></Fact>
          <Fact label="Supplier"><TextField label="Supplier" value={run.supplier} onCommit={(v) => set('supplier', v)} placeholder="Not recorded" /></Fact>
          <Fact label="Invoice number"><TextField label="Invoice number" value={run.invoiceRef} onCommit={(v) => set('invoiceRef', v)} placeholder="Ask the supplier" mono /></Fact>
          <Fact label="Invoice date"><DateField label="Invoice date" value={run.invoiceDate} onCommit={(v) => set('invoiceDate', v)} /></Fact>
          <Fact label="Payment terms"><TextField label="Payment terms" value={run.terms} onCommit={(v) => set('terms', v)} /></Fact>
          <Fact label="Incoterm (who pays freight and duties)"><TextField label="Incoterm" value={run.incoterm} onCommit={(v) => set('incoterm', v.toUpperCase())} placeholder="EXW, FOB, DDP…" /></Fact>
          <Fact label="Ships to"><TextField label="Ships to" value={run.destination} onCommit={(v) => set('destination', v)} /></Fact>
          <div className="grid grid-cols-3 gap-2">
            <Fact label="Sample days"><NumField label="Days to make samples" step="1" value={run.leadTimes.sampleDays} onCommit={(v) => set('leadTimes', { ...run.leadTimes, sampleDays: v === null ? null : Math.round(v) })} /></Fact>
            <Fact label="Bulk days"><NumField label="Days to make the bulk order" step="1" value={run.leadTimes.bulkDays} onCommit={(v) => set('leadTimes', { ...run.leadTimes, bulkDays: v === null ? null : Math.round(v) })} /></Fact>
            <Fact label="Transit days"><NumField label="Days in transit" step="1" value={run.leadTimes.transitDays} onCommit={(v) => set('leadTimes', { ...run.leadTimes, transitDays: v === null ? null : Math.round(v) })} /></Fact>
          </div>
        </div>

        {/* stages */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[0.8rem]">
            <caption className="sr-only">Stages of {run.name}, with the date each was done, planned or estimated</caption>
            <thead>
              <tr className="stat-label text-left">
                <th scope="col" className="px-2 py-1 font-normal">Stage</th>
                <th scope="col" className="px-2 py-1 font-normal">Done on</th>
                <th scope="col" className="px-2 py-1 font-normal">Planned for</th>
                <th scope="col" className="px-2 py-1 font-normal">Expected</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((s) => {
                const st = run.stages[s.key];
                const late = s.kind !== 'done' && s.date && s.date < today && cur?.key === s.key;
                return (
                  <tr key={s.key} className="border-t border-[var(--crt-mid)]">
                    <th scope="row" className={`px-2 py-1 text-left font-normal ${s.kind === 'done' ? 'tier-green' : cur?.key === s.key ? 'warm' : 'dim'}`}>
                      {s.kind === 'done' ? '✓ ' : ''}{s.label}
                    </th>
                    <td className="px-2 py-1">
                      <span className="flex items-center gap-1">
                        <DateField label={`${s.label}: done on`} value={st.done} onCommit={(v) => setStage(s.key, 'done', v)} />
                        {!st.done && <button className={btn} onClick={() => setStage(s.key, 'done', today)} aria-label={`Mark ${s.label} done today`}>TODAY</button>}
                      </span>
                    </td>
                    <td className="px-2 py-1"><DateField label={`${s.label}: planned for`} value={st.planned} onCommit={(v) => setStage(s.key, 'planned', v)} /></td>
                    <td className={`px-2 py-1 whitespace-nowrap ${late ? 'tier-red' : ''}`}>
                      {s.kind === 'done' ? (s.date ? day(s.date) : 'DONE') : s.date ? `${day(s.date)}${s.kind === 'estimate' ? ' · EST.' : ''}${late ? ' · LATE' : ''}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="stat-sub mt-1">
            EXPECTED DATES WITHOUT A PLAN ARE ESTIMATED FROM THE SUPPLIER'S DAYS ABOVE, COUNTING FROM THE STAGE BEFORE.
            {run.leadTimes.transitDays === null && ' NO TRANSIT TIME IS SET, SO ARRIVAL ISN\'T ESTIMATED — ADD IT, OR A SHIPMENT ETA.'}
          </p>
        </div>

        {/* costs */}
        <div>
          <h3 className="stat-label">Costs</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <caption className="sr-only">Cost lines of {run.name}, paid or due</caption>
              <thead>
                <tr className="stat-label text-left">
                  <th scope="col" className="px-1 py-1 font-normal">Kind</th>
                  <th scope="col" className="px-1 py-1 font-normal">Description</th>
                  <th scope="col" className="px-1 py-1 text-right font-normal">Units</th>
                  <th scope="col" className="px-1 py-1 text-right font-normal">Unit price</th>
                  <th scope="col" className="px-1 py-1 text-right font-normal">Amount</th>
                  <th scope="col" className="px-1 py-1 font-normal">Paid?</th>
                  <th scope="col" className="px-1 py-1 font-normal">Paid on / due</th>
                  <th scope="col" className="px-1 py-1 font-normal">Restocks</th>
                  <th scope="col" className="px-1 py-1"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {run.costs.map((c) => {
                  const perUnit = c.kind === 'GOODS' || c.kind === 'SAMPLES';
                  const v = costCents(c);
                  const product = products.find((p) => p.productId === c.productId);
                  return (
                    <tr key={c.id} className="border-t border-[var(--crt-mid)] align-top">
                      <td className="px-1 py-1 whitespace-nowrap">{KIND_LABEL[c.kind]}</td>
                      <td className="px-1 py-1 min-w-[12rem]"><TextField label="Description" value={c.description} onCommit={(d) => setCost(c.id, { description: d })} /></td>
                      <td className="px-1 py-1 w-20">{perUnit ? <NumField label="Units" step="1" value={c.units} onCommit={(n) => setCost(c.id, { units: n === null ? null : Math.round(n) })} /> : <span className="dim">—</span>}</td>
                      <td className="px-1 py-1 w-24">{perUnit ? <NumField label="Unit price" value={c.unitPrice} onCommit={(n) => setCost(c.id, { unitPrice: n })} /> : <span className="dim">—</span>}</td>
                      <td className="px-1 py-1 w-28 text-right">
                        {perUnit && c.units !== null && c.unitPrice !== null
                          ? <span className="font-display">{cents(v)}</span>
                          : <NumField label="Amount" value={c.amount} onCommit={(n) => setCost(c.id, { amount: n })} />}
                      </td>
                      <td className="px-1 py-1">
                        <button className={`${btn} ${c.paid ? 'tier-green border-[var(--palm)]' : 'tier-red'}`} aria-pressed={c.paid} onClick={() => setCost(c.id, { paid: !c.paid })}
                          title={c.paid ? 'Paid — press to mark as still due' : 'Still due — press to mark as paid'}>
                          {c.paid ? 'PAID' : 'DUE'}
                        </button>
                      </td>
                      <td className="px-1 py-1 w-36"><DateField label={c.paid ? 'Paid on' : 'Due on'} value={c.date} onCommit={(d) => setCost(c.id, { date: d })} /></td>
                      <td className="px-1 py-1 min-w-[11rem]">
                        {c.kind === 'GOODS' && products.length > 0 ? (
                          <span className="flex flex-col gap-1">
                            <select aria-label="Restocks Shopify product" className={box} value={c.productId ?? ''} onChange={(e) => setCost(c.id, { productId: e.target.value || null, variantId: null })}>
                              <option value="">New design (not in Shopify)</option>
                              {products.map((p) => <option key={p.productId} value={p.productId}>{p.title}</option>)}
                            </select>
                            {product && product.variants.length > 1 && (
                              <select aria-label="Size or variant" className={box} value={c.variantId ?? ''} onChange={(e) => setCost(c.id, { variantId: e.target.value || null })}>
                                <option value="">Size not known</option>
                                {product.variants.map((x) => <option key={x.variant.variantId} value={x.variant.variantId}>{x.size ?? x.color ?? x.variant.variantTitle}</option>)}
                              </select>
                            )}
                          </span>
                        ) : <span className="dim">—</span>}
                      </td>
                      <td className="px-1 py-1">
                        <button className={btn} onClick={() => onChange((r) => ({ ...r, costs: r.costs.filter((x) => x.id !== c.id) }))} aria-label={`Remove cost line ${c.description || KIND_LABEL[c.kind]}`}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Add a cost line">
            {(['GOODS', 'SAMPLES', 'FREIGHT', 'DUTIES', 'OTHER'] as CostKind[]).map((k) => (
              <button key={k} className={btn} onClick={() => onChange((r) => ({ ...r, costs: [...r.costs, blankCost(k)] }))}>+ {KIND_LABEL[k]}</button>
            ))}
          </div>
          <p className="stat-sub mt-1">
            A GOODS LINE LINKED TO A SHOPIFY PRODUCT COUNTS AS STOCK ON THE WAY FROM THE ARRIVAL DATE, SO THE REORDER ALERTS KNOW ABOUT IT. A BLANK AMOUNT IS UNKNOWN, NOT $0.
          </p>
        </div>

        {/* shipments */}
        <div>
          <h3 className="stat-label">Shipments</h3>
          {run.shipments.length === 0 && <p className="stat-sub">NONE YET. ADD ONE WHEN THE SUPPLIER SENDS A TRACKING OR BOOKING NUMBER.</p>}
          {run.shipments.map((s) => (
            <div key={s.id} className="mt-1 grid grid-cols-2 gap-2 border-t border-[var(--crt-mid)] pt-2 sm:grid-cols-4 lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_9rem_9rem_9rem_auto] lg:items-end">
              <Fact label="Mode">
                <select aria-label="Shipping mode" className={box} value={s.mode} onChange={(e) => setShip(s.id, { mode: e.target.value as ShipMode })}>
                  {(['SEA', 'AIR', 'COURIER', 'OTHER'] as ShipMode[]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Fact>
              <Fact label="Carrier"><TextField label="Carrier" value={s.carrier} onCommit={(v) => setShip(s.id, { carrier: v })} /></Fact>
              <Fact label="Tracking / booking no."><TextField label="Tracking number" value={s.tracking} onCommit={(v) => setShip(s.id, { tracking: v })} mono /></Fact>
              <Fact label="Tracking link">
                <span className="flex items-center gap-1">
                  <TextField label="Tracking link" value={s.url ?? ''} placeholder="https://…" onCommit={(v) => setShip(s.id, { url: /^https?:\/\/\S+$/i.test(v) ? v : null })} />
                  {s.url && <a className={btn} href={s.url} target="_blank" rel="noopener noreferrer">OPEN</a>}
                </span>
              </Fact>
              <Fact label="Shipped"><DateField label="Shipped on" value={s.shipped} onCommit={(v) => setShip(s.id, { shipped: v })} /></Fact>
              <Fact label="ETA"><DateField label="Expected arrival" value={s.eta} onCommit={(v) => setShip(s.id, { eta: v })} /></Fact>
              <Fact label="Delivered"><DateField label="Delivered on" value={s.delivered} onCommit={(v) => setShip(s.id, { delivered: v })} /></Fact>
              <button className={btn} onClick={() => onChange((r) => ({ ...r, shipments: r.shipments.filter((x) => x.id !== s.id) }))} aria-label={`Remove shipment ${s.tracking || s.carrier}`}>×</button>
            </div>
          ))}
          <button className={`${btn} mt-1`} onClick={() => onChange((r) => ({ ...r, shipments: [...r.shipments, blankShipment()] }))}>+ SHIPMENT</button>
          <p className="stat-sub mt-1">TRACKING STATUS ISN'T FETCHED — NO CARRIER IS CONNECTED. PASTE THE CARRIER'S TRACKING PAGE AS THE LINK.</p>
        </div>

        {/* files and notes */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <h3 className="stat-label">Files and links</h3>
            {run.links.length === 0 && <p className="stat-sub">DESIGN FILES, TECH PACKS, THE INVOICE, SAMPLE PHOTOS — LINK THEM HERE (DRIVE, FIGMA…).</p>}
            <ul className="space-y-0.5 text-[0.8rem]">
              {run.links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <a className="warm underline truncate" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                  <button className={btn} onClick={() => onChange((r) => ({ ...r, links: r.links.filter((x) => x.id !== l.id) }))} aria-label={`Remove link ${l.label}`}>×</button>
                </li>
              ))}
            </ul>
            <form onSubmit={addLink} className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-1" aria-label="Add a link">
              <input aria-label="Link name" className={box} placeholder="Name" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
              <input aria-label="Link address" className={box} placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <button type="submit" className={btn}>ADD</button>
            </form>
            {linkError && <p role="alert" className="text-[0.8rem] tier-red">▲ {linkError}</p>}
          </div>
          <div>
            <h3 className="stat-label">Notes</h3>
            <textarea
              key={run.notes}
              aria-label="Notes"
              className={`${box} h-24`}
              defaultValue={run.notes}
              maxLength={2000}
              onBlur={(e) => { if (e.target.value !== run.notes) set('notes', e.target.value); }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--crt-mid)] pt-2">
          <button className={btn} onClick={() => setAsText((x) => !x)} aria-expanded={asText}>{asText ? 'HIDE TEXT' : 'SHOW AS TEXT'}</button>
          <button className={`${btn} tier-red`} onClick={() => { if (window.confirm(`Delete the run "${run.name}"? This can't be undone.`)) onDelete(); }}>DELETE RUN</button>
        </div>
        {asText && (
          <div>
            <p className="stat-sub">COPY THIS INTO A CLAUDE SESSION TO HAVE A RUN CHECKED OR UPDATED; PASTE THE RESULT BACK WITH "PASTE A RUN".</p>
            <textarea readOnly aria-label="Run as text" className={`${box} h-40 font-mono`} value={JSON.stringify(run, null, 2)} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
        </>}
      </div>
    </section>
  );
}

// ── all runs ──

export function ProductionRuns() {
  const { data, updateData } = useTerminal();
  const an = useAnalytics();
  const [newName, setNewName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  if (!data) return null;
  const toggle = (id: string) => setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const openRun = (id: string) => {
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    requestAnimationFrame(() => document.getElementById(`run-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const runs = data.productionRuns ?? [];
  const today = todayIn(an.kind === 'ok' ? an.view.a.timezone ?? 'America/New_York' : 'America/New_York');
  const totals = runs.map(runTotals);
  const toPay = totals.reduce((s, t) => s + t.toPay, 0);
  const unknown = totals.reduce((s, t) => s + t.toPayUnknown, 0);

  const put = (mut: (rs: ProductionRun[]) => ProductionRun[]) => updateData((d) => ({ ...d, productionRuns: mut(d.productionRuns ?? []) }));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const run = blankRun(name);
    put((rs) => [run, ...rs]);
    setOpenIds((ids) => [...ids, run.id]);   // a new run opens for editing
    setNewName('');
  };
  const addPasted = () => {
    const r = parseRun(pasted);
    if (!r.ok) return setErrors(r.errors);
    if (runs.some((x) => x.id === r.run.id)) return setErrors([`A run with this id is already here ("${runs.find((x) => x.id === r.run.id)!.name}") — edit it instead, or delete it first.`]);
    put((rs) => [r.run, ...rs]);
    setPasted(''); setErrors([]); setPasteOpen(false);
  };

  return (
    <div className="space-y-2">
      <section className="window" aria-labelledby="runs-h">
        <div className="window-head flex-wrap">
          <h2 id="runs-h" className="wh-title">PRODUCTION RUNS</h2>
          <span className="wh-note">
            {runs.length ? `${runs.length} RUN${runs.length === 1 ? '' : 'S'} · ${cents(toPay, { cents: false })} STILL TO PAY${unknown ? ` + ${unknown} UNPRICED` : ''}` : 'NONE YET'}
          </span>
        </div>
        <div className="window-body space-y-2">
          <RunTimeline runs={runs} today={today} onOpen={openRun} />
          <p className="stat-sub">
            CLICK A RUN TO OPEN IT. EACH CARD HOLDS STAGES, COSTS AND PAYMENTS, SHIPMENTS AND FILES (PRESS EDIT). UNPAID COSTS GO INTO THE CASH FORECAST, GOODS LINKED TO A SHOPIFY PRODUCT COUNT AS STOCK ON THE WAY, AND LATE STAGES OR PAYMENTS COMING DUE SHOW IN "THIS WEEK: LOOK INTO". SAVED WITH YOUR OTHER ENTRIES; A SYNC NEVER CHANGES THEM.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <form onSubmit={add} className="flex items-end gap-1" aria-label="Start a new run">
              <label>
                <span className="stat-label block">New run</span>
                <input className={box} placeholder="e.g. Washed Black cap reorder" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} />
              </label>
              <button type="submit" className={btn}>+ NEW RUN</button>
            </form>
            <button className={btn} onClick={() => setPasteOpen((x) => !x)} aria-expanded={pasteOpen}>PASTE A RUN</button>
          </div>
          {pasteOpen && (
            <div className="space-y-1">
              <p className="stat-sub">PASTE A RUN PREPARED IN A CLAUDE SESSION (FROM AN INVOICE, SAY). IT'S CHECKED BEFORE IT'S ADDED.</p>
              <textarea aria-label="Run to paste" className={`${box} h-32 font-mono`} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <button className={btn} onClick={addPasted}>ADD THIS RUN</button>
              {errors.length > 0 && (
                <ul role="alert" className="text-[0.8rem] tier-red">{errors.map((e) => <li key={e}>▲ {e}</li>)}</ul>
              )}
            </div>
          )}
        </div>
      </section>
      {runs.map((r) => (
        <RunCard
          key={r.id}
          run={r}
          today={today}
          onChange={(mut) => put((rs) => rs.map((x) => (x.id === r.id ? mut(x) : x)))}
          onDelete={() => put((rs) => rs.filter((x) => x.id !== r.id))}
          open={openIds.includes(r.id)}
          onToggle={() => toggle(r.id)}
        />
      ))}
    </div>
  );
}
