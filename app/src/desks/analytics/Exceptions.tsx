import { useTerminal } from '@/terminal/useTerminal';
import { ActionList } from './ActionList';
import type { DeskKey } from '@/terminal/desks';
import { cardOwed, netCash } from '@/game/engine';
import { money, plural } from '@/game/format';
import type { Exception } from '@/analytics/metrics';
import { rankExceptions } from '@/analytics/metrics';
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

  return (
    <section className="window" aria-labelledby="ex-h">
      <div className="window-head">
        <h2 id="ex-h" className="wh-title">2 · DO THIS WEEK</h2>
        <span className="wh-note">{ranked.length ? `TOP ${top.length} OF ${ranked.length} · MOST MONEY AT STAKE FIRST` : ''}</span>
      </div>
      <div className="window-body">
        {state.kind !== 'ok' && <p className="stat-sub mb-2">PRODUCT AND STOCK CHECKS NEED A SYNC WITH VARIANT-LEVEL DATA; ONLY CASH, DEPOSITS AND PRODUCTION ARE CHECKED HERE.</p>}
        <ActionList items={top} currency={currency} onDrill={(d) => setDesk(d as DeskKey)} />
        {more > 0 && <p className="stat-sub mt-2">+{more} MORE — SEE STOCK, PRODUCTION AND ALERTS.</p>}
      </div>
    </section>
  );
}
