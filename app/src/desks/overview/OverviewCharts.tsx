// Tier 3 of the overview — why the numbers look like this:
// money in vs out by month (bank basis) and where the period's sales came from.
// Tier 4 helper: a remembered fold for the detail panels.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { monthSeries, salesShare } from '@/game/overview';
import { money } from '@/game/format';
import type { AnalyticsState } from '../analytics/useAnalytics';

const monthShort = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="window min-w-0" aria-label={title}>
      <div className="window-head"><h3 className="wh-title">{title}</h3></div>
      <div className="window-body">
        {children}
        {note && <div className="stat-sub mt-2">{note}</div>}
      </div>
    </section>
  );
}

export function MonthsChart() {
  const { data } = useTerminal();
  if (!data) return null;
  const months = monthSeries(data, 7);
  if (!months.length) {
    return <Card title="MONEY IN VS OUT, BY MONTH"><p className="stat-sub">UNAVAILABLE — NEEDS THE BUSINESS BANK AND CARD SYNC.</p></Card>;
  }
  const W = 640, H = 230, X0 = 56, X1 = 630, TOP = 12, BOTTOM = 196;
  const maxIn = Math.max(...months.map((m) => m.counted + m.untagged), 1);
  const maxOut = Math.max(...months.map((m) => m.spending), 1);
  const zero = TOP + ((BOTTOM - TOP) * maxIn) / (maxIn + maxOut);
  const k = (BOTTOM - TOP) / (maxIn + maxOut);
  const step = (X1 - X0) / months.length;
  const bw = Math.min(44, step * 0.55);
  const tick = (() => { const raw = Math.max(maxIn, maxOut) / 3; const p = 10 ** Math.floor(Math.log10(raw)); return Math.ceil(raw / p) * p; })();
  const ticks = [-3, -2, -1, 1, 2, 3].map((n) => n * tick).filter((v) => (v > 0 ? v <= maxIn : -v <= maxOut));
  const losing = months.filter((m) => !m.partial && m.net < 0).length;
  const complete = months.filter((m) => !m.partial).length;

  return (
    <Card title="MONEY IN VS OUT, BY MONTH" note={
      <>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1"><svg width="12" height="10" className="shrink-0" aria-hidden><rect width="12" height="10" rx="2" fill="var(--phase-1)" /></svg>IN (PAYOUTS + TAGGED)</span>
          <span className="inline-flex items-center gap-1"><svg width="12" height="10" className="shrink-0" aria-hidden><rect width="12" height="10" rx="2" fill="url(#mo-hatch)" stroke="var(--phase-1)" strokeWidth="0.5" /></svg>NOT TAGGED YET</span>
          <span className="inline-flex items-center gap-1"><svg width="12" height="10" className="shrink-0" aria-hidden><rect width="12" height="10" rx="2" fill="var(--phase-2)" /></svg>OUT</span>
          <span>NUMBER = IN − OUT, UNTAGGED NOT COUNTED · * MONTH NOT OVER</span>
        </span>
        <span className="block mt-1">{complete ? `OUT WAS MORE THAN IN IN ${losing} OF THE LAST ${complete} COMPLETE MONTHS, COUNTING TAGGED MONEY ONLY.` : ''}</span>
      </>
    }>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[520px]" role="img"
          aria-label={`Money in and out by month, ${months[0].month} to ${months[months.length - 1].month}; the table below lists the figures`}>
          <defs>
            <pattern id="mo-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--phase-1)" opacity="0.16" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--phase-1)" strokeWidth="2" />
            </pattern>
          </defs>
          {ticks.map((v) => {
            const y = zero - v * k;
            return (
              <g key={v}>
                <line x1={X0 - 4} x2={X1} y1={y} y2={y} stroke="var(--crt-mid)" />
                <text x={X0 - 8} y={y + 4} fontSize="10" textAnchor="end" fill="var(--vhs-dim)">{v > 0 ? '+' : '−'}{money(Math.abs(v))}</text>
              </g>
            );
          })}
          <line x1={X0 - 4} x2={X1} y1={zero} y2={zero} stroke="var(--crt-line)" />
          <text x={X0 - 8} y={zero + 4} fontSize="10" textAnchor="end" fill="var(--vhs-dim)">$0</text>
          {months.map((m, i) => {
            const x = X0 + i * step + (step - bw) / 2;
            const hIn = m.counted * k, hUn = m.untagged * k, hOut = m.spending * k;
            return (
              <g key={m.month}>
                <title>{`${monthShort(m.month)}${m.partial ? ' (not over)' : ''}: in ${money(m.counted)}${m.untagged ? ` + ${money(m.untagged)} not tagged` : ''}, out ${money(m.spending)}, net ${money(m.net, { signed: true })}`}</title>
                {hIn > 0 && <rect x={x} y={zero - hIn} width={bw} height={Math.max(1, hIn - 1)} rx="3" fill="var(--phase-1)" />}
                {hUn > 0 && <rect x={x} y={zero - hIn - hUn} width={bw} height={Math.max(1, hUn - 2)} rx="3" fill="url(#mo-hatch)" />}
                {hOut > 0 && <rect x={x} y={zero + 1} width={bw} height={hOut} rx="3" fill="var(--phase-2)" />}
                <text x={x + bw / 2} y={zero + hOut + 13} fontSize="10" textAnchor="middle" fill={m.net < 0 ? 'var(--critical)' : 'var(--good)'}>{money(m.net, { signed: true })}</text>
                <text x={x + bw / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--vhs-dim)">{monthShort(m.month)}{m.partial ? '*' : ''}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="mt-1">
        <summary className="stat-sub cursor-pointer">SHOW AS TABLE</summary>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full min-w-[420px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <caption className="sr-only">Money in and out by month</caption>
            <thead><tr className="stat-label text-left">
              <th scope="col" className="px-2 py-1 font-normal">Month</th>
              <th scope="col" className="px-2 py-1 text-right font-normal">In</th>
              <th scope="col" className="px-2 py-1 text-right font-normal">Not tagged</th>
              <th scope="col" className="px-2 py-1 text-right font-normal">Out</th>
              <th scope="col" className="px-2 py-1 text-right font-normal">In − out</th>
            </tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-[var(--crt-mid)]">
                  <th scope="row" className="px-2 py-1 text-left font-normal">{monthShort(m.month)} {m.month.slice(0, 4)}{m.partial ? ' (not over)' : ''}</th>
                  <td className="px-2 py-1 text-right">{money(m.counted)}</td>
                  <td className="px-2 py-1 text-right">{m.untaggedCount === null ? 'not taggable' : money(m.untagged)}</td>
                  <td className="px-2 py-1 text-right">{money(m.spending)}</td>
                  <td className={`px-2 py-1 text-right ${m.net < 0 ? 'tier-red' : 'tier-green'}`}>{money(m.net, { signed: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

export function SalesShareChart({ an }: { an: AnalyticsState }) {
  if (an.kind !== 'ok') {
    return <Card title="WHERE THE SALES CAME FROM"><p className="stat-sub">UNAVAILABLE — NEEDS A SYNC WITH VARIANT-LEVEL DATA.</p></Card>;
  }
  const { rows, total } = salesShare(an.view.products, 4);
  const lead = rows[0];
  return (
    <Card title={`WHERE THE LAST ${an.view.cmp.days} DAYS' SALES CAME FROM`} note={
      lead ? (lead.share >= 0.5
        ? `ONE PRODUCT MADE ${Math.round(lead.share * 100)}% OF ${money(total)}. SALES THIS CONCENTRATED SWING WITH THAT ONE PRODUCT'S STOCK.`
        : `${money(total)} ACROSS ${rows.reduce((n, r) => n + (r.others || 1), 0)} PRODUCTS.`) : undefined
    }>
      {rows.length === 0 ? <p className="stat-sub">NO SALES IN THIS PERIOD.</p> : (
        <ul className="space-y-2" aria-label="Net sales by product">
          {rows.map((r, i) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 text-[0.8rem] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
              <span className="truncate" title={r.label}>{r.label}</span>
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 flex-1" aria-hidden>
                  <rect x="0" y="0" width={Math.max(1.5, r.share * 100)} height="10" rx="2" fill={i === 0 ? 'var(--phase-1)' : 'var(--vhs-dim)'} opacity={i === 0 ? 1 : 0.55} />
                </svg>
                <span className="w-28 shrink-0 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.net)} · {Math.round(r.share * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FOLD_KEY = 'tfi-overview-folds-v1';
const readFolds = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') ?? {}; } catch { return {}; }
};

/** A folded detail section; whether it's open is remembered in this browser. */
export function Fold({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => !!readFolds()[id]);
  return (
    <details className="window" open={open} onToggle={(e) => {
      const now = (e.currentTarget as HTMLDetailsElement).open;
      setOpen(now);
      try { localStorage.setItem(FOLD_KEY, JSON.stringify({ ...readFolds(), [id]: now })); } catch { /* not remembered */ }
    }}>
      <summary className="window-head cursor-pointer list-none">
        <span className="wh-title">{open ? '▾' : '▸'} {title}</span>
      </summary>
      {open && <div className="space-y-2 p-2">{children}</div>}
    </details>
  );
}
