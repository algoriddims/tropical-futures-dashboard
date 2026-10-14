import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import type { DeskKey } from '@/terminal/desks';
import {
  channelStats, monthlyBurn, runwayMonths, buildMoves, trailing30dRevenue, daysUntil, burnSource,
  netCash, cardOwed, monthToDateSales,
} from '@/game/engine';
import { money, pct, plural } from '@/game/format';
import { InlineNumber } from '@/components/InlineEdit';
import { AccountLines } from '@/components/BankAccounts';

const DESK_NAMES: Partial<Record<DeskKey, string>> = {
  o: 'orders', a: 'ads', i: 'inventory', p: 'pipeline', l: 'shops', c: 'costs', n: 'alerts', g: 'goals', f: 'import feed',
};

/** Keycap that jumps to a desk — a real button with a spoken name. */
function Jump({ to }: { to: DeskKey }) {
  const { setDesk } = useTerminal();
  return (
    <button onClick={() => setDesk(to)} className="keycap tap" aria-label={`Open ${DESK_NAMES[to] ?? 'desk'} (${to.toUpperCase()})`} title={`OPEN ${(DESK_NAMES[to] ?? '').toUpperCase()}`}>
      {to.toUpperCase()}
    </button>
  );
}

function Window({ title, right, children, className = '' }: {
  title: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`window ${className}`} aria-label={title}>
      <div className="window-head">
        <h2 className="wh-title">{title}</h2>
        {right && <span className="wh-note">{right}</span>}
      </div>
      <div className="window-body">{children}</div>
    </section>
  );
}

function BigStat({ label, value, sub, tone = 'text-[var(--vhs-white)]', size = 'text-4xl' }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: string; size?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="stat-label">{label}</div>
      <div className={`font-display ${size} leading-tight ${tone} break-words`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Bar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-[var(--crt-mid)]">
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, p))}%`, background: color }} />
    </div>
  );
}

const RANGE_LABEL: Record<number, string> = { 1: 'TODAY', 7: 'LAST 7 DAYS', 30: 'LAST 30 DAYS' };

export default function StatusDesk() {
  const { data, metrics, notices, setDesk, updateData, imported, importedAt, delta, storedSnapshotErrors, range } = useTerminal();
  if (!data || !metrics) return null;

  const redNotices = notices.filter((n) => n.tier === 'red');
  const synced = !!data.accounts?.length;
  const cash = netCash(data);
  const owed = cardOwed(data);
  const burn = monthlyBurn(data);
  const runway = runwayMonths(data);
  const moves = buildMoves(data, metrics, trailing30dRevenue(data));
  const readyBuilds = data.pipeline.filter((p) => p.status === 'READY').length;
  const dropDays = data.nextDrop ? daysUntil(data.nextDrop.date) : null;
  const dropRetail = data.pipeline
    .filter((p) => p.status === 'READY')
    .reduce((s, p) => s + Math.round(p.qty * p.retail * p.expectedSellThrough), 0);

  // month-to-date sales vs the monthly goal
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const mtd = monthToDateSales(data, now);
  const goal = data.monthlySalesGoal ?? 0;
  const pace = mtd !== null ? (mtd / now.getDate()) * daysInMonth : null;
  const monthName = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();

  // last complete month of Meta billing seen on the bank/card (not attributed ad spend)
  const lastFull = [...(data.cashflow ?? [])].reverse().find((m) => !m.partial);
  const metaBilling = lastFull?.spend.ADS;
  const channelTotal = data.channels.reduce((s, c) => s + c.revenue, 0);
  const notes = data.meta?.notes ?? [];

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* a stored snapshot that failed validation is never rendered — say so */}
      {storedSnapshotErrors && (
        <div className="window" role="alert">
          <div className="window-head">
            <span className="wh-title tier-red">STORED SYNC COULD NOT BE LOADED — SHOWING SAMPLE DATA</span>
          </div>
          <div className="window-body text-[0.8rem] dim space-y-0.5">
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

      {/* where you stand: cash, sales vs goal, burn, what needs doing */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Window title="CASH ON HAND" right={synced ? 'BANK − CARD OWED' : 'MANUAL ENTRY'}>
          {synced ? (
            <>
              <BigStat
                label="NET OF CARD"
                value={money(cash, { cents: true })}
                tone={cash !== null && cash < 0 ? 'tier-red' : 'phosphor'}
                size="text-5xl"
                sub={owed ? `BANK ${money(data.bankBalance, { cents: true })} · CARD OWES ${money(owed, { cents: true })}` : `BANK ${money(data.bankBalance, { cents: true })}`}
              />
              <details className="mt-2">
                <summary className="stat-sub cursor-pointer">ACCOUNTS</summary>
                <div className="mt-1"><AccountLines accounts={data.accounts!} /></div>
              </details>
            </>
          ) : (
            <BigStat
              label="BANK BALANCE"
              size="text-5xl"
              value={
                <InlineNumber
                  className="font-display phosphor"
                  value={data.bankBalance}
                  format={(v) => (v === null ? 'SET' : money(v))}
                  title="SET BANK BALANCE"
                  onCommit={(v) => updateData((d) => ({ ...d, bankBalance: v }))}
                />
              }
              sub={data.bankBalance === null ? 'UNKNOWN — CLICK TO ENTER, OR SYNC THE BANK' : 'TYPED IN · SALES ≠ CASH RECEIVED'}
            />
          )}
        </Window>

        <Window title={`SALES IN ${monthName}`} right={<Jump to="o" />}>
          <BigStat
            label="SHOPIFY NET SALES, MONTH TO DATE"
            value={money(mtd)}
            size="text-5xl"
            sub={mtd === null ? 'NO DATED DAILY SALES IN THIS SYNC' : `ON PACE FOR ${money(pace)} · DAY ${now.getDate()} OF ${daysInMonth}`}
          />
          <div className="mt-2 flex items-center justify-between gap-2 stat-sub">
            <span>
              GOAL{' '}
              <InlineNumber
                className="warm"
                value={goal > 0 ? goal : null}
                format={(v) => (v === null ? 'SET A MONTHLY GOAL' : `${money(v)}/MO`)}
                title="SET MONTHLY SALES GOAL"
                onCommit={(v) => updateData((d) => ({ ...d, monthlySalesGoal: Math.max(0, v) }))}
              />
            </span>
            {goal > 0 && mtd !== null && <span className={mtd >= goal ? 'tier-green' : 'warm'}>{pct((mtd / goal) * 100)}</span>}
          </div>
          {goal > 0 && mtd !== null && (
            <div className="mt-1 relative">
              <Bar pct={(mtd / goal) * 100} color={mtd >= goal ? 'var(--palm)' : 'var(--sun)'} />
              {/* where today should be if sales were spread evenly */}
              <div className="absolute top-[-2px] h-[10px] w-px bg-[var(--vhs-white)]" style={{ left: `${(now.getDate() / daysInMonth) * 100}%` }} aria-hidden />
            </div>
          )}
        </Window>

        <Window title="BURN & RUNWAY" right={<Jump to="c" />}>
          <div className="grid grid-cols-2 gap-3">
            <BigStat
              label="MONTHLY BURN"
              value={burn > 0 ? money(burn) : '—'}
              tone={burn > 0 ? 'tier-red' : 'dim'}
              sub={burnSource(data) === 'ACTUAL_SPEND' ? 'ACTUAL SPEND · 3-MO AVG' : burnSource(data) === 'COST_LINES' ? 'YOUR COST LINES' : 'NO COSTS OR SPENDING DATA'}
            />
            <BigStat
              label="RUNWAY"
              value={runway === null ? '—' : cash !== null && cash < 0 ? 'SHORT' : runway === Infinity ? '∞' : `${runway.toFixed(1)} MO`}
              tone={runway === null ? 'dim' : runway < 6 ? 'tier-red' : runway < 12 ? 'tier-amber' : 'palm'}
              sub={runway === null ? 'CASH UNKNOWN' : cash !== null && cash < 0 ? `${money(cash)} NET OF CARD` : 'NET CASH ÷ BURN'}
            />
          </div>
        </Window>

        <Window title="NEEDS ATTENTION" right={<Jump to="n" />}>
          {redNotices.length === 0 ? (
            <div className="font-display text-sm tier-green">NOTHING RED RIGHT NOW.</div>
          ) : (
            <ul className="space-y-1">
              {redNotices.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <button onClick={() => setDesk(n.desk as DeskKey)} className="w-full text-left">
                    <span className="tier-red">▲ </span>
                    <span className="warm text-[0.82rem]">{n.text}</span>
                  </button>
                </li>
              ))}
              {redNotices.length > 4 && <li className="stat-sub">+{redNotices.length - 4} MORE IN ALERTS</li>}
            </ul>
          )}
        </Window>
      </div>

      {/* top moves */}
      <Window title="TOP MOVES" right="RANKED BY MONEY AT STAKE">
        {moves.length === 0 ? (
          <div className="font-display text-sm dim">NOTHING URGENT RIGHT NOW.</div>
        ) : (
          <div className="space-y-1.5">
            {moves.map((mv, i) => (
              <button
                key={mv.id}
                onClick={() => setDesk(mv.desk as DeskKey)}
                className="tape-row w-full text-left"
              >
                <span className={`tier-${mv.tier} shrink-0 font-display`}>{i + 1}.</span>
                <span className="flex-1 min-w-0">
                  <span className="warm block">{mv.text}</span>
                  <span className="stat-sub block">{mv.detail}</span>
                </span>
                <span className={`font-display text-sm shrink-0 ${mv.tier === 'red' ? 'tier-red' : mv.tier === 'amber' ? 'tier-amber' : 'palm'}`}>
                  {money(mv.impact)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Window>

      {/* drop countdown */}
      {data.nextDrop && dropDays !== null && dropDays >= 0 && (
        <button className="window w-full text-left" onClick={() => setDesk('g')}>
          <div className="window-body flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className={`font-display text-4xl leading-none ${dropDays <= 3 ? 'tier-red' : dropDays <= 10 ? 'tier-amber' : 'tropic-pink'}`}>
              {dropDays === 0 ? 'DROP DAY' : `D-${dropDays}`}
            </span>
            <span className="font-display text-xl warm">{data.nextDrop.name}</span>
            <span className="stat-sub">
              {readyBuilds > 0 ? `${plural(readyBuilds, 'RUN')} READY · ${money(dropRetail)} EXPECTED` : 'NO RUNS READY — CHECK THE PIPELINE'}
            </span>
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Window title="SHOPIFY SALES" right={<span className="flex items-center gap-2">{RANGE_LABEL[range] ?? `${range}D`} <Jump to="o" /></span>}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <BigStat label="NET REVENUE" value={money(metrics.revenue)} />
            <div className="text-right">
              <div className={`font-display text-xl ${metrics.revenueDeltaPct === null ? 'dim' : metrics.revenueDeltaPct >= 0 ? 'tier-green' : 'tier-red'}`}>
                {metrics.revenueDeltaPct === null ? '—' : `${metrics.revenueDeltaPct >= 0 ? '▲' : '▼'} ${pct(Math.abs(metrics.revenueDeltaPct))}`}
              </div>
              <div className="stat-sub">{metrics.revenueDeltaPct === null ? 'TOO FEW ORDERS TO COMPARE' : `VS PREVIOUS ${range === 1 ? 'DAY' : `${range} DAYS`}`}</div>
              <div className="stat-sub mt-1">{plural(metrics.orders, 'ORDER')} · AOV {metrics.orders ? money(metrics.aov) : '—'}</div>
            </div>
          </div>
        </Window>

        <Window title="INVENTORY" right={<Jump to="i" />}>
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="UNITS IN STOCK" value={metrics.inventoryUnits.toLocaleString('en-US')} size="text-3xl" />
            <BigStat label="SOLD, 12 MONTHS" value={pct(metrics.overallSellThrough * 100)} tone="palm" size="text-3xl" sub="OF STOCK + UNITS SOLD" />
            <BigStat
              label="VALUE AT COST"
              value={money(metrics.inventoryCost)}
              tone="dim"
              size="text-3xl"
              sub={metrics.inventoryUnitsWithoutCost > 0 ? `EXCL. ${plural(metrics.inventoryUnitsWithoutCost, 'UNIT')} WITHOUT COST` : undefined}
            />
            <BigStat label="VALUE AT RETAIL" value={money(metrics.inventoryRetail)} tone="water" size="text-3xl" />
          </div>
        </Window>

        <Window title="TRAFFIC" right={RANGE_LABEL[range] ?? `${range}D`}>
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="SESSIONS" size="text-3xl" value={metrics.guests !== null ? metrics.guests.toLocaleString('en-US') : '—'} sub={metrics.guests === null ? 'NOT IN DATA FOR THIS PERIOD' : 'MEASURED'} />
            <BigStat label="CONVERSION" size="text-3xl" value={metrics.conversionRate !== null ? pct(metrics.conversionRate, 1) : '—'} tone="tropic-pink" sub={metrics.conversionRate === null ? 'NEEDS SESSIONS' : undefined} />
            <BigStat label="RETURNING CUSTOMERS" size="text-3xl" value={data.repeatRate !== undefined ? pct(data.repeatRate * 100) : '—'} tone="palm" sub={data.repeatRate === undefined ? 'NOT IN DATA' : 'AS REPORTED, 90 DAYS'} />
            <BigStat label="REFUND RATE" size="text-3xl" value={data.refundRate !== undefined ? pct(data.refundRate * 100, 1) : '—'} tone={data.refundRate !== undefined && data.refundRate > 0.05 ? 'tier-red' : 'dim'} sub={data.refundRate === undefined ? 'NOT IN DATA' : 'AS REPORTED'} />
          </div>
        </Window>

        <Window title="STORE LOCATIONS" right={<Jump to="l" />}>
          <div className="space-y-2">
            {data.channels.map((c) => {
              const st = channelStats(c, data.products);
              const period = c.revenueDays ? `${c.revenueDays}D` : 'PERIOD UNKNOWN';
              return (
                <div key={c.name}>
                  <div className="flex flex-wrap justify-between gap-x-3 text-[0.8rem]">
                    <span className="warm">{c.name} <span className="dim">· {c.location}</span></span>
                    <span className="font-display">
                      <span className="phosphor">{money(c.revenue)}</span> <span className="dim">SALES {period}</span>
                    </span>
                  </div>
                  <div className="stat-sub">
                    {st.onHand.toLocaleString('en-US')} IN STOCK · {c.type === 'ONLINE' ? `${pct(st.sellThrough * 100)} SOLD OVER 12 MONTHS (ALL CHANNELS)` : `${pct(st.sellThrough * 100)} OF ALLOCATED SOLD`}
                  </div>
                  {data.channels.length > 1 && channelTotal > 0 && <Bar pct={(c.revenue / channelTotal) * 100} color="var(--water)" />}
                </div>
              );
            })}
            {data.channels.every((c) => c.type === 'ONLINE') && (
              <div className="stat-sub">NO STOCKIST OR CONSIGNMENT RECORDS YET.</div>
            )}
          </div>
        </Window>

        <Window title="ADS" right={<Jump to="a" />}>
          {metrics.spend === null && data.campaigns.length === 0 ? (
            <div className="space-y-1">
              <div className="font-display text-sm dim">META ADS NOT CONNECTED — NO SPEND OR ROAS SHOWN.</div>
              {metaBilling !== undefined && lastFull && (
                <div className="stat-sub">
                  BANK/CARD SHOWS {money(metaBilling)} OF META BILLING IN {new Date(`${lastFull.month}-15`).toLocaleString('en-US', { month: 'short' }).toUpperCase()}.
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2">
              <BigStat label="AD SPEND" value={money(metrics.spend)} tone={metrics.spend !== null ? 'tier-red' : 'dim'} />
              <div className="text-right">
                <div className={`font-display text-xl ${metrics.roas === null ? 'dim' : metrics.roas >= data.targetRoas ? 'phosphor' : 'tier-amber'}`}>
                  {metrics.roas !== null ? metrics.roas.toFixed(2) : '—'} ROAS
                </div>
                <div className="stat-sub">MER {metrics.mer !== null ? metrics.mer.toFixed(2) : '—'} · BREAK-EVEN {metrics.breakEvenRoas.toFixed(2)}</div>
              </div>
            </div>
          )}
        </Window>

        <Window title="PRODUCTION" right={<Jump to="p" />}>
          {data.pipeline.length === 0 ? (
            <div className="font-display text-sm dim">NO PRODUCTION RUNS RECORDED.</div>
          ) : (
            <>
              <div className="flex items-end justify-between">
                <BigStat label="RUNS IN PROGRESS" value={String(data.pipeline.length)} tone="water" size="text-3xl" />
                {readyBuilds > 0 && <span className="badge tier-green">{readyBuilds} READY TO LAUNCH</span>}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <BigStat label="COST" value={money(metrics.pipelineCost)} tone="tier-red" size="text-xl" />
                <BigStat label="GROSS" value={money(metrics.pipelineGross)} tone="warm" size="text-xl" />
                <BigStat label="NET" value={money(metrics.pipelineNet, { signed: true })} tone="phosphor" size="text-xl" />
              </div>
            </>
          )}
        </Window>

        {data.quests.length > 0 && (
          <Window title="GOALS" right={<Jump to="g" />}>
            <div className="space-y-2">
              {data.quests.map((q) => {
                const p = Math.min(100, (q.current / q.target) * 100);
                const done = q.current >= q.target;
                return (
                  <div key={q.id}>
                    <div className="flex justify-between gap-2 font-display text-sm">
                      <span className={done ? 'tier-green' : 'warm'}>{q.goal}</span>
                      <span className="dim shrink-0">{done ? '✓ DONE' : `${Math.round(p)}% · ${q.daysLeft}D`}</span>
                    </div>
                    <Bar pct={p} color={done ? 'var(--palm)' : 'var(--sun)'} />
                  </div>
                );
              })}
            </div>
          </Window>
        )}
      </div>

      {/* sync briefing — one line; details live in the import feed */}
      {imported && (
        <button className="window w-full text-left" onClick={() => setDesk('f')}>
          <div className="window-body flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8rem]">
            <span className="wh-title">LAST SYNC</span>
            <span className="dim">
              IMPORTED {importedAt ? new Date(importedAt).toLocaleString() : 'UNKNOWN'}
              {' · '}COVERS {data.meta?.coverageStart ? `${new Date(data.meta.coverageStart).toLocaleDateString()} → ` : ''}
              {data.meta?.coverageEnd ? new Date(data.meta.coverageEnd).toLocaleString() : 'UNKNOWN PERIOD'}
            </span>
            {delta ? (
              <span className="font-display">
                <span className="phosphor">{money(delta.revenue, { signed: true })} REVENUE</span>
                <span className="water"> · +{plural(delta.orders, 'ORDER')}</span>
                {delta.spend !== null && <span className="tier-red"> · {money(-delta.spend)} AD SPEND</span>}
                {delta.events.length > 0 && <span className="tier-amber"> · {plural(delta.events.length, 'CHANGE')}</span>}
              </span>
            ) : (
              <span className="dim">FIRST SYNC — CHANGES SHOW FROM THE NEXT ONE</span>
            )}
            {notes.length > 0 && (
              <span className="dim ml-auto">
                {plural(notes.length, 'DATA NOTE')} FROM THIS SYNC — IN THE IMPORT FEED <span className="keycap">F</span>
              </span>
            )}
          </div>
        </button>
      )}
    </div>
  );
}
