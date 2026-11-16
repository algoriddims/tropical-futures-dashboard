import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { formatMoney } from '@/analytics/money';
import { eachDay, formatRange, inRange } from '@/analytics/period';
import * as M from '@/analytics/metrics';
import type { Availability, MetricResult } from '@/analytics/types';
import type { ChannelFilter } from '@/analytics/channels';
import { CHANNEL_NOTE, METRICS } from '@/analytics/dictionary';
import { Dialog } from '@/terminal/Dialog';
import type { AnalyticsState, AnalyticsView } from './useAnalytics';

// ── small shared pieces ─────────────────────────────────────────────────────

export function AvailBadge({ status, reason }: { status: Availability; reason?: string }) {
  if (status === 'valid') return null;
  return (
    <span className={`badge ${status === 'partial' ? 'tier-amber' : 'dim'}`} title={reason}>
      {status === 'partial' ? 'PARTIAL' : 'UNAVAILABLE'}
    </span>
  );
}

const pctText = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;

/** "+$103 (+24.9%) vs prior" — growth % only from a positive baseline. */
export function MoneyChange({ cur, prior, currency }: { cur: number; prior: number; currency: string }) {
  const c = M.change(cur, prior);
  const tone = c.abs > 0 ? 'tier-green' : c.abs < 0 ? 'tier-red' : 'dim';
  return (
    <span className={tone}>
      {c.abs > 0 ? '▲ ' : c.abs < 0 ? '▼ ' : ''}{formatMoney({ currency, minor: c.abs }, { signed: true })}
      {c.pct !== null ? ` (${pctText(c.pct)})` : <span className="dim"> ({c.note})</span>}
    </span>
  );
}

function Unavailable({ reason }: { reason?: string }) {
  return <p className="stat-sub">Unavailable — {reason}</p>;
}

function Stat({ label, metric, children, sub }: { label: string; metric: MetricResult<unknown>; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="stat-label">{label}</span>
        <AvailBadge status={metric.status} reason={metric.reason} />
      </div>
      {metric.status === 'unavailable' ? <Unavailable reason={metric.reason} /> : children}
      {sub && <div className="stat-sub">{sub}</div>}
      {metric.status === 'partial' && metric.reason && <div className="stat-sub tier-amber">{metric.reason}</div>}
    </div>
  );
}

// ── channel filter ─────────────────────────────────────────────────────────

const FILTERS: { key: ChannelFilter; label: string }[] = [
  { key: 'ALL', label: 'ALL CHANNELS' },
  { key: 'DTC', label: 'DTC' },
  { key: 'UNMAPPED', label: 'UNMAPPED' },
];

export function ChannelFilterControl() {
  const { channelFilter, setChannelFilter } = useTerminal();
  return (
    <div role="group" aria-label="Channel filter" className="flex flex-wrap gap-1">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => setChannelFilter(f.key)}
          aria-pressed={channelFilter === f.key}
          className={`tap border px-2 py-0.5 font-display text-sm ${channelFilter === f.key ? 'border-[var(--q-strong,var(--phosphor))] text-[var(--vhs-white)]' : 'border-[var(--crt-line)] dim'}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── definitions ────────────────────────────────────────────────────────────

export function DefinitionsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="tap border border-[var(--crt-line)] px-2 py-0.5 font-display text-sm dim hover:text-[var(--vhs-white)]">
        DEFINITIONS
      </button>
      {open && (
        <Dialog label="Metric definitions" onClose={() => setOpen(false)} className="max-w-[760px]">
          <div className="panel-head">
            <span>METRIC DEFINITIONS</span>
            <button onClick={() => setOpen(false)} className="keycap tap" aria-label="Close">ESC</button>
          </div>
          <div className="space-y-4 p-4 text-[0.82rem] leading-relaxed">
            <p className="dim">{CHANNEL_NOTE} Comparisons show the absolute change; growth % only when the prior value is positive; margins change in percentage points.</p>
            {METRICS.map((m) => (
              <section key={m.id} aria-label={m.name}>
                <h3 className="font-display text-base">{m.name}{m.status === 'unavailable' && <span className="badge dim ml-2">UNAVAILABLE</span>}</h3>
                <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-[9rem_1fr]">
                  {([['Formula', m.formula], ['Requires', m.requires], ['Eligible', m.eligible], ['Time basis', m.timeBasis], ['Refunds', m.refunds], ['Currency', m.currency], ['Excludes', m.exclusions], ['Limits', m.limitations]] as const).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="stat-label">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

// ── trend: cumulative net revenue, current vs prior ────────────────────────

function cumulative(v: AnalyticsView, which: 'current' | 'prior', filter: ChannelFilter): (number | null)[] {
  const range = v.cmp[which];
  const cov = new Set(eachDay(range).filter((d) => !(d < v.a.salesCoverage.from || d > v.a.salesCoverage.to || v.a.salesCoverage.missing.includes(d))));
  let run = 0;
  return eachDay(range).map((d) => {
    if (!cov.has(d)) return null; // unknown day: the line breaks, it doesn't drop to zero
    run += M.periodTotals({ ...v.a, daily: v.a.daily.filter((r) => r.date === d) }, { from: d, to: d }, filter).netSales;
    return run;
  });
}

export function TrendChart({ v }: { v: AnalyticsView }) {
  const { channelFilter } = useTerminal();
  const cur = cumulative(v, 'current', channelFilter);
  const prior = cumulative(v, 'prior', channelFilter);
  const all = [...cur, ...prior].filter((x): x is number => x !== null);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const W = 320, H = 120, P = 4;
  const n = cur.length;
  const x = (i: number) => P + (i / Math.max(1, n - 1)) * (W - 2 * P);
  const y = (val: number) => H - P - ((val - min) / (max - min)) * (H - 2 * P);
  const path = (series: (number | null)[]) => {
    let d = '';
    let pen = false;
    series.forEach((val, i) => {
      if (val === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const last = (s: (number | null)[]) => [...s].reverse().find((z) => z !== null) ?? null;
  const c = v.a.currency;
  const summary = `Cumulative net product revenue over ${n} days: ${formatMoney(last(cur) === null ? null : { currency: c, minor: last(cur)! })} this period (${formatRange(v.cmp.current)}) vs ${formatMoney(last(prior) === null ? null : { currency: c, minor: last(prior)! })} in the prior period (${formatRange(v.cmp.prior)}).`;
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label={summary} preserveAspectRatio="none">
        {min < 0 && <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--crt-line)" strokeWidth="1" />}
        <path d={path(prior)} fill="none" stroke="var(--vhs-dim)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <path d={path(cur)} fill="none" stroke="var(--vhs-white)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 stat-sub">
        <span><span aria-hidden>━</span> THIS PERIOD (SOLID)</span>
        <span><span aria-hidden>┅</span> PRIOR PERIOD (DASHED)</span>
        <span>CUMULATIVE NET PRODUCT REVENUE BY DAY</span>
      </figcaption>
      <details className="mt-1">
        <summary className="stat-sub cursor-pointer">SHOW AS TABLE</summary>
        <p className="sr-only">{summary}</p>
        <div className="max-h-48 overflow-auto">
          <table className="w-full text-[0.78rem]">
            <caption className="sr-only">Cumulative net product revenue by day of period</caption>
            <thead><tr className="text-left dim"><th className="font-normal">Day</th><th className="font-normal">{formatRange(v.cmp.current)}</th><th className="font-normal">{formatRange(v.cmp.prior)}</th></tr></thead>
            <tbody>
              {cur.map((val, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{val === null ? 'no data' : formatMoney({ currency: c, minor: val }, { cents: true })}</td>
                  <td>{prior[i] === null ? 'no data' : formatMoney({ currency: c, minor: prior[i]! }, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// ── the summary ────────────────────────────────────────────────────────────

const FILTER_LABEL: Record<ChannelFilter, string> = { ALL: 'ALL CHANNELS', DTC: 'DTC ONLY', WHOLESALE: 'WHOLESALE', UNMAPPED: 'UNMAPPED CHANNELS ONLY' };

// A change that rounds to 0.0 points is shown as no change, not as a red −0.0.
function PpChange({ pp }: { pp: number }) {
  const r = Math.round(pp * 10) / 10;
  if (r === 0) return <span>±0.0 PP</span>;
  return <span className={r > 0 ? 'tier-green' : 'tier-red'}>{r > 0 ? '+' : '−'}{Math.abs(r).toFixed(1)} PP</span>;
}

export function PerformanceSummary({ state }: { state: AnalyticsState }) {
  const { channelFilter, range } = useTerminal();
  if (state.kind === 'none') {
    return (
      <section className="window" aria-labelledby="perf-h">
        <div className="window-head"><h2 id="perf-h" className="wh-title">PERFORMANCE</h2></div>
        <div className="window-body stat-sub">
          UNAVAILABLE — THIS SNAPSHOT HAS NO VARIANT-LEVEL SALES, COST OR INVENTORY RECORDS (SAMPLE DATA OR A SYNC FROM BEFORE 14 OCT). RUN THE SHOPIFY SYNC IN DOCS/DATA/SHOPIFY-SYNC.MD AND UPLOAD THE RESULT.
        </div>
      </section>
    );
  }
  if (state.kind === 'no-timezone') {
    return (
      <section className="window" aria-labelledby="perf-h">
        <div className="window-head"><h2 id="perf-h" className="wh-title">PERFORMANCE</h2></div>
        <div className="window-body stat-sub tier-amber">
          CONFIGURATION GAP — THE BUSINESS TIMEZONE COULD NOT BE READ FROM SHOPIFY, SO REPORTING DAYS CAN'T BE DEFINED. SET IT IN THE SYNC AND RE-UPLOAD.
        </div>
      </section>
    );
  }
  const v = state.view;
  const c = v.a.currency;
  const rev = M.netProductRevenue(v.cur, c);
  const revP = M.netProductRevenue(v.prior, c);
  const gp = M.grossProfit(v.cur, c);
  const gpP = M.grossProfit(v.prior, c);
  const gm = M.grossMargin(v.cur, c);
  const gmP = M.grossMargin(v.prior, c);
  const aov = M.aovAtPurchase(v.cur, c);
  const aovP = M.aovAtPurchase(v.prior, c);
  const upo = M.unitsPerOrder(v.cur);
  const share = channelFilter === 'ALL' || channelFilter === 'DTC' ? M.returningShare(v.a, v.cmp.current) : null;
  const costCov = M.costCoverage(v.cur);
  const unmapped = M.channelBreakdown(v.a, v.cmp.current).filter((x) => x.group === 'UNMAPPED');
  const unmappedRev = unmapped.reduce((s, x) => s + x.totals.netSales, 0);
  const zeroOrders = v.a.daily.filter((r) => inRange(r.date, v.cmp.current) && r.orders > 0 && r.grossSales === 0).length;

  const limits: string[] = [];
  if (v.cur.daysCovered < v.cur.daysTotal) limits.push(`SALES DATA COVERS ${v.cur.daysCovered} OF ${v.cur.daysTotal} DAYS — THE REST IS UNKNOWN`);
  if (costCov !== null && costCov < 1) limits.push(`COST RECORDED FOR ${Math.round(costCov * 100)}% OF REVENUE`);
  if (channelFilter === 'ALL' && unmappedRev !== 0) limits.push(`${formatMoney({ currency: c, minor: unmappedRev })} FROM UNMAPPED CHANNELS (${unmapped.map((x) => x.channel.toUpperCase()).join(', ')}) INCLUDED`);
  limits.push('WHOLESALE NOT CONNECTED');
  limits.push('DROP SELL-THROUGH UNAVAILABLE');

  return (
    <section className="window" aria-labelledby="perf-h">
      <div className="window-head flex-wrap">
        <h2 id="perf-h" className="wh-title">PERFORMANCE · LAST {range} COMPLETE DAYS</h2>
        <span className="wh-note flex-wrap"><ChannelFilterControl /><DefinitionsButton /></span>
      </div>
      <div className="window-body space-y-3">
        <p className="text-[0.82rem]">
          <strong className="font-display">{formatRange(v.cmp.current)}</strong>
          <span className="dim"> vs </span>
          <strong className="font-display">{formatRange(v.cmp.prior)}</strong>
          <span className="dim"> · {FILTER_LABEL[channelFilter]} · {v.a.timezone} · {c} · SHOPIFY, READ {new Date(v.a.extractedAt).toLocaleString()}</span>
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Data limitations">
          {limits.map((l) => <li key={l} className="badge badge-wrap tier-amber">{l}</li>)}
        </ul>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="NET PRODUCT REVENUE" metric={rev} sub={revP.value ? <>PRIOR {formatMoney(revP.value)} · <MoneyChange cur={v.cur.netSales} prior={v.prior.netSales} currency={c} /></> : undefined}>
              <div className="font-display text-5xl leading-tight">{formatMoney(rev.value)}</div>
            </Stat>
            <Stat label="GROSS PROFIT" metric={gp} sub={gpP.value && gp.value ? <>PRIOR {formatMoney(gpP.value)} · <MoneyChange cur={gp.value.minor} prior={gpP.value.minor} currency={c} /></> : undefined}>
              <div className="font-display text-4xl leading-tight">{formatMoney(gp.value)}</div>
            </Stat>
            <Stat label="GROSS MARGIN" metric={gm} sub={gmP.value !== null && gm.value !== null ? <>PRIOR {gmP.value.toFixed(1)}% · <PpChange pp={gm.value - gmP.value} /></> : undefined}>
              <div className="font-display text-4xl leading-tight">{gm.value === null ? '—' : `${gm.value.toFixed(1)}%`}</div>
            </Stat>
          </div>
          <TrendChart v={v} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--crt-mid)] pt-3 sm:grid-cols-3 xl:grid-cols-5">
          <div><dt className="stat-label">ORDERS PLACED</dt><dd className="font-display text-xl">{v.cur.orders} <span className="stat-sub">PRIOR {v.prior.orders}</span></dd></div>
          <div>
            <dt className="stat-label">AOV AT PURCHASE <AvailBadge status={aov.status} reason={aov.reason} /></dt>
            <dd className="font-display text-xl">{aov.value ? formatMoney(aov.value) : '—'} <span className="stat-sub">PRIOR {aovP.value ? formatMoney(aovP.value) : '—'}</span></dd>
            {zeroOrders > 0 && <dd className="stat-sub">INCL. {zeroOrders} DAY{zeroOrders === 1 ? '' : 'S'} WITH $0 GIFT ORDERS</dd>}
          </div>
          <div><dt className="stat-label">UNITS PER ORDER</dt><dd className="font-display text-xl">{upo.value === null ? '—' : upo.value.toFixed(2)}</dd></div>
          <div>
            <dt className="stat-label">RETURNS (REFUND VALUE)</dt>
            <dd className="font-display text-xl">{formatMoney({ currency: c, minor: -v.cur.returns })} <span className="stat-sub">PRIOR {formatMoney({ currency: c, minor: -v.prior.returns })}</span></dd>
            <dd className="stat-sub">RETURN RATE UNAVAILABLE — NO SALES-COHORT LINK</dd>
          </div>
          <div>
            <dt className="stat-label">RETURNING CUSTOMERS (DTC) {share && <AvailBadge status={share.status} reason={share.reason} />}</dt>
            {share === null ? <dd className="stat-sub">DTC METRIC — SWITCH TO ALL OR DTC</dd>
              : share.value ? <dd className="font-display text-xl">{Math.round(share.value.share * 100)}% <span className="stat-sub">{share.value.returning} OF {share.value.customers}</span></dd>
              : <dd className="stat-sub">{share.reason}</dd>}
          </div>
        </dl>
        <p className="stat-sub">
          FILTERS APPLY TO SALES, PROFIT AND BASKET FIGURES. STOCK AND WEEKS OF COVER ARE AS OF THE INVENTORY READ ({new Date(v.a.inventoryAsOf).toLocaleString()}) AND IGNORE BOTH FILTERS.
        </p>
      </div>
    </section>
  );
}
