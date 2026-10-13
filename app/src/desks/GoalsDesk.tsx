import { useTerminal } from '@/terminal/TerminalContext';
import { growthPlan, buildInsights, trailing30dRevenue, daysUntil } from '@/game/engine';
import { InlineNumber, InlineText } from '@/components/InlineEdit';

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-[var(--crt-mid)]">
      <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export default function GoalsDesk() {
  const { data, metrics, updateData } = useTerminal();
  if (!data || !metrics) return null;

  const monthlyRevenue = trailing30dRevenue(data);
  const plan = growthPlan(data, monthlyRevenue);
  const insights = buildInsights(data, metrics, monthlyRevenue);

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* growth target — the headline planner */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">GROWTH TARGET · NEXT PRODUCTION RUN</span>
          <span className="dim text-sm">CLICK THE % TO SET TARGET</span>
        </div>
        <div className="window-body flex items-end justify-between gap-4">
          <div>
            <div className="font-display text-sm dim">TARGET GROWTH</div>
            <div className="flex items-baseline">
              <span className="font-display text-6xl phosphor leading-none">+</span>
              <InlineNumber
                className="font-display text-6xl phosphor crt-flicker leading-none"
                value={plan.targetPct}
                onCommit={(v) => updateData((d) => ({ ...d, growthTargetPct: Math.max(0, Math.min(500, Math.round(v))) }))}
              />
              <span className="font-display text-6xl phosphor leading-none">%</span>
            </div>
            <div className="text-[0.72rem] dim mt-1">RETAIL VALUE GROWTH VS CURRENT PIPELINE</div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="font-display text-sm dim">CURRENT PIPELINE</div>
              <div className="font-display text-3xl text-[var(--vhs-white)]">${plan.currentRetail.toLocaleString()}</div>
              <div className="text-[0.68rem] dim">RETAIL VALUE IN PRODUCTION</div>
            </div>
            <div>
              <div className="font-display text-sm dim">NEXT RUN TARGET</div>
              <div className="font-display text-3xl sun">${plan.targetRetail.toLocaleString()}</div>
              <div className="text-[0.68rem] dim">RETAIL VALUE TO PRODUCE</div>
            </div>
            <div>
              <div className="font-display text-sm dim">GAP</div>
              <div className="font-display text-3xl palm">+${plan.deltaRetail.toLocaleString()}</div>
              <div className="text-[0.68rem] dim">MORE THAN CURRENT RUN</div>
            </div>
          </div>
        </div>
      </div>

      {/* next drop — the countdown the whole park plans around */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">NEXT DROP</span>
          <span className="dim text-sm">CLICK NAME/DATE TO SET · CLEARS WITH ×</span>
        </div>
        <div className="window-body flex items-center gap-6">
          <div>
            <div className="font-display text-sm dim">DROP NAME</div>
            <InlineText
              className="font-display text-2xl tropic-pink"
              value={data.nextDrop?.name ?? 'SET DROP NAME'}
              title="SET DROP NAME"
              onCommit={(v) => updateData((d) => ({ ...d, nextDrop: { name: v, date: d.nextDrop?.date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) } }))}
            />
          </div>
          <div>
            <div className="font-display text-sm dim">DATE</div>
            <input
              type="date"
              className="bg-[var(--crt-dark)] border border-[var(--crt-mid)] hover:border-[var(--phosphor)] px-1 py-0 font-display text-2xl sun outline-none [color-scheme:dark]"
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
                <div className="font-display text-sm dim">COUNTDOWN</div>
                <div className={`font-display text-4xl leading-none ${daysUntil(data.nextDrop.date) <= 3 ? 'tier-red' : daysUntil(data.nextDrop.date) <= 10 ? 'tier-amber' : 'phosphor'}`}>
                  {daysUntil(data.nextDrop.date) < 0 ? 'DROPPED' : daysUntil(data.nextDrop.date) === 0 ? 'DROP DAY' : `D-${daysUntil(data.nextDrop.date)}`}
                </div>
              </div>
              <button
                className="ml-auto font-display text-xs dim hover:text-[var(--chroma-red)]"
                title="CLEAR DROP"
                onClick={() => updateData((d) => ({ ...d, nextDrop: null }))}
              >
                × CLEAR
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* what the target run looks like */}
        <div className="window">
          <div className="window-head">
            <span className="wh-title">FUNDING THE TARGET</span>
            <span className={`font-display text-base ${plan.fundable ? 'tier-green' : 'tier-red'}`}>
              {plan.fundable ? 'FUNDABLE' : 'NOT FUNDABLE'}
            </span>
          </div>
          <div className="window-body grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="font-display text-sm dim">EST. UNITS</div>
              <div className="font-display text-2xl text-[var(--vhs-white)]">~{plan.estUnits.toLocaleString()}</div>
              <div className="text-[0.68rem] dim">AT BLENDED PRICE POINT</div>
            </div>
            <div>
              <div className="font-display text-sm dim">EST. PRODUCTION COST</div>
              <div className="font-display text-2xl tier-red">${plan.estCost.toLocaleString()}</div>
              <div className="text-[0.68rem] dim">AT {(data.grossMargin * 100).toFixed(0)}% MARGIN</div>
            </div>
            <div>
              <div className="font-display text-sm dim">EXPECTED NET</div>
              <div className="font-display text-2xl phosphor">+${plan.expectedNet.toLocaleString()}</div>
              <div className="text-[0.68rem] dim">AT BLENDED SELL-THROUGH</div>
            </div>
            <div>
              <div className="font-display text-sm dim">FORECAST LOW POINT</div>
              <div className={`font-display text-2xl ${plan.fundable ? 'palm' : 'tier-red'}`}>
                ${Math.round(plan.lowPoint).toLocaleString()}
              </div>
              <div className="text-[0.68rem] dim">IN {plan.lowPointLabel} · COST MUST CLEAR THIS</div>
            </div>
          </div>
        </div>

        {/* goals live in the planning context */}
        <div className="window">
          <div className="window-head"><span className="wh-title">GOALS</span></div>
          <div className="window-body space-y-2">
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
        </div>
      </div>

      {/* cross-data insights feed */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">INSIGHTS</span>
          <span className="dim text-sm">READ ACROSS COSTS · PIPELINE · STOCKISTS · ADS · FORECAST</span>
        </div>
        <div>
          {insights.map((i) => (
            <div key={i.id} className="tape-row">
              <span className={`tier-${i.tier} shrink-0`}>{i.tier === 'red' ? '▲' : i.tier === 'amber' ? '◆' : '●'}</span>
              <span className="warm shrink-0">{i.text}</span>
              <span className="dim text-[0.72rem] truncate">{i.detail}</span>
            </div>
          ))}
          {insights.length === 0 && (
            <div className="px-3 py-2 text-[0.72rem] dim">NOTHING TO FLAG.</div>
          )}
        </div>
      </div>
    </div>
  );
}
