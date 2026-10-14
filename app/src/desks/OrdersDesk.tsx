import { useTerminal } from '@/terminal/useTerminal';
import { money, pct, plural } from '@/game/format';

export default function OrdersDesk() {
  const { data, metrics, liveEvents, range, imported } = useTerminal();
  if (!data || !metrics) return null;

  const days = data.days.slice(-range);
  const maxRev = Math.max(...days.map((d) => d.revenue), 1);
  const asOf = data.meta?.coverageEnd ? new Date(data.meta.coverageEnd).toLocaleDateString() : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2 lg:flex-row lg:overflow-hidden">
      {/* order tape */}
      <div className="panel flex min-h-[320px] flex-1 flex-col lg:min-h-0">
        <div className="panel-head">
          <span>ORDER TAPE · {imported ? `SNAPSHOT${asOf ? ` TO ${asOf}` : ' · PERIOD UNKNOWN'}` : 'SAMPLE'}</span>
          {!imported && <span className="tier-amber">SIMULATED</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {liveEvents.map((e) => (
            <div key={e.id} className="tape-row" style={{ background: 'var(--sim-row)' }}>
              <span className="font-display tier-amber shrink-0">SIM</span>
              <span className="dim shrink-0">DEMO</span>
              <span className="warm flex-1 truncate">{e.text}</span>
              <span className="phosphor font-display shrink-0">{money(e.amount, { signed: true })}</span>
            </div>
          ))}
          {data.orders.map((o) => (
            <div key={o.id} className="tape-row">
              <span className="dim shrink-0">{o.time}</span>
              <span className="dim shrink-0">{o.id}</span>
              <span className="warm flex-1 truncate">{o.label}</span>
              {o.returning && <span className="badge tier-green shrink-0">REGULAR</span>}
              <span className="text-[var(--vhs-white)] font-display shrink-0">{money(o.value, { cents: o.value % 1 !== 0 })}</span>
            </div>
          ))}
        </div>
      </div>

      {/* right rail */}
      <div className="flex w-full shrink-0 flex-col gap-2 lg:min-h-0 lg:w-[340px]">
        <div className="grid grid-cols-2 gap-2">
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">NET REVENUE</div>
            <div className="font-display text-3xl phosphor">{money(metrics.revenue)}</div>
            {metrics.revenueDeltaPct !== null ? (
              <div className={`stat-sub ${metrics.revenueDeltaPct >= 0 ? 'tier-green' : 'tier-red'}`}>
                {metrics.revenueDeltaPct >= 0 ? '▲' : '▼'} {pct(Math.abs(metrics.revenueDeltaPct))} VS PREVIOUS {range}D
              </div>
            ) : (
              <div className="stat-sub">TOO FEW ORDERS TO COMPARE</div>
            )}
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">ORDERS / AOV</div>
            <div className="font-display text-3xl text-[var(--vhs-white)]">{metrics.orders}</div>
            <div className="stat-sub">AOV {metrics.orders ? money(metrics.aov) : '—'} · {plural(metrics.orders, 'ORDER')}</div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">RETURNING</div>
            <div className="font-display text-3xl tier-green">{data.repeatRate !== undefined ? pct(data.repeatRate * 100) : '—'}</div>
            <div className="stat-sub">{data.repeatRate !== undefined ? 'CUSTOMERS · 90D · AS REPORTED' : 'NOT IN DATA'}</div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">REFUNDS</div>
            <div className={`font-display text-3xl ${data.refundRate !== undefined ? 'tier-amber' : 'dim'}`}>{data.refundRate !== undefined ? pct(data.refundRate * 100, 1) : '—'}</div>
            <div className="stat-sub">{data.refundRate !== undefined ? 'REFUND RATE · AS REPORTED' : 'NOT IN DATA'}</div>
          </div>
        </div>

        <div className="panel flex min-h-[200px] flex-1 flex-col lg:min-h-0">
          <div className="panel-head"><span>DAILY REVENUE</span><span className="dim">{range}D · PEAK {money(maxRev)}</span></div>
          <div className="flex min-h-0 flex-1 items-end gap-[2px] px-3 pt-3" role="img" aria-label={`Daily revenue, last ${range} days, peak ${money(maxRev)}`}>
            {days.map((d, i) => (
              <div key={d.date} className="group relative flex-1" style={{ height: '100%' }}>
                <div
                  className={`absolute bottom-0 w-full ${i === days.length - 1 ? 'bg-[var(--phosphor)]' : 'bg-[var(--vhs-dim)] opacity-60'}`}
                  style={{ height: `${(d.revenue / maxRev) * 100}%` }}
                />
                <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap border border-[var(--crt-line)] bg-[var(--crt-black)] px-1.5 py-0.5 font-display text-xs warm group-hover:block">
                  {d.date} · {money(d.revenue, { cents: d.revenue % 1 !== 0 })}
                </div>
              </div>
            ))}
          </div>
          {days.length > 0 && (
            <div className="flex justify-between px-3 pb-2 pt-1 stat-sub">
              <span>{days[0].date}</span>
              {days.length > 2 && <span>{days[Math.floor(days.length / 2)].date}</span>}
              <span>{days[days.length - 1].date}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
