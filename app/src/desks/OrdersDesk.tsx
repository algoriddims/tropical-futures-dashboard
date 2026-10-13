import { useTerminal } from '@/terminal/TerminalContext';

export default function OrdersDesk() {
  const { data, metrics, liveEvents, range } = useTerminal();
  if (!data || !metrics) return null;

  const days = data.days.slice(-range);
  const maxRev = Math.max(...days.map((d) => d.revenue), 1);
  const refunds = Math.round(metrics.orders * data.refundRate);

  return (
    <div className="flex h-full min-h-0 gap-2 p-2">
      {/* order tape */}
      <div className="panel flex min-h-0 flex-1 flex-col">
        <div className="panel-head">
          <span>ORDER TAPE · TODAY</span>
          <span className="phosphor caret">LIVE</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {liveEvents.map((e) => (
            <div key={e.id} className="tape-row" style={{ background: 'rgba(0,244,142,0.06)' }}>
              <span className="font-display tier-green shrink-0">NEW</span>
              <span className="dim shrink-0">NOW</span>
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
            <div className={`text-[0.72rem] ${metrics.revenueDeltaPct >= 0 ? 'tier-green' : 'tier-red'}`}>
              {metrics.revenueDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(metrics.revenueDeltaPct).toFixed(1)}% VS PREV
            </div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">ORDERS / AOV</div>
            <div className="font-display text-3xl text-[var(--vhs-white)]">{metrics.orders}</div>
            <div className="text-[0.72rem] dim">AOV ${metrics.aov.toFixed(0)}</div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">REGULARS</div>
            <div className="font-display text-3xl tier-green">{Math.round(data.repeatRate * 100)}%</div>
            <div className="text-[0.72rem] dim">REPEAT CUSTOMER RATE</div>
          </div>
          <div className="panel p-2.5">
            <div className="font-display text-sm dim">REFUNDS</div>
            <div className="font-display text-3xl tier-amber">{refunds}</div>
            <div className="text-[0.72rem] dim">{(data.refundRate * 100).toFixed(1)}% OF ORDERS</div>
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
