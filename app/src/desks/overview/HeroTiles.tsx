// Tier 1 of the overview: four numbers, each with one small visual.
// Money in this month vs the goal · cash on hand after production still owed ·
// Shopify sales over the period · the next production arrival.
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { goalPace, monthMoney } from '@/game/moneyIn';
import { cashPosition, dailySales, nextArrival } from '@/game/overview';
import { monthToDateSales, trailing30dRevenue } from '@/game/engine';
import { todayIn } from '@/analytics/period';
import { formatMoney } from '@/analytics/money';
import { money, plural } from '@/game/format';
import { InlineNumber } from '@/components/InlineEdit';
import type { AnalyticsState } from '../analytics/useAnalytics';

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();

function Tile({ label, children, sub, onOpen, openLabel }: { label: ReactNode; children: ReactNode; sub?: ReactNode; onOpen?: () => void; openLabel?: string }) {
  return (
    <section className="window min-w-0" aria-label={typeof label === 'string' ? label : undefined}>
      <div className="window-body flex h-full flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="stat-label">{label}</h2>
          {onOpen && <button className="tap stat-sub underline" onClick={onOpen}>{openLabel ?? 'OPEN'} →</button>}
        </div>
        {children}
        {sub && <div className="stat-sub mt-auto">{sub}</div>}
      </div>
    </section>
  );
}

/** A thin progress track; `pct` 0..100, optional hatched extension and a "today" tick. */
function Track({ pct, extra = 0, tick, label, tone = 'var(--phase-1)' }: { pct: number; extra?: number; tick?: number; label: string; tone?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const e = Math.max(0, Math.min(100 - p, extra));
  return (
    <svg viewBox="0 0 260 22" width="100%" height="22" role="img" aria-label={label} preserveAspectRatio="none">
      <defs>
        <pattern id="tile-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={tone} opacity="0.16" />
          <line x1="0" y1="0" x2="0" y2="6" stroke={tone} strokeWidth="2" />
        </pattern>
      </defs>
      <rect x="0" y="7" width="260" height="8" rx="4" fill="var(--crt-mid)" />
      {e > 0 && <rect x={(p / 100) * 260} y="7" width={(e / 100) * 260} height="8" rx="4" fill="url(#tile-hatch)" />}
      {p > 0 && <rect x="0" y="7" width={Math.max(4, (p / 100) * 260)} height="8" rx="4" fill={tone} />}
      {tick !== undefined && <line x1={(tick / 100) * 260} x2={(tick / 100) * 260} y1="2" y2="20" stroke="var(--vhs-white)" strokeWidth="1.5" />}
    </svg>
  );
}

export function HeroTiles({ an }: { an: AnalyticsState }) {
  const { data, updateData, setDesk } = useTerminal();
  if (!data) return null;
  const tz = an.kind === 'ok' ? an.view.a.timezone ?? 'America/New_York' : 'America/New_York';
  const today = todayIn(tz);
  const goal = data.monthlySalesGoal ?? 0;
  const synced = !!data.accounts?.length && !!data.cashflow?.length;
  const setGoal = (v: number) => updateData((d) => ({ ...d, monthlySalesGoal: Math.max(0, Math.round(v)) }));
  const goalEditor = (
    <InlineNumber className="warm" value={goal > 0 ? goal : null}
      format={(v) => (v === null ? 'SET A MONTHLY GOAL' : `${money(v)} GOAL`)}
      title="SET THE MONTHLY GOAL, ALL CHANNELS (0 TO CLEAR)" onCommit={setGoal} />
  );

  // ── 1. money in this month ──
  let moneyTile: ReactNode;
  if (synced) {
    const asOf = data.accounts!.map((x) => x.asOf).sort()[0];
    const through = todayIn(tz, new Date(asOf));
    const m = monthMoney(data, through.slice(0, 7));
    const pace = m && goal > 0 ? goalPace(m.counted, goal, through) : null;
    const counted = m?.counted ?? 0;
    moneyTile = (
      <Tile label={`MONEY IN · ${monthName(through.slice(0, 7))}`} onOpen={() => setDesk('c')} openLabel="MONEY"
        sub={<>
          {goalEditor}
          {pace && (pace.met ? ' · MET' : pace.neededPerDay === null ? ` · ${money(goal - counted)} SHORT` : ` · NEEDS ${money(pace.neededPerDay)}/DAY`)}
          {m && m.untagged > 0 && <> · <span className="tier-amber">+{money(m.untagged)} NOT TAGGED</span></>}
          <span className="block">BANK, TO {dayLabel(through).toUpperCase()}</span>
        </>}>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-display text-4xl leading-tight">{money(counted)}</span>
          {m?.status === 'partial' && <span className="badge tier-amber" title="Some deposits aren't tagged, so this is a floor">AT LEAST</span>}
        </div>
        {goal > 0 && pace && (
          <Track pct={(counted / goal) * 100} extra={m ? (m.untagged / goal) * 100 : 0} tick={(pace.dayOfMonth / pace.daysInMonth) * 100}
            label={`${money(counted)} of ${money(goal)}; day ${pace.dayOfMonth} of ${pace.daysInMonth}${m && m.untagged ? `; ${money(m.untagged)} more not tagged` : ''}`} />
        )}
      </Tile>
    );
  } else {
    const now = new Date();
    const mtd = monthToDateSales(data, now);
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    moneyTile = (
      <Tile label={`SALES · ${now.toLocaleString('en-US', { month: 'long' }).toUpperCase()}`}
        sub={<>{goalEditor}<span className="block">SHOPIFY ONLY — SYNC THE BANK TO COUNT STOCKIST AND CLIENT MONEY</span></>}>
        <span className="font-display text-4xl leading-tight">{money(mtd)}</span>
        {goal > 0 && mtd !== null && <Track pct={(mtd / goal) * 100} tick={(now.getDate() / dim) * 100} label={`${money(mtd)} of ${money(goal)}`} />}
      </Tile>
    );
  }

  // ── 2. cash ──
  const cp = cashPosition(data);
  const cashTile = (
    <Tile label={synced ? 'CASH ON HAND' : 'BANK BALANCE'} onOpen={() => setDesk('c')} openLabel="MONEY"
      sub={cp.cash === null ? 'UNKNOWN — TYPE THE BALANCE, OR SYNC THE BANK'
        : <>{synced ? 'BANK − CARD OWED' : 'TYPED IN'}{cp.due > 0 && <> · <strong className="text-[var(--vhs-white)]">{money(cp.after)}</strong> AFTER {money(cp.due)} STILL DUE ON PRODUCTION</>}
          {cp.dueUnknown > 0 && <> · {plural(cp.dueUnknown, 'COST')} NOT PRICED YET</>}</>}>
      {synced ? (
        <span className={`font-display text-4xl leading-tight ${cp.cash !== null && cp.cash < 0 ? 'tier-red' : ''}`}>{money(cp.cash)}</span>
      ) : (
        <InlineNumber className="font-display text-4xl leading-tight" value={data.bankBalance}
          format={(v) => (v === null ? 'SET' : money(v))} title="SET BANK BALANCE"
          onCommit={(v) => updateData((d) => ({ ...d, bankBalance: v }))} />
      )}
      {cp.cash !== null && cp.cash > 0 && cp.due > 0 && (
        <svg viewBox="0 0 260 22" width="100%" height="22" role="img" preserveAspectRatio="none"
          aria-label={`${money(cp.cash)} now; ${money(cp.after)} after ${money(cp.due)} due on production`}>
          <rect x="0" y="7" width="260" height="8" rx="4" fill="var(--phase-1)" />
          <rect x={Math.max(0, 260 * (1 - Math.min(1, cp.due / cp.cash)))} y="7" width={260 * Math.min(1, cp.due / cp.cash)} height="8" fill="var(--crt-dark)" stroke="var(--critical)" strokeWidth="1.5" />
        </svg>
      )}
    </Tile>
  );

  // ── 3. Shopify sales over the period ──
  let salesTile: ReactNode;
  if (an.kind === 'ok') {
    const v = an.view;
    const days = dailySales(v.a, v.cmp.current);
    const max = Math.max(...days.map((x) => x.net), 0);
    const diff = v.cur.netSales - v.prior.netSales;
    const fm = (minor: number, signed = false) => formatMoney({ currency: v.a.currency, minor }, { signed });
    salesTile = (
      <Tile label={`SHOPIFY SALES · LAST ${v.cmp.days} DAYS`}
        sub={<><span className={diff >= 0 ? 'tier-green' : 'tier-red'}>{diff >= 0 ? '▲' : '▼'} {fm(Math.abs(diff))}</span> VS {fm(v.prior.netSales)} THE {v.cmp.days} DAYS BEFORE · {plural(v.cur.orders, 'ORDER')}</>}>
        <span className="font-display text-4xl leading-tight">{fm(v.cur.netSales)}</span>
        <svg viewBox={`0 0 ${days.length * 10} 24`} width="100%" height="24" preserveAspectRatio="none" role="img"
          aria-label={`Daily net sales ${days[0]?.date} to ${days[days.length - 1]?.date}: ${days.filter((x) => x.net > 0).length} days with sales, best day ${fm(Math.round(max * 100))}`}>
          {days.map((x, i) => {
            const h = x.net > 0 && max > 0 ? Math.max(2, (x.net / max) * 22) : 1;
            return <rect key={x.date} x={i * 10 + 1} y={24 - h} width="8" height={h} rx="1.5" fill={x.net > 0 ? 'var(--phase-1)' : 'var(--crt-mid)'}><title>{`${dayLabel(x.date)}: ${money(x.net)}`}</title></rect>;
          })}
        </svg>
      </Tile>
    );
  } else {
    salesTile = (
      <Tile label="SHOPIFY SALES · LAST 30 DAYS" sub="DAILY DETAIL NEEDS A SYNC WITH VARIANT-LEVEL DATA">
        <span className="font-display text-4xl leading-tight">{money(trailing30dRevenue(data))}</span>
      </Tile>
    );
  }

  // ── 4. next production arrival ──
  const runs = data.productionRuns ?? [];
  const next = nextArrival(runs, today);
  const arrivalTile = (
    <Tile label="NEXT TO ARRIVE" onOpen={() => setDesk('p')} openLabel="TIMELINE"
      sub={next ? <>{next.run.name.toUpperCase()}{next.others > 0 && <> · {plural(next.others, 'OTHER RUN')} ON THE WAY</>}</>
        : runs.length ? `${plural(runs.length, 'RUN')} — NO ARRIVAL DATE YET` : 'NO PRODUCTION RUNS RECORDED'}>
      {next ? (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`font-display text-4xl leading-tight ${next.late ? 'tier-red' : ''}`}>{next.kind === 'estimate' ? '~' : ''}{dayLabel(next.date)}</span>
            {next.late ? <span className="badge tier-red">LATE</span> : next.kind === 'estimate' ? <span className="badge tier-amber">EST.</span> : null}
          </div>
          <div className="stat-sub">{plural(next.units, 'UNIT')}</div>
        </>
      ) : <span className="font-display text-4xl leading-tight dim">—</span>}
    </Tile>
  );

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {moneyTile}{cashTile}{salesTile}{arrivalTile}
    </div>
  );
}
