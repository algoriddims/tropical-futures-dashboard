// Tier 3 of the Stock desk — why: when each selling size runs out (with stock
// on the way and the lead time), which sizes sell, and where the money tied up
// in stock sits. Every chart has direct labels and a table or text fallback.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { formatMoney } from '@/analytics/money';
import { addDays } from '@/analytics/period';
import type { Ymd } from '@/analytics/period';
import type { Runway, ShelfValue, SizeCurves } from '@/analytics/stock';
import { splitBySales } from '@/analytics/stock';
import { suggestedLeadWeeks } from '@/game/production';
import { InlineNumber } from '@/components/InlineEdit';
import { plural } from '@/game/format';

const day = (d: Ymd) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();
const dayYear = (d: Ymd, ref: Ymd | null) => (ref && d.slice(0, 4) !== ref.slice(0, 4) ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase() : day(d));
const perWeek = (pace: number) => { const w = pace * 7; return w >= 10 ? `${Math.round(w)}` : w >= 1 ? w.toFixed(1).replace(/\.0$/, '') : w.toFixed(1); };

export function Card({ title, head, note, children, className = '' }: { title: string; head?: ReactNode; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`window min-w-0 ${className}`} aria-label={title}>
      <div className="window-head flex-wrap"><h3 className="wh-title">{title}</h3>{head && <span className="wh-note">{head}</span>}</div>
      <div className="window-body">
        {children}
        {note && <div className="stat-sub mt-2">{note}</div>}
      </div>
    </section>
  );
}

// diagonal hatching for stock on the way (an estimate); CSS so it doesn't stretch with the chart
const HATCH_CSS = 'repeating-linear-gradient(135deg, var(--phase-1) 0 2px, color-mix(in srgb, var(--phase-1) 16%, transparent) 2px 6px)';

const Swatch = ({ fill, stroke }: { fill: string; stroke?: string }) => (
  <svg width="12" height="10" className="shrink-0" aria-hidden><rect width="12" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} /></svg>
);

// ── lead time control ──────────────────────────────────────────────────────

export function LeadTime() {
  const { data, updateData } = useTerminal();
  if (!data) return null;
  const lead = data.leadTimeWeeks ?? null;
  const set = (n: number) => updateData((d) => ({ ...d, leadTimeWeeks: n > 0 ? Math.min(52, Math.round(n * 10) / 10) : null }));
  const hint = lead === null ? suggestedLeadWeeks(data.productionRuns ?? []) : null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span>REORDER LEAD TIME</span>
      <InlineNumber className="warm" value={lead} format={(n) => (n === null ? 'SET (WEEKS)' : `${n} ${n === 1 ? 'WEEK' : 'WEEKS'}`)}
        title="WEEKS FROM PLACING AN ORDER TO STOCK IN HAND (0 TO CLEAR)" onCommit={set} />
      {hint && (
        <button className="tap border border-[var(--crt-line)] px-1.5 font-display text-xs text-[var(--vhs-white)]" onClick={() => set(hint.weeks)}
          title={`${hint.run}: ${hint.days} days of bulk production + transit`}>
          USE {hint.weeks} WEEKS (LAST RUN) →
        </button>
      )}
    </span>
  );
}

// ── runway ─────────────────────────────────────────────────────────────────

export function RunwayChart({ r, currency }: { r: Runway | null; currency: string }) {
  const [all, setAll] = useState(false);
  if (!r) return <Card title="WHEN EACH SIZE RUNS OUT"><p className="stat-sub">UNAVAILABLE — BUSINESS TIMEZONE NOT CONFIGURED.</p></Card>;
  const H = r.horizonDays;
  const rows = all ? r.rows : r.rows.slice(0, 8);
  const weeks = Array.from({ length: Math.floor(H / 7) + 1 }, (_, i) => i * 7);
  const lead = r.leadDays !== null && r.leadDays <= H ? r.leadDays : null;
  const xPct = (d: number) => `${(Math.min(d, H) / H) * 100}%`;

  return (
    <Card title={`WHEN EACH SIZE RUNS OUT · NEXT ${H / 7} WEEKS`} head={<LeadTime />} note={
      <>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1"><Swatch fill="var(--phase-1)" />IN STOCK</span>
          <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-[10px] w-3 rounded-sm" style={{ background: HATCH_CSS }} />ON THE WAY (DATED)</span>
          <span className="inline-flex items-center gap-1"><Swatch fill="var(--critical)" />NO STOCK</span>
          {lead !== null && <span className="inline-flex items-center gap-1"><svg width="12" height="10" aria-hidden><line x1="6" x2="6" y1="0" y2="10" stroke="var(--vhs-white)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>AN ORDER PLACED TODAY LANDS ~{day(addDays(r.asOf, lead))}</span>}
        </span>
        <span className="block mt-1">
          AT EACH SIZE'S PACE OVER THE 28 DAYS BEFORE THE STOCK READ ({day(r.asOf)}), ALL CHANNELS. AN ESTIMATE: A DROP, A POST OR A SELLOUT CHANGES THE PACE.
          {r.thin.length > 0 && ` ${plural(r.thin.length, 'MORE SIZE')} SOLD ONCE IN THOSE 28 DAYS — TOO FEW TO PROJECT${r.thin.length <= 4 ? ` (${r.thin.map((t) => t.label).join(', ')})` : ''}.`}
          {r.leadDays === null && ' SET A LEAD TIME TO SEE WHEN AN ORDER PLACED TODAY WOULD LAND.'}
        </span>
      </>
    }>
      {r.rows.length === 0 ? (
        <p className="stat-sub">NO SIZE SOLD TWICE OR MORE IN THE 28 DAYS BEFORE THE STOCK READ, SO THERE IS NO PACE TO PROJECT.</p>
      ) : (
        <div role="table" aria-label="When each size runs out" className="text-[0.8rem]">
          <div role="row" className="hidden sm:grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_10rem] sm:gap-3">
            <span role="columnheader" className="stat-label">Size</span>
            <span role="columnheader" className="relative h-4" aria-label="Weeks from the stock read">
              {weeks.map((w) => (
                <span key={w} className="absolute -translate-x-1/2 stat-sub" style={{ left: xPct(w) }}>{w === 0 ? 'NOW' : `${w / 7}W`}</span>
              ))}
            </span>
            <span role="columnheader" className="stat-label text-right">Runs out</span>
          </div>
          {rows.map((x) => {
            const short = x.segments.find((s) => s.kind === 'short');
            const out = x.sellable <= 0;
            const status = short
              ? out ? 'OUT NOW' : `OUT ~${day(x.runsOutOn)}`
              : `COVERED ${H / 7}+ WK`;
            const back = short && x.segments.find((s) => s.kind === 'incoming' && s.from >= short.from);
            const label = `${x.product}${x.variant ? ` · ${x.variant}` : ''}`;
            return (
              <div role="row" key={x.key} className="grid grid-cols-1 gap-x-3 gap-y-0.5 border-t border-[var(--crt-mid)] py-1.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_10rem] sm:items-center">
                <span role="rowheader" className="min-w-0">
                  <span className="block truncate warm" title={label}>{x.product}</span>
                  <span className="stat-sub">{x.variant && <strong className="text-[var(--vhs-white)]">{x.variant.toUpperCase()} · </strong>}{x.sellable} LEFT · ~{perWeek(x.dailyPace)} A WEEK</span>
                </span>
                <span role="cell" className="min-w-0">
                  <span className="relative block h-[18px]" role="img"
                    aria-label={`${label}: ${x.sellable} in stock at about ${perWeek(x.dailyPace)} a week; ${short ? `no stock from about ${day(addDays(r.asOf, short.from + 1))}` : `covered for ${H / 7}+ weeks`}${x.arrivals.length ? `; ${x.arrivals.map((a) => `${a.units} arrive ${day(a.date)}`).join(', ')}` : ''}`}>
                    {weeks.slice(1).map((w) => <span key={w} aria-hidden className="absolute inset-y-0 w-px bg-[var(--crt-mid)]" style={{ left: xPct(w) }} />)}
                    {x.segments.map((s) => (
                      <span key={s.from} aria-hidden className="absolute"
                        style={{
                          left: xPct(s.from), width: `${((s.to - s.from) / H) * 100}%`,
                          top: s.kind === 'short' ? 7 : 3, height: s.kind === 'short' ? 4 : 12,
                          background: s.kind === 'short' ? 'var(--critical)' : s.kind === 'hand' ? 'var(--phase-1)' : HATCH_CSS,
                        }} />
                    ))}
                    {x.arrivals.filter((a) => a.day <= H).map((a) => (
                      <span key={a.date} aria-hidden className="absolute inset-y-0 w-0.5 bg-[var(--phase-1)]" style={{ left: xPct(a.day - 1) }} />
                    ))}
                    {lead !== null && <span aria-hidden className="absolute -inset-y-1 border-l-[1.5px] border-dashed border-[var(--vhs-white)]" style={{ left: xPct(lead) }} />}
                  </span>
                  {x.arrivals.length > 0 && (
                    <span className="stat-sub block">{x.arrivals.map((a) => `+${a.units} ~${day(a.date)}`).join(' · ')}</span>
                  )}
                </span>
                <span role="cell" className="sm:text-right">
                  <span className={`font-display ${short ? 'tier-red' : 'tier-green'}`}>{status}</span>
                  <span className="stat-sub block">
                    {short && back ? `BACK ~${day(addDays(r.asOf, back.from + 1))} · ` : ''}
                    {x.atRisk > 0 ? `≈ ${formatMoney({ currency, minor: x.atRisk })} AT RISK (4 WK)` : short ? 'NO SALES LOST IN 4 WK' : ''}
                  </span>
                </span>
              </div>
            );
          })}
          {r.rows.length > 8 && (
            <button className="tap stat-sub mt-1 underline" onClick={() => setAll(!all)}>{all ? 'SHOW FEWER' : `SHOW ALL ${r.rows.length}`}</button>
          )}
        </div>
      )}
    </Card>
  );
}

// ── size curve ─────────────────────────────────────────────────────────────

export function SizeCurveChart({ c }: { c: SizeCurves }) {
  const [pick, setPick] = useState<string | null>(null);
  const curve = c.curves.find((x) => x.type === pick) ?? c.curves[0];
  if (!curve) return <Card title="WHICH SIZES SELL"><p className="stat-sub">NO PRODUCTS WITH SIZES.</p></Card>;
  const max = Math.max(...curve.sizes.flatMap((x) => [curve.soldTotal ? x.sold / curve.soldTotal : 0, curve.stockTotal ? x.stock / curve.stockTotal : 0]), 0.01);
  const split = splitBySales(curve, 100);
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const name = curve.type.toUpperCase().replace(/^TSHIRT$/, 'TEES');
  return (
    <Card title="WHICH SIZES SELL VS WHAT'S ON THE SHELF" head={c.curves.length > 1 && (
      <span role="group" aria-label="Product type" className="flex flex-wrap gap-1">
        {c.curves.map((x) => (
          <button key={x.type} onClick={() => setPick(x.type)} aria-pressed={x.type === curve.type}
            className={`tap border px-1.5 font-display text-xs ${x.type === curve.type ? 'border-[var(--phase-1)] text-[var(--vhs-white)]' : 'border-[var(--crt-line)] dim'}`}>
            {x.type.toUpperCase().replace(/^TSHIRT$/, 'TEES')}
          </button>
        ))}
      </span>
    )} note={
      <>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1"><Swatch fill="var(--phase-1)" />SHARE OF {curve.soldTotal} SOLD, LAST 12 MONTHS</span>
          <span className="inline-flex items-center gap-1"><Swatch fill="var(--phase-3)" />SHARE OF {curve.stockTotal} IN STOCK NOW</span>
        </span>
        {split && (
          <span className="block mt-1">
            A 100-PIECE {name} RUN SPLIT THE WAY THEY'VE SOLD: <strong className="text-[var(--vhs-white)]">{split.map((x) => `${x.size} ${x.units}`).join(' · ')}</strong>
            {curve.soldTotal < 30 ? ` — BASED ON ONLY ${curve.soldTotal} SALES, SO A ROUGH GUIDE.` : '.'} ALL {name} COMBINED; ONE DESIGN CAN SELL DIFFERENTLY.
          </span>
        )}
        {c.covered < c.total && <span className="block tier-amber">SALES DATA COVERS {c.covered} OF {c.total} DAYS.</span>}
      </>
    }>
      <div className="grid gap-x-2" style={{ gridTemplateColumns: `repeat(${curve.sizes.length}, minmax(0, 1fr))` }} role="img"
        aria-label={`${name}: ${curve.sizes.map((x) => `${x.size} ${pct(x.sold, curve.soldTotal)}% of sales, ${pct(x.stock, curve.stockTotal)}% of stock`).join('; ')}`}>
        {curve.sizes.map((x) => {
          const s = curve.soldTotal ? x.sold / curve.soldTotal : 0;
          const k = curve.stockTotal ? x.stock / curve.stockTotal : 0;
          return (
            <div key={x.size} className="flex min-w-0 flex-col items-center">
              <svg viewBox="0 0 40 110" width="100%" height="110" preserveAspectRatio="none" aria-hidden>
                <rect x="4" y={100 - (s / max) * 96} width="15" height={(s / max) * 96} rx="2" fill="var(--phase-1)" />
                <rect x="21" y={100 - (k / max) * 96} width="15" height={(k / max) * 96} rx="2" fill="var(--phase-3)" />
                <line x1="0" x2="40" y1="100" y2="100" stroke="var(--crt-line)" vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="font-display text-sm">{x.size}</span>
              <span className="stat-sub whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(x.sold, curve.soldTotal)}% · {pct(x.stock, curve.stockTotal)}%</span>
              <span className="stat-sub whitespace-nowrap dim">{x.sold} · {x.stock}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── shelf value ────────────────────────────────────────────────────────────

/** Colour per product by age band; legend entries in band order. */
export interface ShelfColors { of: (productId: string) => { color: string; label: string } | null; legend: { color: string; label: string }[] }

export function ShelfChart({ v, currency, colors }: { v: ShelfValue; currency: string; colors?: ShelfColors }) {
  const top = v.rows.slice(0, 8);
  const rest = v.rows.slice(8);
  const restCost = rest.reduce((n, r) => n + r.atCost, 0);
  const max = Math.max(...top.map((r) => r.atCost), restCost, 1);
  const fm = (minor: number) => formatMoney({ currency, minor });
  const idleShare = v.atCost > 0 ? Math.round((v.idleAtCost / v.atCost) * 100) : 0;
  return (
    <Card title="WHERE THE MONEY IN STOCK SITS" note={
      <>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {colors
            ? colors.legend.map((x) => <span key={x.label} className="inline-flex items-center gap-1"><Swatch fill={x.color} />{x.label}</span>)
            : <>
              <span className="inline-flex items-center gap-1"><Swatch fill="var(--phase-1)" />SOLD IN THE LAST 90 DAYS</span>
              <span className="inline-flex items-center gap-1"><Swatch fill="var(--phase-2)" />NO SALES IN 90 DAYS</span>
            </>}
        </span>
        <span className="block mt-1">
          AT RECORDED UNIT COST, SELLABLE STOCK ONLY. {idleShare > 0 && `${idleShare}% OF IT (${fm(v.idleAtCost)}, ${plural(v.idleUnits, 'UNIT')}) HASN'T SOLD IN 90 DAYS. `}
          {v.unitsNoCost > 0 && `${plural(v.unitsNoCost, 'UNIT')} HAVE NO COST IN SHOPIFY AND AREN'T VALUED.`}
        </span>
      </>
    }>
      {top.length === 0 ? <p className="stat-sub">NO SELLABLE STOCK.</p> : (
        <ul className="space-y-1.5 text-[0.8rem]" aria-label="Stock at cost by product">
          {top.map((r) => {
            const idle = r.soldInWindow <= 0;
            return (
              <li key={r.productId} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                <span className="min-w-0">
                  <span className="block truncate" title={r.title}>{r.title}</span>
                  <span className="stat-sub">{colors?.of(r.productId) ? `${colors.of(r.productId)!.label} · ` : ''}{plural(r.units, 'UNIT')}{idle ? (r.lastSale ? ` · LAST SALE ${dayYear(r.lastSale, v.window?.to ?? null)}` : ' · NO SALE IN 12 MO') : ` · ${r.soldInWindow} SOLD IN 90 D`}</span>
                </span>
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 flex-1" aria-hidden>
                    <rect x="0" y="0" width={r.atCost > 0 ? Math.max(1.5, (r.atCost / max) * 100) : 0} height="10" rx="2" fill={colors?.of(r.productId)?.color ?? (idle ? 'var(--phase-2)' : 'var(--phase-1)')} />
                  </svg>
                  <span className="w-20 shrink-0 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.atCost > 0 ? fm(r.atCost) : 'NO COST'}{r.unitsNoCost > 0 && r.atCost > 0 ? '*' : ''}</span>
                </span>
              </li>
            );
          })}
          {rest.length > 0 && (
            <li className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
              <span className="dim">{plural(rest.length, 'OTHER PRODUCT')}</span>
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 flex-1" aria-hidden>
                  <rect x="0" y="0" width={Math.max(1.5, (restCost / max) * 100)} height="10" rx="2" fill="var(--vhs-dim)" opacity="0.55" />
                </svg>
                <span className="w-20 shrink-0 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fm(restCost)}</span>
              </span>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
