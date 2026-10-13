import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/TerminalContext';
import type { DeskKey } from '@/terminal/TerminalContext';
import { channelStats, monthlyBurn, oneOffCosts, runwayMonths, buildMoves, trailing30dRevenue, daysUntil } from '@/game/engine';
import { InlineNumber } from '@/components/InlineEdit';

function Window({ title, right, children, className = '', onClick }: {
  title: string; right?: ReactNode; children: ReactNode; className?: string; onClick?: () => void;
}) {
  return (
    <div className={`window ${onClick ? 'cursor-pointer hover:brightness-125 transition' : ''} ${className}`} onClick={onClick}>
      <div className="window-head">
        <span className="wh-title">{title}</span>
        {right && <span className="dim text-sm">{right}</span>}
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}

function BigStat({ label, value, sub, tone = 'text-[var(--vhs-white)]' }: {
  label: string; value: string; sub?: ReactNode; tone?: string;
}) {
  return (
    <div>
      <div className="font-display text-sm dim tracking-wider">{label}</div>
      <div className={`font-display text-4xl leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[0.72rem] dim mt-0.5">{sub}</div>}
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-[var(--crt-mid)]">
      <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export default function StatusDesk() {
  const { data, metrics, notices, setDesk, updateData, imported, importedAt, delta, storedSnapshotErrors } = useTerminal();
  if (!data || !metrics) return null;

  const redNotices = notices.filter((n) => n.tier !== 'green').slice(0, 3);
  const channelTotal = data.channels.reduce((s, c) => s + c.revenue, 0);
  const readyBuilds = data.pipeline.filter((p) => p.status === 'READY').length;
  const burn = monthlyBurn(data);
  const oneOffs = oneOffCosts(data);
  const runway = runwayMonths(data);
  const moves = buildMoves(data, metrics, trailing30dRevenue(data));
  const dropDays = data.nextDrop ? daysUntil(data.nextDrop.date) : null;
  const dropRetail = data.pipeline
    .filter((p) => p.status === 'READY')
    .reduce((s, p) => s + Math.round(p.qty * p.retail * p.expectedSellThrough), 0);

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* a stored snapshot that failed validation is never rendered — say so */}
      {storedSnapshotErrors && (
        <div className="window">
          <div className="window-head">
            <span className="wh-title tier-red">STORED SYNC COULD NOT BE LOADED — SHOWING SAMPLE DATA</span>
          </div>
          <div className="window-body text-[0.74rem] dim space-y-0.5">
            {storedSnapshotErrors.map((e, i) => <div key={i}>▲ {e}</div>)}
            <div className="warm">IT IS STILL IN THIS BROWSER: OPEN IMPORT → EXPORT BACKUP TO RECOVER IT, OR IMPORT A FRESH SYNC.</div>
          </div>
        </div>
      )}

      {!imported && !storedSnapshotErrors && (
        <div className="window">
          <div className="window-body font-display text-sm tier-amber">
            SAMPLE DATA — INVENTED NUMBERS FOR LAYOUT ONLY, NOT TROPICAL FUTURES RESULTS. IMPORT A SYNC TO SEE REAL DATA.
          </div>
        </div>
      )}

      {/* sync briefing */}
      {imported && (
        <div className="window">
          <div className="window-head">
            <span className="wh-title">SINCE LAST SYNC</span>
            <span className="dim text-sm">
              IMPORTED {importedAt ? new Date(importedAt).toLocaleString() : 'UNKNOWN'}
              {' · '}COVERS {data.meta?.coverageStart ? `${new Date(data.meta.coverageStart).toLocaleDateString()} → ` : ''}
              {data.meta?.coverageEnd ? new Date(data.meta.coverageEnd).toLocaleString() : 'UNKNOWN PERIOD'}
            </span>
          </div>
          <div className="window-body">
            {delta ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-display text-sm">
                <span className="phosphor">+${Math.round(delta.revenue).toLocaleString()} REVENUE</span>
                <span className="water">+{delta.orders} ORDERS</span>
                <span className="tier-red">-${Math.round(delta.spend).toLocaleString()} AD SPEND</span>
                {delta.events.map((e, i) => (
                  <span key={i} className="badge tier-amber">{e}</span>
                ))}
              </div>
            ) : (
              <div className="font-display text-sm dim">FIRST SYNC — BASELINE SET. DELTAS APPEAR ON THE NEXT IMPORT.</div>
            )}
          </div>
        </div>
      )}

      {/* drop countdown */}
      {data.nextDrop && dropDays !== null && dropDays >= 0 && (
        <div
          className="window cursor-pointer hover:brightness-125 transition"
          onClick={() => setDesk('g')}
        >
          <div className="window-body flex items-center gap-5">
            <span className={`font-display text-4xl leading-none ${dropDays <= 3 ? 'tier-red crt-flicker' : dropDays <= 10 ? 'tier-amber' : 'tropic-pink'}`}>
              {dropDays === 0 ? 'DROP DAY' : `D-${dropDays}`}
            </span>
            <span className="font-display text-xl warm">{data.nextDrop.name}</span>
            <span className="dim text-[0.74rem]">
              {readyBuilds > 0 ? `${readyBuilds} RUN${readyBuilds > 1 ? 'S' : ''} READY · $${dropRetail.toLocaleString()} EXPECTED` : 'NO RUNS READY — CHECK THE PIPELINE'}
            </span>
            <span className="keycap ml-auto">G</span>
          </div>
        </div>
      )}

      {/* headline strip */}
      <div className="grid grid-cols-3 gap-2">
        <Window title="BANK BALANCE" right="BANK ACCOUNT · CLICK TO SET">
          <div className="flex items-end justify-between">
            <div>
              <InlineNumber
                className="font-display text-6xl phosphor crt-flicker leading-none"
                value={data.bankBalance}
                format={(v) => `$${v.toLocaleString()}`}
                title="SET BANK BALANCE"
                onCommit={(v) => updateData((d) => ({ ...d, bankBalance: v }))}
              />
            </div>
            <div className="text-right text-[0.72rem] dim">
              <div>MANUAL ENTRY</div>
              <div>SALES ≠ CASH RECEIVED</div>
            </div>
          </div>
        </Window>

        <Window title="SHOPIFY SALES" right={<button onClick={(e) => { e.stopPropagation(); setDesk('o'); }} className="keycap">O</button>}>
          <div className="flex items-end justify-between">
            <BigStat
              label="NET REVENUE"
              value={`$${metrics.revenue.toLocaleString()}`}
              tone="text-[var(--vhs-white)]"
            />
            <div className="text-right">
              {metrics.revenueDeltaPct !== null ? (
                <div className={`font-display text-xl ${metrics.revenueDeltaPct >= 0 ? 'tier-green' : 'tier-red'}`}>
                  {metrics.revenueDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(metrics.revenueDeltaPct).toFixed(1)}%
                </div>
              ) : (
                <div className="font-display text-xl dim">—</div>
              )}
              <div className="text-[0.72rem] dim">VS PREV PERIOD</div>
              <div className="text-[0.72rem] dim mt-1">{metrics.orders} ORDERS · AOV ${metrics.aov.toFixed(0)}</div>
            </div>
          </div>
        </Window>

        <Window title="ADS" right={<button onClick={(e) => { e.stopPropagation(); setDesk('a'); }} className="keycap">A</button>}>
          <div className="flex items-end justify-between">
            <BigStat label="META SPEND" value={`$${metrics.spend.toLocaleString()}`} tone="tier-red" />
            <div className="text-right">
              <div className={`font-display text-xl ${metrics.roas >= data.targetRoas ? 'phosphor' : 'tier-amber'}`}>
                {metrics.roas.toFixed(2)} ROAS
              </div>
              <div className="text-[0.72rem] dim">MER {metrics.mer.toFixed(2)} · BE {metrics.breakEvenRoas.toFixed(2)}</div>
            </div>
          </div>
        </Window>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* inventory */}
        <Window title="INVENTORY" right={<button onClick={(e) => { e.stopPropagation(); setDesk('i'); }} className="keycap">I</button>}>
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="UNITS IN STOCK" value={metrics.inventoryUnits.toLocaleString()} />
            <BigStat label="SELL-THROUGH" value={`${Math.round(metrics.overallSellThrough * 100)}%`} tone="palm" />
            <BigStat label="VALUE @ COST" value={`$${metrics.inventoryCost.toLocaleString()}`} tone="dim" />
            <BigStat label="VALUE @ RETAIL" value={`$${metrics.inventoryRetail.toLocaleString()}`} tone="water" />
          </div>
          <div className="mt-2">
            <Bar pct={metrics.overallSellThrough * 100} color="var(--palm)" />
          </div>
        </Window>

        {/* guests */}
        <Window title="TRAFFIC">
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="SESSIONS" value={metrics.guests !== null ? metrics.guests.toLocaleString() : '—'} sub={metrics.guests === null ? 'NOT IN DATA FOR THIS PERIOD' : 'MEASURED'} />
            <BigStat label="CONVERSION" value={metrics.conversionRate !== null ? `${metrics.conversionRate.toFixed(1)}%` : '—'} tone="tropic-pink" sub={metrics.conversionRate === null ? 'NEEDS SESSIONS' : undefined} />
            <BigStat label="REGULARS" value={data.repeatRate !== undefined ? `${Math.round(data.repeatRate * 100)}%` : '—'} tone="palm" sub={data.repeatRate === undefined ? 'NOT IN DATA' : 'AS REPORTED'} />
            <BigStat label="REFUND RATE" value={data.refundRate !== undefined ? `${(data.refundRate * 100).toFixed(1)}%` : '—'} tone={data.refundRate !== undefined && data.refundRate > 0.05 ? 'tier-red' : 'dim'} sub={data.refundRate === undefined ? 'NOT IN DATA' : 'AS REPORTED'} />
          </div>
        </Window>

        {/* top moves */}
        <Window title="TOP MOVES" right={`SCORE ${metrics.rating} · ${metrics.ratingBand}`}>
          {moves.length === 0 ? (
            <div className="font-display text-sm dim">NOTHING URGENT RIGHT NOW.</div>
          ) : (
            <div className="space-y-1.5">
              {moves.map((mv, i) => (
                <button
                  key={mv.id}
                  onClick={() => setDesk(mv.desk as DeskKey)}
                  className="tape-row w-full text-left hover:brightness-125 transition"
                >
                  <span className={`tier-${mv.tier} shrink-0 font-display`}>{i + 1}.</span>
                  <span className="flex-1 min-w-0">
                    <span className="warm block truncate">{mv.text}</span>
                    <span className="dim text-[0.68rem] block truncate">{mv.detail}</span>
                  </span>
                  <span className={`font-display text-sm shrink-0 ${mv.tier === 'red' ? 'tier-red' : mv.tier === 'amber' ? 'tier-amber' : 'palm'}`}>
                    ${Math.round(mv.impact).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Window>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* pipeline */}
        <Window
          title="PRODUCTION PIPELINE"
          right={<button onClick={(e) => { e.stopPropagation(); setDesk('p'); }} className="keycap">P</button>}
          onClick={() => setDesk('p')}
        >
          <div className="flex items-end justify-between">
            <BigStat label="RUNS IN PROGRESS" value={String(data.pipeline.length)} tone="water" />
            {readyBuilds > 0 && <span className="badge tier-green">{readyBuilds} READY TO LAUNCH</span>}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="font-display text-lg dim">COST</div>
              <div className="font-display text-xl tier-red">${metrics.pipelineCost.toLocaleString()}</div>
            </div>
            <div>
              <div className="font-display text-lg dim">GROSS POTENTIAL</div>
              <div className="font-display text-xl warm">${metrics.pipelineGross.toLocaleString()}</div>
            </div>
            <div>
              <div className="font-display text-lg dim">NET POTENTIAL</div>
              <div className="font-display text-xl phosphor">+${metrics.pipelineNet.toLocaleString()}</div>
            </div>
          </div>
        </Window>

        {/* locations */}
        <Window title="STORE LOCATIONS" right={<button onClick={(e) => { e.stopPropagation(); setDesk('l'); }} className="keycap">L</button>} onClick={() => setDesk('l')}>
          <div className="space-y-1.5">
            {data.channels.map((c) => {
              const st = channelStats(c, data.products);
              return (
                <div key={c.name}>
                  <div className="flex justify-between text-[0.74rem]">
                    <span className="warm">{c.name} <span className="dim">· {c.location}</span></span>
                    <span className="font-display text-base">
                      <span className="phosphor">${c.revenue.toLocaleString()}</span>
                      <span className="dim"> · </span>
                      <span className="water">{st.onHand}u</span>
                      <span className="dim"> · </span>
                      <span className={st.sellThrough > 0.7 ? 'palm' : 'dim'}>{Math.round(st.sellThrough * 100)}%</span>
                    </span>
                  </div>
                  <Bar pct={(c.revenue / channelTotal) * 100} color="var(--water)" />
                </div>
              );
            })}
          </div>
        </Window>

        {/* scenarios */}
        <Window title="GOALS">
          <div className="space-y-2">
            {data.quests.map((q) => {
              const pct = Math.min(100, (q.current / q.target) * 100);
              const done = q.current >= q.target;
              return (
                <div key={q.id}>
                  <div className="flex justify-between font-display text-sm">
                    <span className={done ? 'tier-green' : 'warm'}>{q.goal}</span>
                    <span className="dim">{done ? '✓ DONE' : `${Math.round(pct)}% · ${q.daysLeft}D`}</span>
                  </div>
                  <Bar pct={pct} color={done ? 'var(--palm)' : 'var(--sun)'} />
                </div>
              );
            })}
          </div>
        </Window>
      </div>

      {/* finances strip */}
      <Window
        title="FINANCES · BURN &amp; RUNWAY"
        right={<button onClick={(e) => { e.stopPropagation(); setDesk('c'); }} className="keycap">C</button>}
        onClick={() => setDesk('c')}
      >
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="font-display text-sm dim">MONTHLY BURN</div>
            <div className="font-display text-2xl tier-red">${Math.round(burn).toLocaleString()}</div>
            <div className="text-[0.68rem] dim">SUBS + PAYROLL + OPS</div>
          </div>
          <div>
            <div className="font-display text-sm dim">ONE-OFF PRODUCTION</div>
            <div className="font-display text-2xl sun">${oneOffs.toLocaleString()}</div>
            <div className="text-[0.68rem] dim">CURRENT RUNS</div>
          </div>
          <div>
            <div className="font-display text-sm dim">RUNWAY</div>
            <div className={`font-display text-2xl ${runway < 6 ? 'tier-red' : runway < 12 ? 'tier-amber' : 'palm'}`}>
              {runway === Infinity ? '∞' : `${runway.toFixed(1)} MO`}
            </div>
            <div className="text-[0.68rem] dim">BANK ÷ BURN</div>
          </div>
          <div>
            <div className="font-display text-sm dim">COST LINES</div>
            <div className="font-display text-2xl warm">{data.costs.filter((c) => c.active).length}</div>
            <div className="text-[0.68rem] dim">{data.costs.filter((c) => !c.active).length} PAUSED</div>
          </div>
        </div>
      </Window>

      {/* alerts strip */}
      {redNotices.length > 0 && (
        <Window title="NEEDS ATTENTION" right={<button onClick={(e) => { e.stopPropagation(); setDesk('n'); }} className="keycap">N</button>}>
          <div>
            {redNotices.map((n) => (
              <div key={n.id} className="tape-row">
                <span className={`tier-${n.tier} shrink-0`}>{n.tier === 'red' ? '▲' : '◆'}</span>
                <span className="warm flex-1 truncate">{n.text}</span>
                <span className="dim text-[0.7rem] truncate">{n.detail}</span>
              </div>
            ))}
          </div>
        </Window>
      )}
    </div>
  );
}
