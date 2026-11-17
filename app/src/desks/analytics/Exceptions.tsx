import { useTerminal } from '@/terminal/useTerminal';
import type { DeskKey } from '@/terminal/desks';
import { cardOwed, netCash } from '@/game/engine';
import { money } from '@/game/format';
import type { Exception } from '@/analytics/metrics';
import { rankExceptions } from '@/analytics/metrics';
import { formatMoney } from '@/analytics/money';
import { todayIn } from '@/analytics/period';
import { productionAlerts } from '@/game/production';
import type { AnalyticsState } from './useAnalytics';

// Up to three exceptions, the most money at stake first. Each names the item, the
// supporting numbers, the rule that fired and where to look next. Cash
// running short outranks everything else when it applies.
export function ExceptionsPanel({ state }: { state: AnalyticsState }) {
  const { data, setDesk } = useTerminal();
  if (!data) return null;
  const list: Exception[] = [];
  const cash = netCash(data);
  if (cash !== null && cash < 0 && data.accounts?.length) {
    const owed = cardOwed(data);
    list.push({
      id: 'cash', severity: 1, title: 'Cash on hand is below zero', affected: 'Business bank + card',
      numbers: [`Bank ${money(data.bankBalance, { cents: true })}`, ...(owed ? [`Card owes ${money(owed, { cents: true })}`] : []), `Net ${money(cash, { cents: true })}`],
      rule: 'Synced checking + savings minus the synced card balance is negative.',
      drill: { desk: 'c', label: 'Open costs & cash' }, evidence: 'sufficient', atRisk: 0, actions: [],
    });
  }
  // production: stages past their date and payments coming due (no sales estimate, so after stock risks)
  const tz = state.kind === 'ok' ? state.view.a.timezone : null;
  const prod: Exception[] = productionAlerts(data.productionRuns ?? [], todayIn(tz ?? 'America/New_York')).map((p) => ({
    id: p.id, severity: 2, title: p.title, affected: p.run, numbers: p.numbers, rule: p.rule,
    drill: { desk: 'p', label: 'Open production' }, evidence: 'sufficient', atRisk: 0, actions: [],
  }));
  // cash short comes first; the rest by estimated sales at risk
  const ranked = [...list, ...rankExceptions([...(state.kind === 'ok' ? state.view.exceptions : []), ...prod])];
  list.push(...(state.kind === 'ok' ? state.view.exceptions : []), ...prod);
  const top = ranked.slice(0, 3);
  const currency = state.kind === 'ok' ? state.view.a.currency : 'USD';
  const more = list.length - top.length;

  return (
    <section className="window" aria-labelledby="ex-h">
      <div className="window-head">
        <h2 id="ex-h" className="wh-title">THIS WEEK: LOOK INTO</h2>
        <span className="wh-note">{list.length ? `TOP ${top.length} OF ${list.length}` : ''}</span>
      </div>
      <div className="window-body">
        {state.kind !== 'ok' && <p className="stat-sub mb-2">PRODUCT AND STOCK CHECKS NEED A SYNC WITH VARIANT-LEVEL DATA; ONLY CASH AND PRODUCTION ARE CHECKED HERE.</p>}
        {top.length === 0 ? (
          <p className="font-display text-sm tier-green">NOTHING MET AN EXCEPTION RULE IN THIS PERIOD.</p>
        ) : (
          <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {top.map((e, i) => (
              <li key={e.id} className="min-w-0 border border-[var(--crt-mid)] p-3">
                <div className="flex items-start gap-2">
                  <span className={`font-display ${e.id === 'cash' ? 'tier-red' : e.atRisk > 0 ? 'tier-amber' : 'dim'}`} aria-hidden>{i + 1}.</span>
                  <h3 className="font-display text-base leading-snug">{e.title}</h3>
                </div>
                {e.atRisk > 0 && (
                  <p className="mt-1 font-display text-sm tier-amber">
                    ≈ {formatMoney({ currency, minor: e.atRisk })} OF SALES AT RISK IN THE NEXT 4 WEEKS <span className="dim">(ESTIMATE, AT THE RECENT PACE)</span>
                  </p>
                )}
                <ul className="mt-1 space-y-0.5 text-[0.8rem]">
                  {e.numbers.slice(0, 4).map((n) => <li key={n}>{n}</li>)}
                  {e.numbers.length > 4 && <li className="dim">+{e.numbers.length - 4} more</li>}
                </ul>
                {e.actions.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[0.8rem] warm" aria-label="Reorder timing">
                    {e.actions.slice(0, 3).map((n) => <li key={n}>→ {n}</li>)}
                    {e.actions.length > 3 && <li className="dim">+{e.actions.length - 3} more on the inventory page</li>}
                  </ul>
                )}
                <p className="stat-sub mt-1">RULE: {e.rule}</p>
                {e.evidence === 'insufficient' && <p className="stat-sub tier-amber">EVIDENCE IS THIN — TREAT AS A QUESTION, NOT A CONCLUSION.</p>}
                <button onClick={() => setDesk(e.drill.desk as DeskKey)} className="tap mt-2 border border-[var(--crt-line)] px-2 py-0.5 font-display text-sm">
                  {e.drill.label.toUpperCase()} →
                </button>
              </li>
            ))}
          </ol>
        )}
        {more > 0 && <p className="stat-sub mt-2">+{more} MORE — SEE INVENTORY AND ALERTS.</p>}
      </div>
    </section>
  );
}
