import { useTerminal } from '@/terminal/TerminalContext';
import { monthlyBurn, oneOffCosts, burnByCategory, runwayMonths, monthlyAmount, forecastCashflow, forecastVerdict, trailing30dRevenue } from '@/game/engine';
import type { CostCategory, CostItem } from '@/game/types';
import { InlineNumber, InlineText, RowBtn } from '@/components/InlineEdit';

const CAT_META: Record<CostCategory, { label: string; tone: string; blurb: string }> = {
  SUBSCRIPTION: { label: 'RECURRING SUBSCRIPTIONS', tone: 'water', blurb: 'MONTHLY TOOLS' },
  PAYROLL: { label: 'PAYROLL', tone: 'tropic-pink', blurb: 'PEOPLE' },
  PRODUCTION: { label: 'PRODUCTION', tone: 'sun', blurb: 'MANUFACTURING RUNS' },
  OPS: { label: 'OPERATIONS', tone: 'dim', blurb: 'STUDIO + LOGISTICS' },
};

const CADENCES: CostItem['cadence'][] = ['MONTHLY', 'WEEKLY', 'ONE-OFF'];

function CostRow({ c, onChange, onDelete }: {
  c: CostItem;
  onChange: (patch: Partial<CostItem>) => void;
  onDelete: () => void;
}) {
  const cycleCadence = () =>
    onChange({ cadence: CADENCES[(CADENCES.indexOf(c.cadence) + 1) % CADENCES.length] });
  return (
    <div className={`tape-row ${!c.active ? 'opacity-40' : ''}`}>
      <InlineText className="warm flex-1" value={c.name} onCommit={(v) => onChange({ name: v })} />
      {c.note && <span className="dim text-[0.68rem] truncate shrink-0">{c.note}</span>}
      <RowBtn onClick={cycleCadence} title="CLICK TO CHANGE CADENCE">{c.active ? c.cadence : 'PAUSED'}</RowBtn>
      <InlineNumber
        className={`font-display text-base shrink-0 ${c.active ? 'tier-red' : 'dim'}`}
        value={c.amount}
        format={(v) => `$${v.toLocaleString()}`}
        onCommit={(v) => onChange({ amount: v })}
      />
      <RowBtn onClick={() => onChange({ active: !c.active })} title={c.active ? 'PAUSE THIS COST' : 'RESUME THIS COST'}>
        {c.active ? '❚❚' : '▶'}
      </RowBtn>
      <RowBtn onClick={onDelete} tone="tier-red" title="DELETE LINE">×</RowBtn>
    </div>
  );
}

export default function CostsDesk() {
  const { data, metrics, updateData } = useTerminal();
  if (!data || !metrics) return null;

  const burn = monthlyBurn(data);
  const oneOffs = oneOffCosts(data);
  const runway = runwayMonths(data);
  const byCat = burnByCategory(data);
  const totalWithOneOffs = byCat.reduce((s, c) => s + c.monthly, 0);
  const maxCat = Math.max(...byCat.map((c) => c.monthly), 1);
  const monthlyRevenue = trailing30dRevenue(data); // always the trailing 30d — independent of the viewing range
  const burnVsRevenue = monthlyRevenue > 0 ? (burn / monthlyRevenue) * 100 : 0;
  const forecast = forecastCashflow(data, monthlyRevenue, 6);
  const verdict = forecastVerdict(forecast);
  const maxClosing = Math.max(...forecast.map((m) => Math.abs(m.closing)), 1);

  const patchCost = (id: string, patch: Partial<CostItem>) =>
    updateData((d) => ({ ...d, costs: d.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const deleteCost = (id: string) =>
    updateData((d) => ({ ...d, costs: d.costs.filter((c) => c.id !== id) }));
  const addCost = (category: CostCategory) =>
    updateData((d) => ({
      ...d,
      costs: [
        ...d.costs,
        { id: `c${Date.now()}`, name: 'NEW LINE', category, amount: 100, cadence: 'MONTHLY', active: true },
      ],
    }));

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* finances summary — the RCT finances window */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">FINANCES · BURN &amp; RUNWAY</span>
          <span className="dim text-sm">ALL FIGURES MONTHLY · CLICK NUMBERS TO EDIT</span>
        </div>
        <div className="window-body grid grid-cols-6 gap-3 text-center">
          <div>
            <div className="font-display text-sm dim">MONTHLY BURN</div>
            <div className="font-display text-3xl tier-red">${Math.round(burn).toLocaleString()}</div>
            <div className="text-[0.68rem] dim">RECURRING ONLY</div>
          </div>
          <div>
            <div className="font-display text-sm dim">ONE-OFF PRODUCTION</div>
            <div className="font-display text-3xl sun">${oneOffs.toLocaleString()}</div>
            <div className="text-[0.68rem] dim">CURRENT RUNS</div>
          </div>
          <div>
            <div className="font-display text-sm dim">BANK</div>
            <div>
              <InlineNumber
                className="font-display text-3xl phosphor"
                value={data.bankBalance}
                format={(v) => `$${v.toLocaleString()}`}
                onCommit={(v) => updateData((d) => ({ ...d, bankBalance: v }))}
              />
            </div>
            <div className="text-[0.68rem] dim">EDIT AFTER BANK CHECK</div>
          </div>
          <div>
            <div className="font-display text-sm dim">RUNWAY</div>
            <div className={`font-display text-3xl ${runway < 6 ? 'tier-red' : runway < 12 ? 'tier-amber' : 'palm'}`}>
              {runway === Infinity ? '∞' : `${runway.toFixed(1)} MO`}
            </div>
            <div className="text-[0.68rem] dim">BANK ÷ BURN</div>
          </div>
          <div>
            <div className="font-display text-sm dim">BURN VS REVENUE</div>
            <div className={`font-display text-3xl ${burnVsRevenue > 60 ? 'tier-red' : burnVsRevenue > 35 ? 'tier-amber' : 'palm'}`}>
              {burnVsRevenue.toFixed(0)}%
            </div>
            <div className="text-[0.68rem] dim">OF 30D REVENUE</div>
          </div>
          <div>
            <div className="font-display text-sm dim">ANNUAL BUDGET</div>
            <div>
              <InlineNumber
                className="font-display text-3xl water"
                value={data.annualBudget}
                format={(v) => (v > 0 ? `$${v.toLocaleString()}` : 'SET')}
                title="SET ANNUAL BUDGET (0 TO CLEAR)"
                onCommit={(v) => updateData((d) => ({ ...d, annualBudget: Math.max(0, Math.round(v)) }))}
              />
            </div>
            <div className={`text-[0.68rem] ${data.annualBudget > 0 && burn > data.annualBudget / 12 ? 'tier-red' : 'dim'}`}>
              {data.annualBudget > 0
                ? burn <= data.annualBudget / 12
                  ? `UNDER BY $${Math.round(data.annualBudget / 12 - burn).toLocaleString()}/MO`
                  : `OVER BY $${Math.round(burn - data.annualBudget / 12).toLocaleString()}/MO`
                : 'ALLOWS $—/MO'}
            </div>
          </div>
        </div>
      </div>

      {/* category split bar */}
      <div className="window">
        <div className="window-head"><span className="wh-title">WHERE THE MONEY GOES</span>
          <span className="dim text-sm">${Math.round(totalWithOneOffs).toLocaleString()} TOTAL THIS MONTH</span>
        </div>
        <div className="window-body">
          <div className="flex h-5 w-full border border-black">
            {byCat.map((c) => (
              <div
                key={c.category}
                className="h-full"
                style={{
                  width: `${(c.monthly / (totalWithOneOffs || 1)) * 100}%`,
                  background: CAT_META[c.category].tone === 'water' ? 'var(--water)'
                    : CAT_META[c.category].tone === 'tropic-pink' ? 'var(--tropic-pink)'
                    : CAT_META[c.category].tone === 'sun' ? 'var(--sun)' : 'var(--vhs-dim)',
                  opacity: 0.85,
                }}
                title={`${CAT_META[c.category].label} $${Math.round(c.monthly).toLocaleString()}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 font-display text-sm">
            {byCat.map((c) => (
              <span key={c.category} className={CAT_META[c.category].tone}>
                ■ {c.category} ${Math.round(c.monthly).toLocaleString()}
                <span className="dim"> · {Math.round((c.monthly / (totalWithOneOffs || 1)) * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* category windows */}
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(CAT_META) as CostCategory[]).map((cat) => {
          const items = data.costs.filter((c) => c.category === cat);
          const total = items.reduce((s, c) => s + (c.cadence === 'ONE-OFF' ? (c.active ? c.amount : 0) : monthlyAmount(c)), 0);
          return (
            <div key={cat} className="window">
              <div className="window-head">
                <span className="wh-title">{CAT_META[cat].label}</span>
                <span className={`font-display text-base ${CAT_META[cat].tone}`}>
                  ${Math.round(total).toLocaleString()}/MO
                </span>
              </div>
              <div>
                {items.map((c) => (
                  <CostRow
                    key={c.id}
                    c={c}
                    onChange={(patch) => patchCost(c.id, patch)}
                    onDelete={() => deleteCost(c.id)}
                  />
                ))}
                {items.length === 0 && (
                  <div className="px-3 py-2 text-[0.72rem] dim">NOTHING HERE — ADD A LINE</div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-[var(--crt-mid)] px-3 py-1">
                <span className="font-display text-xs dim">
                  {CAT_META[cat].blurb} · {items.filter((i) => i.active).length} ACTIVE
                </span>
                <RowBtn onClick={() => addCost(cat)} tone="phosphor" title="ADD A COST LINE">+ ADD</RowBtn>
              </div>
            </div>
          );
        })}
      </div>

      {/* forward projection */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">CASH FLOW FORECAST · 6 MONTHS</span>
          <span className={`font-display text-base tier-${verdict.tone}`}>{verdict.text}</span>
        </div>
        <div className="window-body">
          <div className="grid grid-cols-6 gap-2">
            {forecast.map((m) => (
              <div key={m.label} className="text-center">
                <div className="flex h-24 items-end justify-center border-b border-[var(--crt-mid)]">
                  <div
                    className={m.closing < 0 ? 'w-3/5 bg-[var(--chroma-red)]' : 'w-3/5 bg-[var(--phosphor)]'}
                    style={{ height: `${Math.max(4, (Math.abs(m.closing) / maxClosing) * 100)}%`, opacity: m.closing < 0 ? 1 : 0.75 }}
                    title={`CLOSING $${Math.round(m.closing).toLocaleString()}`}
                  />
                </div>
                <div className="mt-1 font-display text-sm dim">{m.label}</div>
                <div className={`font-display text-lg leading-tight ${m.closing < 0 ? 'tier-red' : 'text-[var(--vhs-white)]'}`}>
                  {m.closing < 0 ? '-' : ''}${Math.abs(Math.round(m.closing)).toLocaleString()}
                </div>
                <div className={`font-display text-xs ${m.net >= 0 ? 'palm' : 'tier-red'}`}>
                  {m.net >= 0 ? '+' : '-'}${Math.abs(Math.round(m.net)).toLocaleString()} NET
                </div>
              </div>
            ))}
          </div>
          {forecast.some((m) => m.events.length > 0) && (
            <div className="mt-3 space-y-1 border-t border-[var(--crt-mid)] pt-2">
              {forecast.filter((m) => m.events.length > 0).map((m) => (
                <div key={m.label} className="flex gap-2 text-[0.72rem]">
                  <span className="font-display dim w-14 shrink-0">{m.label}</span>
                  <span className="flex flex-wrap gap-x-4">
                    {m.events.map((e, i) => (
                      <span key={i} className={e.amount >= 0 ? 'palm' : 'tier-red'}>
                        {e.amount >= 0 ? '+' : '-'}${Math.abs(e.amount).toLocaleString()}{' '}
                        <span className="warm">{e.text}</span>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[0.68rem] dim">
            BASELINE ${Math.round(monthlyRevenue).toLocaleString()}/MO ONLINE FROM TRAILING 30D · STOCKIST PAYOUTS COLLECT MONTH 1, WHOLESALE PACE MONTHS 2+ · COMMITTED RUNS PAID THIS MONTH · STOCK SELLS THE MONTH AFTER ARRIVAL
          </div>
        </div>
      </div>

      {/* relative share vs revenue bars */}
      <div className="window">
        <div className="window-head"><span className="wh-title">COST PRESSURE</span></div>
        <div className="window-body space-y-1.5">
          {byCat.map((c) => (
            <div key={c.category} className="flex items-center gap-2">
              <span className="font-display text-xs dim w-28">{c.category}</span>
              <div className="h-1.5 flex-1 bg-[var(--crt-mid)]">
                <div className="h-full bg-[var(--tropic-pink)]" style={{ width: `${(c.monthly / maxCat) * 100}%` }} />
              </div>
              <span className="font-display text-sm warm w-16 text-right">${Math.round(c.monthly).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
