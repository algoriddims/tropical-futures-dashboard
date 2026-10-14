import { useTerminal } from '@/terminal/useTerminal';
import { monthlyBurn, oneOffCosts, burnByCategory, runwayMonths, monthlyAmount, forecastCashflow, forecastVerdict, trailing30dRevenue, burnSource, actualMonthlySpend, cardOwed, netCash } from '@/game/engine';
import { money, pct, plural } from '@/game/format';
import { AccountLines, CashFlowTable } from '@/components/BankAccounts';
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
        format={(v) => money(v)}
        onCommit={(v) => onChange({ amount: v })}
      />
      <RowBtn onClick={() => onChange({ active: !c.active })} title={c.active ? 'PAUSE THIS COST' : 'RESUME THIS COST'}>
        {c.active ? '❚❚' : '▶'}
      </RowBtn>
      <RowBtn onClick={onDelete} tone="tier-red" title="DELETE LINE">×</RowBtn>
    </div>
  );
}

function Stat({ label, children, sub, subTone = 'dim' }: { label: string; children: React.ReactNode; sub: React.ReactNode; subTone?: string }) {
  return (
    <div className="min-w-0">
      <div className="stat-label">{label}</div>
      <div className="font-display text-3xl">{children}</div>
      <div className={`stat-sub ${subTone}`}>{sub}</div>
    </div>
  );
}

export default function CostsDesk() {
  const { data, metrics, updateData } = useTerminal();
  if (!data || !metrics) return null;

  const burn = monthlyBurn(data);
  const oneOffs = oneOffCosts(data);
  const runway = runwayMonths(data);
  const cash = netCash(data);
  const owed = cardOwed(data);
  const synced = !!data.accounts?.length;
  const byCat = burnByCategory(data);
  const totalWithOneOffs = byCat.reduce((s, c) => s + c.monthly, 0);
  const maxCat = Math.max(...byCat.map((c) => c.monthly), 1);
  const monthlyRevenue = trailing30dRevenue(data); // always the trailing 30d — independent of the viewing range
  const burnVsRevenue = monthlyRevenue > 0 ? (burn / monthlyRevenue) * 100 : null;
  const forecast = forecastCashflow(data, monthlyRevenue, 6);
  const verdict = forecastVerdict(forecast);
  const maxAbs = Math.max(...forecast.map((m) => Math.abs(m.closing)), 1);
  const noCosts = data.costs.length === 0;

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
      {/* synced bank + card: balances and monthly cash flow */}
      {synced && (
        <section className="window" aria-label="Business cash flow">
          <div className="window-head">
            <h2 className="wh-title">BUSINESS CASH FLOW</h2>
            <span className="wh-note">BANK + CARD · FROM ERA</span>
          </div>
          <div className="window-body grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            <AccountLines accounts={data.accounts!} />
            {data.cashflow && data.cashflow.length > 0
              ? <CashFlowTable months={data.cashflow} />
              : <div className="stat-sub">NO TRANSACTIONS IN THIS SYNC.</div>}
          </div>
        </section>
      )}

      {/* finances summary */}
      <section className="window" aria-label="Burn and runway">
        <div className="window-head">
          <h2 className="wh-title">BURN &amp; RUNWAY</h2>
          <span className="wh-note">MONTHLY FIGURES · CLICK UNDERLINED NUMBERS TO EDIT</span>
        </div>
        <div className="window-body grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="MONTHLY BURN"
            sub={burnSource(data) === 'ACTUAL_SPEND'
              ? `ACTUAL · AVG OF LAST ${actualMonthlySpend(data)!.months} MO`
              : burnSource(data) === 'NONE' ? 'NO COST LINES OR BANK DATA' : 'RECURRING COST LINES'}
          >
            <span className={burn > 0 ? 'tier-red' : 'dim'}>{burn > 0 ? money(burn) : '—'}</span>
          </Stat>
          <Stat label="ONE-OFF PRODUCTION" sub={oneOffs > 0 ? 'CURRENT RUNS' : 'NONE ENTERED'}>
            <span className={oneOffs > 0 ? 'sun' : 'dim'}>{oneOffs > 0 ? money(oneOffs) : '—'}</span>
          </Stat>
          {synced ? (
            <Stat label="CASH ON HAND" sub={owed ? `BANK ${money(data.bankBalance, { cents: true })} − CARD ${money(owed, { cents: true })}` : 'SYNCED'}>
              <span className={cash !== null && cash < 0 ? 'tier-red' : 'phosphor'}>{money(cash)}</span>
            </Stat>
          ) : (
            <Stat label="BANK" sub={data.bankBalance === null ? 'UNKNOWN — CLICK TO ENTER' : 'TYPED IN · UPDATE AFTER A BANK CHECK'}>
              <InlineNumber
                className="phosphor"
                value={data.bankBalance}
                format={(v) => (v === null ? 'SET' : money(v))}
                title="SET BANK BALANCE"
                onCommit={(v) => updateData((d) => ({ ...d, bankBalance: v }))}
              />
            </Stat>
          )}
          <Stat label="RUNWAY" sub={runway === null ? 'CASH UNKNOWN' : cash !== null && cash < 0 ? 'NET CASH IS NEGATIVE' : 'NET CASH ÷ BURN'}>
            <span className={runway === null ? 'dim' : runway < 6 ? 'tier-red' : runway < 12 ? 'tier-amber' : 'palm'}>
              {runway === null ? '—' : cash !== null && cash < 0 ? 'SHORT' : runway === Infinity ? '∞' : `${runway.toFixed(1)} MO`}
            </span>
          </Stat>
          <Stat label="BURN VS SALES" sub={burnVsRevenue === null ? 'NO SALES IN THE LAST 30 DAYS' : `OF ${money(monthlyRevenue)} 30-DAY SALES`}>
            <span className={burnVsRevenue === null ? 'dim' : burnVsRevenue > 100 ? 'tier-red' : burnVsRevenue > 60 ? 'tier-amber' : 'palm'}>
              {pct(burnVsRevenue)}
            </span>
          </Stat>
          <Stat
            label="ANNUAL BUDGET"
            subTone={data.annualBudget > 0 && burn > data.annualBudget / 12 ? 'tier-red' : 'dim'}
            sub={data.annualBudget > 0
              ? burn <= data.annualBudget / 12
                ? `UNDER BY ${money(data.annualBudget / 12 - burn)}/MO`
                : `OVER BY ${money(burn - data.annualBudget / 12)}/MO`
              : 'NOT SET'}
          >
            <InlineNumber
              className="water"
              value={data.annualBudget > 0 ? data.annualBudget : null}
              format={(v) => (v === null ? 'SET' : money(v))}
              title="SET ANNUAL BUDGET (0 TO CLEAR)"
              onCommit={(v) => updateData((d) => ({ ...d, annualBudget: Math.max(0, Math.round(v)) }))}
            />
          </Stat>
        </div>
      </section>

      {/* forward projection */}
      <section className="window" aria-label="Cash forecast">
        <div className="window-head">
          <h2 className="wh-title">CASH FORECAST · REST OF MONTH + 6</h2>
          <span className={`wh-note tier-${verdict.tone}`}>{verdict.text}</span>
        </div>
        <div className="window-body">
          {forecast.length === 0 ? (
            <div className="stat-sub">NEEDS A BANK BALANCE — SYNC THE BANK OR ENTER IT ABOVE.</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {forecast.map((m) => {
                  const h = `${Math.max(4, (Math.abs(m.closing) / maxAbs) * 100)}%`;
                  return (
                    <div key={m.label} className="text-center min-w-0">
                      {/* positive grows up from the line, negative hangs below it */}
                      <div className="flex h-14 items-end justify-center">
                        {m.closing >= 0 && <div className="w-3/5 bg-[var(--phosphor)] opacity-75" style={{ height: h }} />}
                      </div>
                      <div className="border-t border-[var(--crt-line)]" />
                      <div className="flex h-14 items-start justify-center">
                        {m.closing < 0 && <div className="w-3/5 bg-[var(--chroma-red)]" style={{ height: h }} />}
                      </div>
                      <div className="mt-1 stat-label">{m.label}</div>
                      <div className={`font-display text-lg leading-tight ${m.closing < 0 ? 'tier-red' : ''}`}>{money(m.closing)}</div>
                      <div className={`stat-sub ${m.net >= 0 ? 'palm' : 'tier-red'}`}>{money(m.net, { signed: true })} NET</div>
                    </div>
                  );
                })}
              </div>
              {forecast.some((m) => m.events.length > 0) && (
                <div className="mt-3 space-y-1 border-t border-[var(--crt-mid)] pt-2">
                  {forecast.filter((m) => m.events.length > 0).map((m) => (
                    <div key={m.label} className="flex gap-2 text-[0.78rem]">
                      <span className="stat-label w-24 shrink-0">{m.label}</span>
                      <span className="flex flex-wrap gap-x-4">
                        {m.events.map((e, i) => (
                          <span key={i} className={e.amount >= 0 ? 'palm' : 'tier-red'}>
                            {money(e.amount, { signed: true })} <span className="warm">{e.text}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 stat-sub">
                STARTS FROM CASH NET OF THE CARD ({money(forecast[0].opening)}). IN: {money(monthlyRevenue)}/MO, THE LAST 30 DAYS OF SHOPIFY NET SALES
                (BEFORE FEES AND SHIPPING — PAYOUTS REACHING THE BANK DIFFER). OUT: {money(burn)}/MO BURN. FIRST COLUMN IS THE REST OF THIS MONTH, PRORATED.
                COMMITTED RUNS ARE PAID THIS MONTH; NEW STOCK SELLS THE MONTH AFTER IT ARRIVES. STOCKIST MONEY IS NOT FORECAST.
              </p>
            </>
          )}
        </div>
      </section>

      {noCosts ? (
        <section className="window" aria-label="Cost lines">
          <div className="window-head">
            <h2 className="wh-title">COST LINES</h2>
            <span className="wh-note">NONE ENTERED</span>
          </div>
          <div className="window-body space-y-2">
            <p className="stat-sub">
              {synced
                ? 'BURN USES ACTUAL BANK + CARD SPENDING (ABOVE). ADD COST LINES ONLY IF YOU WANT TO PLAN FROM YOUR OWN NUMBERS INSTEAD — ONCE ANY RECURRING LINE EXISTS, BURN USES YOUR LINES.'
                : 'ADD YOUR RECURRING COSTS SO BURN AND RUNWAY MEAN SOMETHING.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CAT_META) as CostCategory[]).map((cat) => (
                <RowBtn key={cat} onClick={() => addCost(cat)} tone="phosphor" title={`ADD ${CAT_META[cat].label}`}>+ {CAT_META[cat].label}</RowBtn>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* category split bar */}
          <section className="window" aria-label="Where the money goes">
            <div className="window-head">
              <h2 className="wh-title">WHERE THE MONEY GOES</h2>
              <span className="wh-note">{money(totalWithOneOffs)} TOTAL THIS MONTH</span>
            </div>
            <div className="window-body">
              <div className="flex h-5 w-full border border-[var(--crt-line)]">
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
                    title={`${CAT_META[c.category].label} ${money(c.monthly)}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 font-display text-sm">
                {byCat.map((c) => (
                  <span key={c.category} className={CAT_META[c.category].tone}>
                    ■ {c.category} {money(c.monthly)}
                    <span className="dim"> · {pct((c.monthly / (totalWithOneOffs || 1)) * 100)}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                {byCat.map((c) => (
                  <div key={c.category} className="flex items-center gap-2">
                    <span className="stat-label w-28 shrink-0">{c.category}</span>
                    <div className="h-1.5 flex-1 bg-[var(--crt-mid)]">
                      <div className="h-full bg-[var(--tropic-pink)]" style={{ width: `${(c.monthly / maxCat) * 100}%` }} />
                    </div>
                    <span className="font-display text-sm warm w-20 text-right">{money(c.monthly)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* category windows */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(Object.keys(CAT_META) as CostCategory[]).map((cat) => {
              const items = data.costs.filter((c) => c.category === cat);
              const total = items.reduce((s, c) => s + (c.cadence === 'ONE-OFF' ? (c.active ? c.amount : 0) : monthlyAmount(c)), 0);
              return (
                <section key={cat} className="window" aria-label={CAT_META[cat].label}>
                  <div className="window-head">
                    <h2 className="wh-title">{CAT_META[cat].label}</h2>
                    <span className={`font-display text-base ${CAT_META[cat].tone}`}>{money(total)}/MO</span>
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
                    {items.length === 0 && <div className="px-3 py-2 stat-sub">NONE — ADD A LINE</div>}
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--crt-mid)] px-3 py-1">
                    <span className="stat-sub">{CAT_META[cat].blurb} · {plural(items.filter((i) => i.active).length, 'ACTIVE LINE')}</span>
                    <RowBtn onClick={() => addCost(cat)} tone="phosphor" title="ADD A COST LINE">+ ADD</RowBtn>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
