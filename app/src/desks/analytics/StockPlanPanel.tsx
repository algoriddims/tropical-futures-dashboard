// Stock on the way and the reorder lead time: the two things Shopify doesn't
// know that the "look into" list needs. Typed in here, saved with the other
// manual entries, and fed to the stock checks (src/analytics/metrics.ts).
import { useState } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { todayIn } from '@/analytics/period';
import type { IncomingStock } from '@/analytics/types';
import { InlineNumber } from '@/components/InlineEdit';
import type { AnalyticsView } from './useAnalytics';

const field = 'bg-[var(--crt-dark)] border border-[var(--crt-line)] px-1.5 py-1 text-[0.8rem] min-w-0 w-full';
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();

export function StockPlanPanel({ v }: { v: AnalyticsView }) {
  const { data, updateData } = useTerminal();
  const products = v.products.filter((p) => p.inCatalog).sort((a, b) => a.title.localeCompare(b.title));
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [units, setUnits] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;

  const incoming = data.incomingStock ?? [];
  const lead = data.leadTimeWeeks ?? null;
  const asOf = v.a.timezone ? todayIn(v.a.timezone, new Date(v.a.inventoryAsOf)) : null;
  const chosen = products.find((p) => p.productId === productId);
  const shopifyIncoming = products.flatMap((p) => p.variants.filter((x) => x.stock.incoming > 0).map((x) => ({ p, x })));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(units);
    if (!chosen) return setError('CHOOSE A PRODUCT.');
    if (!Number.isInteger(n) || n < 1) return setError('UNITS MUST BE A WHOLE NUMBER, 1 OR MORE.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('CHOOSE THE DATE YOU EXPECT IT.');
    const entry: Omit<IncomingStock, 'id'> = {
      productId: chosen.productId,
      variantId: chosen.variants.length === 1 ? chosen.variants[0].variant.variantId : variantId || null,
      units: n, expectedDate: date, ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}),
    };
    updateData((d) => ({ ...d, incomingStock: [...(d.incomingStock ?? []), { ...entry, id: `in-${Date.now()}` }] }));
    setUnits(''); setNote(''); setError(null);
  };
  const remove = (id: string) => updateData((d) => ({ ...d, incomingStock: (d.incomingStock ?? []).filter((x) => x.id !== id) }));

  const describe = (e: IncomingStock) => {
    const p = v.products.find((x) => x.productId === e.productId);
    const variant = p?.variants.find((x) => x.variant.variantId === e.variantId);
    const size = variant ? (variant.size ?? variant.color ?? variant.variant.variantTitle) : null;
    const counted = !p ? 'PRODUCT IS NO LONGER IN THE CATALOG — NOT COUNTED'
      : asOf && e.expectedDate <= asOf ? 'DATE HAS PASSED — NOT COUNTED. IF IT ARRIVED, REMOVE THIS; IF NOT, ADD IT AGAIN WITH THE NEW DATE'
        : e.variantId === null && p.variants.length > 1 ? 'NO SIZE GIVEN — NOT COUNTED IN THE STOCK CHECKS'
          : 'COUNTED IN THE STOCK CHECKS';
    return { title: p?.title ?? 'Unknown product', size, counted, ok: counted.startsWith('COUNTED') };
  };

  return (
    <section className="window" aria-labelledby="sp-h">
      <div className="window-head flex-wrap">
        <h2 id="sp-h" className="wh-title">STOCK ON THE WAY</h2>
        <span className="wh-note">
          REORDER LEAD TIME{' '}
          <InlineNumber
            className="warm"
            value={lead}
            format={(n) => (n === null ? 'SET (WEEKS)' : `${n} ${n === 1 ? 'WEEK' : 'WEEKS'}`)}
            title="WEEKS FROM PLACING AN ORDER TO STOCK IN HAND (0 TO CLEAR)"
            onCommit={(n) => updateData((d) => ({ ...d, leadTimeWeeks: n > 0 ? Math.min(52, Math.round(n * 10) / 10) : null }))}
          />
        </span>
      </div>
      <div className="window-body space-y-3">
        <p className="stat-sub">
          WHAT YOU'VE ORDERED AND WHEN YOU EXPECT IT. THE "LOOK INTO" LIST COUNTS IT FROM THAT DATE, AND USES THE LEAD TIME FOR REORDER-BY DATES.
          {lead === null && ' NO LEAD TIME IS SET, SO NO REORDER-BY DATE IS SHOWN.'}
        </p>

        {incoming.length === 0 ? (
          <p className="stat-sub">NOTHING RECORDED AS ON THE WAY.</p>
        ) : (
          <ul className="space-y-1 text-[0.8rem]" aria-label="Stock on the way">
            {incoming.map((e) => {
              const d = describe(e);
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-[var(--crt-mid)] pt-1">
                  <span className="min-w-0">
                    <span className="warm">{d.title}</span>{d.size && <span className="dim"> · {d.size}</span>}
                    <span> · {e.units} {e.units === 1 ? 'UNIT' : 'UNITS'} · EXPECTED {dayLabel(e.expectedDate)}</span>
                    {e.note && <span className="dim"> · {e.note}</span>}
                    <span className={`block stat-sub ${d.ok ? '' : 'tier-amber'}`}>{d.counted}</span>
                  </span>
                  <button onClick={() => remove(e.id)} className="tap border border-[var(--crt-line)] px-2 py-0.5 font-display text-xs" aria-label={`Remove ${e.units} units of ${d.title} expected ${e.expectedDate}`}>REMOVE</button>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={add} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_6rem_10rem_minmax(0,2fr)_auto] lg:items-end" aria-label="Add stock on the way">
          <label className="min-w-0">
            <span className="stat-label block">Product</span>
            <select className={field} value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(''); }}>
              <option value="">Choose…</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.title}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="stat-label block">Size / variant</span>
            <select className={field} value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!chosen || chosen.variants.length === 1}>
              {chosen && chosen.variants.length === 1
                ? <option value="">{chosen.variants[0].size ?? chosen.variants[0].color ?? 'Only one'}</option>
                : <option value="">Not known yet</option>}
              {chosen && chosen.variants.length > 1 && chosen.variants.map((x) => (
                <option key={x.variant.variantId} value={x.variant.variantId}>{x.size ?? x.color ?? x.variant.variantTitle}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="stat-label block">Units</span>
            <input className={field} type="number" min={1} step={1} inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} />
          </label>
          <label className="min-w-0">
            <span className="stat-label block">Expected</span>
            <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="min-w-0">
            <span className="stat-label block">Note (optional)</span>
            <input className={field} type="text" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" className="tap border border-[var(--crt-line)] px-3 py-1 font-display text-sm">ADD</button>
        </form>
        {error && <p role="alert" className="text-[0.8rem] tier-red">▲ {error}</p>}

        {shopifyIncoming.length > 0 && (
          <p className="stat-sub">
            SHOPIFY ALSO SHOWS INCOMING STOCK WITH NO DATE (NOT COUNTED): {shopifyIncoming.map(({ p, x }) => `${p.title}${x.size ? ` ${x.size}` : ''} ${x.stock.incoming}`).join(' · ').toUpperCase()}.
          </p>
        )}
      </div>
    </section>
  );
}
