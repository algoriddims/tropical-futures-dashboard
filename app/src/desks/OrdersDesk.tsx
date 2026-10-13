import { useTerminal } from '@/terminal/TerminalContext';

export default function OrdersDesk() {
  const { data, metrics, liveEvents, range, imported } = useTerminal();
  if (!data || !metrics) return null;

  const days = data.days.slice(-range);
  const maxRev = Math.max(...days.map((d) => d.revenue), 1);
  const asOf = data.meta?.coverageEnd ? new Date(data.meta.coverageEnd).toLocaleDateString() : null;

  return (
    <div className="flex h-full min-h-0 gap-2 p-2">
      {/* order tape */}
      <div className="panel flex min-h-0 flex-1 flex-col">
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
              <span className="phosphor font-display shrink-0">+${e.amount}</span>
            </div>
          ))}
          {data.orders.map((o) => (
            <div key={o.id} className="tape-row">
              <span className="dim shrink-0">{o.time}</span>
              <span className="dim shrink-0">{o.id}</span>
              <span className="warm flex-1 truncate">{o.label}</span>
              {o.returning && <span className="badge tier-green shrink-0">REGULAR</span>}
              <span className="text-[var(--vhs-white)] font-display shrink-0">${o.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* right rail */}
      <div className="flex w-[340px] shrink-0 flex-col gap-2 min-h-0">
        <div className="grid grid-cols-2 gap-2">
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">NET REVENUE</div>
            <div className="font-display text-3xl phosphor">${metrics.revenue.toLocaleString()}</div>
            {metrics.revenueDeltaPct !== null ? (
              <div className={`text-[0.72rem] ${metrics.revenueDeltaPct >= 0 ? 'tier-green' : 'tier-red'}`}>
                {metrics.revenueDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(metrics.revenueDeltaPct).toFixed(1)}% VS PREV
              </div>
            ) : (
              <div className="text-[0.72rem] dim">NO COMPARABLE PREV PERIOD</div>
            )}
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">ORDERS / AOV</div>
            <div className="font-display text-3xl text-[var(--vhs-white)]">{metrics.orders}</div>
            <div className="text-[0.72rem] dim">AOV ${metrics.aov.toFixed(0)}</div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">REGULARS</div>
            <div className="font-display text-3xl tier-green">{data.repeatRate !== undefined ? `${Math.round(data.repeatRate * 100)}%` : '—'}</div>
            <div className="text-[0.72rem] dim">{data.repeatRate !== undefined ? 'REPEAT RATE · AS REPORTED' : 'REPEAT RATE · NOT IN DATA'}</div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">REFUNDS</div>
            <div className="font-display text-3xl tier-amber">{data.refundRate !== undefined ? `${(data.refundRate * 100).toFixed(1)}%` : '—'}</div>
            <div className="text-[0.72rem] dim">{data.refundRate !== undefined ? 'REFUND RATE · AS REPORTED' : 'REFUND RATE · NOT IN DATA'}</div>
          </div>
        </div>

        <div className="panel min-h-0 flex-1">
          <div className="panel-head"><span>DAILY REVENUE</span><span className="dim">{range}D</span></div>
          <div className="flex h-[calc(100%-2.1rem)] items-end gap-[2px] p-3">
            {days.map((d, i) => (
              <div key={d.date} className="group relative flex-1" style={{ height: '100%' }}>
                <div
                  className={`absolute bottom-0 w-full ${i === days.length - 1 ? 'bg-[var(--phosphor)]' : 'bg-[var(--vhs-dim)] opacity-60'}`}
                  style={{ height: `${(d.revenue / maxRev) * 100}%` }}
                />
                <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap border border-[var(--crt-line)] bg-[var(--crt-black)] px-1.5 py-0.5 font-display text-xs warm group-hover:block">
                  {d.date} · ${d.revenue.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
