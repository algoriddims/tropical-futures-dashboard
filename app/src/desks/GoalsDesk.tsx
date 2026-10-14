import { useTerminal } from '@/terminal/useTerminal';
import { growthPlan, buildInsights, trailing30dRevenue, daysUntil, monthToDateSales } from '@/game/engine';
import { money, pct } from '@/game/format';
import { InlineNumber, InlineText } from '@/components/InlineEdit';

function Bar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-[var(--crt-mid)]">
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, p))}%`, background: color }} />
    </div>
  );
}

function Stat({ label, value, sub, tone = '' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="stat-label">{label}</div>
      <div className={`font-display text-2xl ${tone}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function GoalsDesk() {
  const { data, metrics, updateData } = useTerminal();
  if (!data || !metrics) return null;

  const monthlyRevenue = trailing30dRevenue(data);
  const plan = growthPlan(data, monthlyRevenue);
  const insights = buildInsights(data, metrics, monthlyRevenue);
  const goal = data.monthlySalesGoal ?? 0;
  const mtd = monthToDateSales(data);
  const hasPipeline = data.pipeline.length > 0;

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {/* the monthly sales goal */}
        <section className="window" aria-label="Monthly sales goal">
          <div className="window-head">
            <h2 className="wh-title">MONTHLY SALES GOAL</h2>
            <span className="wh-note">SHOPIFY NET SALES (AFTER DISCOUNTS AND RETURNS, BEFORE SHIPPING AND TAX) · USD</span>
          </div>
          <div className="window-body grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat
              label="GOAL"
              value={
                <InlineNumber
                  className="phosphor"
                  value={goal > 0 ? goal : null}
                  format={(v) => (v === null ? 'SET' : money(v))}
                  title="SET MONTHLY SALES GOAL (0 TO CLEAR)"
                  onCommit={(v) => updateData((d) => ({ ...d, monthlySalesGoal: Math.max(0, Math.round(v)) }))}
                />
              }
              sub={goal > 0 ? 'PER MONTH · CLICK TO CHANGE' : 'NOT SET — E.G. 2000'}
            />
            <Stat label="THIS MONTH SO FAR" value={money(mtd)} sub={goal > 0 && mtd !== null ? `${pct((mtd / goal) * 100)} OF GOAL` : undefined} />
            <Stat
              label="LAST 30 DAYS"
              value={money(monthlyRevenue)}
              tone={goal > 0 ? (monthlyRevenue >= goal ? 'tier-green' : 'tier-amber') : ''}
              sub={goal > 0 ? `${pct((monthlyRevenue / goal) * 100)} OF A GOAL MONTH` : 'TRAILING SALES PACE'}
            />
          </div>
        </section>

        {/* score, with its parts — what it is and isn't */}
        <section className="window" aria-label="Business health score">
          <div className="window-head">
            <h2 className="wh-title">HEALTH SCORE · {metrics.rating} / 1000 · {metrics.ratingBand}</h2>
            <span className="wh-note">A ROUGH SUMMARY, NOT A TARGET</span>
          </div>
          <div className="window-body space-y-1.5">
            {metrics.ratingParts.map((p) => (
              <div key={p.label} className="flex items-center gap-2 text-[0.8rem]">
                <span className="stat-label w-44 shrink-0">{p.label}</span>
                <div className="h-1.5 flex-1 bg-[var(--crt-mid)]">
                  {p.score !== null && <div className="h-full bg-[var(--palm)]" style={{ width: `${p.score}%` }} />}
                </div>
                <span className={`w-10 text-right font-display ${p.score === null ? 'dim' : ''}`}>{p.score === null ? '—' : Math.round(p.score)}</span>
              </div>
            ))}
            <p className="stat-sub">
              PARTS MARKED — HAVE NO DATA AND ARE LEFT OUT, NOT SCORED AS ZERO. MOMENTUM ALWAYS COMPARES 30-DAY PERIODS, SO THE SCORE DOESN'T MOVE WITH THE RANGE YOU'RE VIEWING.
            </p>
          </div>
        </section>
      </div>

      {/* next drop */}
      <section className="window" aria-label="Next drop">
        <div className="window-head">
          <h2 className="wh-title">NEXT DROP</h2>
          <span className="wh-note">CLICK NAME/DATE TO SET</span>
        </div>
        <div className="window-body flex flex-wrap items-center gap-6">
          <div>
            <div className="stat-label">DROP NAME</div>
            <InlineText
              className="font-display text-2xl tropic-pink"
              value={data.nextDrop?.name ?? 'SET DROP NAME'}
              title="SET DROP NAME"
              onCommit={(v) => updateData((d) => ({ ...d, nextDrop: { name: v, date: d.nextDrop?.date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) } }))}
            />
          </div>
          <div>
            <label className="stat-label block" htmlFor="drop-date">DATE</label>
            <input
              id="drop-date"
              type="date"
              className="bg-[var(--crt-dark)] border border-[var(--crt-mid)] hover:border-[var(--phosphor)] px-1 py-0 font-display text-2xl sun outline-none [color-scheme:light_dark]"
              value={data.nextDrop?.date ?? ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const v = e.target.value;
                updateData((d) => ({ ...d, nextDrop: v ? { name: d.nextDrop?.name ?? 'UNTITLED DROP', date: v } : null }));
              }}
            />
          </div>
          {data.nextDrop && (
            <>
              <div>
                <div className="stat-label">COUNTDOWN</div>
                <div className={`font-display text-4xl leading-none ${daysUntil(data.nextDrop.date) <= 3 ? 'tier-red' : daysUntil(data.nextDrop.date) <= 10 ? 'tier-amber' : 'phosphor'}`}>
                  {daysUntil(data.nextDrop.date) < 0 ? 'DROPPED' : daysUntil(data.nextDrop.date) === 0 ? 'DROP DAY' : `D-${daysUntil(data.nextDrop.date)}`}
                </div>
              </div>
              <button
                className="ml-auto font-display text-sm dim hover:text-[var(--chroma-red)]"
                title="CLEAR DROP"
                onClick={() => updateData((d) => ({ ...d, nextDrop: null }))}
              >
                × CLEAR
              </button>
            </>
          )}
        </div>
      </section>

      {/* growth target — only meaningful with production runs to grow from */}
      <section className="window" aria-label="Growth target">
        <div className="window-head">
          <h2 className="wh-title">GROWTH TARGET · NEXT PRODUCTION RUN</h2>
          <span className={`wh-note ${plan.fundable === true ? 'tier-green' : plan.fundable === false ? 'tier-red' : ''}`}>
            {plan.fundable === true ? 'FUNDABLE' : plan.fundable === false ? 'NOT FUNDABLE' : hasPipeline ? 'NEEDS A CASH FIGURE' : 'NO RUNS TO PLAN FROM'}
          </span>
        </div>
        <div className="window-body">
          {!hasPipeline ? (
            <p className="stat-sub">
              NO PRODUCTION RUNS ARE RECORDED, SO THERE IS NOTHING TO SIZE A GROWTH TARGET AGAINST. ADD RUNS TO THE PIPELINE AND THIS SHOWS COST, UNITS AND WHETHER CASH COVERS IT.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat
                label="TARGET GROWTH"
                value={
                  <span className="phosphor">
                    +<InlineNumber
                      className="phosphor"
                      value={plan.targetPct}
                      onCommit={(v) => updateData((d) => ({ ...d, growthTargetPct: Math.max(0, Math.min(500, Math.round(v))) }))}
                    />%
                  </span>
                }
                sub="RETAIL VALUE VS CURRENT PIPELINE"
              />
              <Stat label="CURRENT PIPELINE" value={money(plan.currentRetail)} sub="RETAIL VALUE IN PRODUCTION" />
              <Stat label="NEXT RUN TARGET" value={money(plan.targetRetail)} tone="sun" sub={`${money(plan.deltaRetail, { signed: true })} VS CURRENT`} />
              <Stat label="EST. UNITS" value={`~${plan.estUnits.toLocaleString('en-US')}`} sub="AT BLENDED PRICE POINT" />
              <Stat label="EST. PRODUCTION COST" value={money(plan.estCost)} tone="tier-red" sub={`AT ${pct(data.grossMargin * 100)} MARGIN`} />
              <Stat label="EXPECTED NET" value={money(plan.expectedNet, { signed: true })} tone="phosphor" sub="AT BLENDED SELL-THROUGH" />
              <Stat
                label="FORECAST LOW POINT"
                value={money(plan.lowPoint)}
                tone={plan.fundable === false ? 'tier-red' : ''}
                sub={plan.lowPoint === null ? 'CASH UNKNOWN' : `IN ${plan.lowPointLabel} · COST MUST CLEAR THIS`}
              />
            </div>
          )}
        </div>
      </section>

      {data.quests.length > 0 && (
        <section className="window" aria-label="Goals">
          <div className="window-head"><h2 className="wh-title">GOALS FROM THE SYNC</h2></div>
          <div className="window-body space-y-2">
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
        </section>
      )}

      {/* cross-data insights feed */}
      <section className="window" aria-label="Insights">
        <div className="window-head">
          <h2 className="wh-title">INSIGHTS</h2>
          <span className="wh-note">READ ACROSS COSTS · PIPELINE · STOCKISTS · ADS · FORECAST</span>
        </div>
        <ul>
          {insights.map((i) => (
            <li key={i.id} className="tape-row">
              <span className={`tier-${i.tier} shrink-0`} aria-hidden>{i.tier === 'red' ? '▲' : i.tier === 'amber' ? '◆' : '●'}</span>
              <span className="min-w-0">
                <span className="warm block">{i.text}</span>
                <span className="stat-sub block">{i.detail}</span>
              </span>
            </li>
          ))}
          {insights.length === 0 && <li className="px-3 py-2 stat-sub">NOTHING TO FLAG.</li>}
        </ul>
      </section>
    </div>
  );
}
