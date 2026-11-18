import type { Exception } from '@/analytics/metrics';
import { formatMoney } from '@/analytics/money';

// A ranked list of things to do. Every row's bar is on one scale, so a short
// bar is a small problem; the supporting numbers and the rule that fired sit
// behind "why". Used by the overview and the Stock desk.
export function ActionList({ items, currency, onDrill, hideDrillTo, empty = 'NOTHING NEEDS YOU THIS WEEK.' }: {
  items: Exception[]; currency: string; onDrill: (desk: string) => void; hideDrillTo?: string; empty?: string;
}) {
  if (!items.length) return <p className="font-display text-sm tier-green">{empty}</p>;
  const maxRisk = Math.max(...items.map((e) => e.atRisk), 1);
  return (
    <ol className="divide-y divide-[var(--crt-mid)]">
      {items.map((e, i) => (
        <li key={e.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-2.5 md:grid-cols-[1.25rem_minmax(0,1fr)_13rem] md:items-center">
          <span className={`font-display text-base ${e.id === 'cash' ? 'tier-red' : 'dim'}`} aria-hidden>{i + 1}</span>
          <div className="min-w-0">
            <h3 className="font-display text-base leading-snug">{e.title}</h3>
            <p className="text-[0.8rem] dim">
              {e.actions[e.actions.length - 1] ?? e.numbers[0]}
              {e.drill.desk !== hideDrillTo && (
                <>
                  {' '}
                  <button onClick={() => onDrill(e.drill.desk)} className="tap ml-1 border border-[var(--crt-line)] px-1.5 font-display text-xs text-[var(--vhs-white)]">
                    {e.drill.label.toUpperCase()} →
                  </button>
                </>
              )}
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
  );
}
