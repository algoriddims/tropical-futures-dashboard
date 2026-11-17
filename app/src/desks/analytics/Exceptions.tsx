import { useTerminal } from '@/terminal/useTerminal';
import type { DeskKey } from '@/terminal/desks';
import { cardOwed, netCash } from '@/game/engine';
import { money, plural } from '@/game/format';
import type { Exception } from '@/analytics/metrics';
import { rankExceptions } from '@/analytics/metrics';
import { formatMoney } from '@/analytics/money';
import { todayIn } from '@/analytics/period';
import { productionAlerts } from '@/game/production';
import { monthMoney, taggedDeposits } from '@/game/moneyIn';
import type { AnalyticsState } from './useAnalytics';

// Up to three things to do this week, the most money at stake first. Cash
// running short outranks everything; then stock problems by estimated sales
// at risk; then items with no sales estimate (deposits to tag, production
// dates and payments, unmapped channels). Every row's bar is on one scale, so
// a short bar is a small problem. The supporting numbers and the rule that
// fired sit behind "why" on each row.
export function ExceptionsPanel({ state }: { state: AnalyticsState }) {
  const { data, setDesk } = useTerminal();
  if (!data) return null;
  const first: Exception[] = [];
  const cash = netCash(data);
  if (cash !== null && cash < 0 && data.accounts?.length) {
    const owed = cardOwed(data);
    first.push({
      id: 'cash', severity: 1, title: 'Cash on hand is below zero', affected: 'Business bank + card',
      numbers: [`Bank ${money(data.bankBalance, { cents: true })}`, ...(owed ? [`Card owes ${money(owed, { cents: true })}`] : []), `Net ${money(cash, { cents: true })}`],
      rule: 'Synced checking + savings minus the synced card balance is negative.',
      drill: { desk: 'c', label: 'Costs & cash' }, evidence: 'sufficient', atRisk: 0, actions: [],
    });
  }
  const tz = state.kind === 'ok' ? state.view.a.timezone ?? 'America/New_York' : 'America/New_York';
  const today = todayIn(tz);

  // deposits the bank can't label: until tagged they don't count toward the goal
  const waiting = taggedDeposits(data).filter((x) => !x.tag);
  const tag: Exception[] = [];
  if (waiting.length) {
    const goal = data.monthlySalesGoal ?? 0;
    const month = data.accounts?.length ? todayIn(tz, new Date(data.accounts.map((a) => a.asOf).sort()[0])).slice(0, 7) : today.slice(0, 7);
    const m = monthMoney(data, month);
    const decides = goal > 0 && m && m.counted < goal && m.counted + m.untagged >= goal;
    const total = waiting.reduce((s, x) => s + x.amount, 0);
    tag.push({
      id: 'tag-deposits', severity: 1,
      title: `Tag ${plural(waiting.length, 'deposit')} (${money(total)})${decides ? ` — they decide whether ${new Date(`${month}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} reaches ${money(goal)}` : ''}`,
      affected: 'Money in',
      numbers: waiting.slice(0, 3).map((x) => `${x.date}: ${money(x.amount, { cents: true })} — ${x.label}${x.memo ? ` "${x.memo}"` : ''}`),
      rule: 'Deposits that aren\'t Shopify or PayPal payouts count toward the goal only once tagged as stockist or client money.',
      drill: { desk: 'c', label: 'Costs' }, evidence: 'sufficient', atRisk: 0,
      actions: [(() => { const big = [...waiting].sort((a, b) => b.amount - a.amount)[0]; return `Biggest: ${money(big.amount)} on ${big.date} (${big.label}). Stockist or client money counts toward the goal; your own doesn't`; })()],
    });
  }

  const prod: Exception[] = productionAlerts(data.productionRuns ?? [], today).map((p) => ({
    id: p.id, severity: 2, title: p.title, affected: p.run, numbers: p.numbers, rule: p.rule,
    drill: { desk: 'p', label: 'Production' }, evidence: 'sufficient', atRisk: 0, actions: [],
  }));
  const all = [...(state.kind === 'ok' ? state.view.exceptions : []), ...tag, ...prod];
  const ranked = [...first, ...rankExceptions(all)];
  const top = ranked.slice(0, 3);
  const more = ranked.length - top.length;
  const currency = state.kind === 'ok' ? state.view.a.currency : 'USD';
  const maxRisk = Math.max(...top.map((e) => e.atRisk), 1);

  return (
    <section className="window" aria-labelledby="ex-h">
      <div className="window-head">
        <h2 id="ex-h" className="wh-title">2 · DO THIS WEEK</h2>
        <span className="wh-note">{ranked.length ? `TOP ${top.length} OF ${ranked.length} · MOST MONEY AT STAKE FIRST` : ''}</span>
      </div>
      <div className="window-body">
        {state.kind !== 'ok' && <p className="stat-sub mb-2">PRODUCT AND STOCK CHECKS NEED A SYNC WITH VARIANT-LEVEL DATA; ONLY CASH, DEPOSITS AND PRODUCTION ARE CHECKED HERE.</p>}
        {top.length === 0 ? (
          <p className="font-display text-sm tier-green">NOTHING NEEDS YOU THIS WEEK.</p>
        ) : (
          <ol className="divide-y divide-[var(--crt-mid)]">
            {top.map((e, i) => (
              <li key={e.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-2.5 md:grid-cols-[1.25rem_minmax(0,1fr)_13rem] md:items-center">
                <span className={`font-display text-base ${e.id === 'cash' ? 'tier-red' : 'dim'}`} aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="font-display text-base leading-snug">{e.title}</h3>
                  <p className="text-[0.8rem] dim">
                    {[e.actions[e.actions.length - 1] ?? e.numbers[0]].filter(Boolean).join(' · ')}
                    {' '}
                    <button onClick={() => setDesk(e.drill.desk as DeskKey)} className="tap ml-1 border border-[var(--crt-line)] px-1.5 font-display text-xs text-[var(--vhs-white)]">
                      {e.drill.label.toUpperCase()} →
                    </button>
                  </p>
                  <details className="mt-0.5">
                    <summary className="stat-sub cursor-pointer">WHY</summary>
                    <ul className="mt-1 space-y-0.5 text-[0.8rem]">
                      {e.numbers.slice(0, 4).map((n) => <li key={n}>{n}</li>)}
                      {e.actions.map((n) => <li key={n} className="warm">→ {n}</li>)}
                    </ul>
                    <p className="stat-sub mt-1">RULE: {e.rule}</p>
                    {e.evidence === 'insufficient' && <p className="stat-sub tier-amber">EVIDENCE IS THIN — TREAT AS A QUESTION, NOT A CONCLUSION.</p>}
                  </details>
                </div>
                <div className="col-start-2 md:col-start-auto">
                  {e.atRisk > 0 ? (
                    <>
                      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 w-full" role="img" aria-label={`About ${formatMoney({ currency, minor: e.atRisk })} of sales at risk`}>
                        <rect x="0" y="0" width={Math.max(2, (e.atRisk / maxRisk) * 100)} height="10" rx="2" fill="var(--phase-2)" />
                      </svg>
                      <div className="stat-sub">≈ {formatMoney({ currency, minor: e.atRisk })} OF SALES AT RISK IN THE NEXT 4 WEEKS</div>
                    </>
                  ) : (
                    <div className="stat-sub">{e.id === 'cash' ? 'CASH IS SHORT NOW' : e.id === 'tag-deposits' ? 'AFFECTS THE GOAL, NOT SALES' : 'NO SALES ESTIMATE'}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {more > 0 && <p className="stat-sub mt-2">+{more} MORE — SEE INVENTORY, PRODUCTION AND ALERTS.</p>}
      </div>
    </section>
  );
}
