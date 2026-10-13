import { useTerminal } from '@/terminal/TerminalContext';
import { pipelineGross, pipelineCost, pipelineNet, pipelineMargin, pipelineExpectedNet } from '@/game/engine';
import type { PipelineItem } from '@/game/types';

const STAGES = ['DESIGN', 'SAMPLES', 'PRODUCTION', 'READY'] as const;

const STATUS_TONE: Record<PipelineItem['status'], string> = {
  DESIGN: 'tier-amber',
  SAMPLES: 'water',
  PRODUCTION: 'tropic-pink',
  READY: 'tier-green',
};

function StageTrack({ status }: { status: PipelineItem['status'] }) {
  const idx = STAGES.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className="h-2 w-6 border border-black"
            style={{
              background: i <= idx
                ? i === idx ? 'var(--palm)' : 'rgba(46,230,107,0.4)'
                : 'var(--crt-mid)',
              boxShadow: i <= idx ? 'inset 1px 1px 0 rgba(255,255,255,0.15)' : undefined,
            }}
            title={s}
          />
          {i < STAGES.length - 1 && <span className="dim text-[0.6rem]">›</span>}
        </div>
      ))}
    </div>
  );
}

export default function PipelineDesk() {
  const { data, metrics } = useTerminal();
  if (!data || !metrics) return null;

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* summary strip */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">PIPELINE TOTALS</span>
          <span className="dim text-sm">{metrics.pipelineUnits} UNITS ACROSS {data.pipeline.length} RUNS</span>
        </div>
        <div className="window-body grid grid-cols-5 gap-3 text-center">
          <div>
            <div className="font-display text-sm dim">UNITS ORDERED</div>
            <div className="font-display text-3xl text-[var(--vhs-white)]">{metrics.pipelineUnits}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">PRODUCTION COST</div>
            <div className="font-display text-3xl tier-red">${metrics.pipelineCost.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">GROSS POTENTIAL</div>
            <div className="font-display text-3xl warm">${metrics.pipelineGross.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">NET POTENTIAL</div>
            <div className="font-display text-3xl phosphor">+${metrics.pipelineNet.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">AVG MARGIN</div>
            <div className="font-display text-3xl water">
              {Math.round((metrics.pipelineNet / (metrics.pipelineGross || 1)) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* build cards */}
      <div className="grid grid-cols-2 gap-2">
        {data.pipeline.map((item) => {
          const gross = pipelineGross(item);
          const cost = pipelineCost(item);
          const net = pipelineNet(item);
          const expected = pipelineExpectedNet(item);
          return (
            <div key={item.id} className="window">
              <div className="window-head">
                <span className="wh-title">{item.name}</span>
                <span className={`badge ${STATUS_TONE[item.status]}`}>{item.status}</span>
              </div>
              <div className="window-body space-y-2">
                <div className="flex items-center justify-between">
                  <StageTrack status={item.status} />
                  <span className="font-display text-sm dim">
                    {item.status === 'READY' ? 'READY TO OPEN' : `OPENS IN ~${item.etaWeeks}W`}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="font-display text-xs dim">UNITS</div>
                    <div className="font-display text-xl text-[var(--vhs-white)]">{item.qty}</div>
                  </div>
                  <div>
                    <div className="font-display text-xs dim">UNIT COST</div>
                    <div className="font-display text-xl tier-red">${item.unitCost}</div>
                  </div>
                  <div>
                    <div className="font-display text-xs dim">RETAIL</div>
                    <div className="font-display text-xl warm">${item.retail}</div>
                  </div>
                  <div>
                    <div className="font-display text-xs dim">MARGIN</div>
                    <div className="font-display text-xl water">{Math.round(pipelineMargin(item) * 100)}%</div>
                  </div>
                </div>

                <div className="border-t border-[var(--crt-mid)] pt-2 flex items-center justify-between font-display">
                  <div className="text-sm dim">
                    COST <span className="tier-red text-lg">${cost.toLocaleString()}</span>
                    <span className="mx-2">·</span>
                    GROSS <span className="warm text-lg">${gross.toLocaleString()}</span>
                  </div>
                  <div className="text-sm dim">
                    NET <span className="phosphor text-2xl">+${net.toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-[0.7rem] dim">
                  AT {Math.round(item.expectedSellThrough * 100)}% SELL-THROUGH (COMPARABLE PRODUCTS) → EXPECTED NET{' '}
                  <span className={expected >= 0 ? 'tier-green' : 'tier-red'}>
                    {expected >= 0 ? '+' : ''}${expected.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
