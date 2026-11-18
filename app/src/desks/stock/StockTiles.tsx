// Tier 1 of the Stock desk: four numbers, each with one line of context.
// Sales at risk in the next 4 weeks · the next size to run out · stock on the
// way · the money tied up in stock.
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { formatMoney } from '@/analytics/money';
import type { Exception } from '@/analytics/metrics';
import type { Runway, ShelfValue, StockAge } from '@/analytics/stock';
import { BAND_COLOR, BAND_LABEL } from './bands';
import type { Ymd } from '@/analytics/period';
import { unlinkedRunUnits } from '@/game/production';
import { plural } from '@/game/format';
import type { AnalyticsView } from '../analytics/useAnalytics';

const day = (d: Ymd) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();

function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <section className="window min-w-0" aria-label={label}>
      <div className="window-body flex h-full flex-col gap-1">
        <h2 className="stat-label">{label}</h2>
        {children}
        {sub && <div className="stat-sub mt-auto">{sub}</div>}
      </div>
    </section>
  );
}

const Big = ({ children, tone = '' }: { children: ReactNode; tone?: string }) => <span className={`font-display text-4xl leading-tight ${tone}`}>{children}</span>;

export function StockTiles({ v, r, shelf, stock, age }: { v: AnalyticsView; r: Runway | null; shelf: ShelfValue; stock: Exception[]; age: StockAge | null }) {
  const { data } = useTerminal();
  const fm = (minor: number) => formatMoney({ currency: v.a.currency, minor });

  // 1. sales at risk — the same estimate as the action list
  const risk = stock.reduce((n, e) => n + e.atRisk, 0);
  const biggest = [...stock].sort((a, b) => b.atRisk - a.atRisk)[0];
  const riskTile = (
    <Tile label="SALES AT RISK · NEXT 4 WEEKS" sub={biggest && biggest.atRisk > 0
      ? <>MOSTLY {biggest.affected.toUpperCase()} ({fm(biggest.atRisk)}){stock.length > 1 ? ` · ${plural(stock.length, 'STOCK ISSUE')}` : ''}</>
      : stock.length ? `${plural(stock.length, 'STOCK ISSUE')}, NO SALES ESTIMATE` : 'AT THE RECENT PACE, NOTHING SELLING RUNS SHORT'}>
      <Big tone={risk > 0 ? 'tier-red' : ''}>{risk > 0 ? `≈ ${fm(risk)}` : '$0'}</Big>
    </Tile>
  );

  // 2. next to run out (still in stock now)
  const next = r?.rows.filter((x) => x.sellable > 0 && x.firstShortDay !== null).sort((a, b) => a.runsOutOn.localeCompare(b.runsOutOn))[0];
  const outNow = r?.rows.filter((x) => x.sellable <= 0).length ?? 0;
  const nextTile = (
    <Tile label="RUNS OUT NEXT" sub={next
      ? <>{next.product.toUpperCase()}{next.variant ? ` · ${next.variant.toUpperCase()}` : ''} · {next.sellable} LEFT{outNow ? ` · ${outNow} SELLING ${outNow === 1 ? 'SIZE' : 'SIZES'} ALREADY OUT` : ''}</>
      : outNow ? `${outNow} SELLING ${outNow === 1 ? 'SIZE IS' : 'SIZES ARE'} OUT NOW` : r ? `NOTHING SELLING RUNS OUT IN ${r.horizonDays / 7} WEEKS` : 'NEEDS THE BUSINESS TIMEZONE'}>
      <div className="flex flex-wrap items-baseline gap-2">
        <Big>{next ? `~${day(next.runsOutOn)}` : '—'}</Big>
        {next && <span className="badge tier-amber">EST.</span>}
      </div>
      {next && (() => {
        // stock already on the way: say when it lands and how long the gap is; otherwise the reorder-by date
        const gap = next.segments.find((x) => x.kind === 'short');
        if (next.arrivals.length) {
          const a = next.arrivals[0];
          return <span className={`stat-sub ${gap ? 'tier-red' : ''}`}>+{a.units} ARRIVE ~{day(a.date)}{gap ? ` · ~${plural(gap.to - gap.from, 'DAY')} WITHOUT STOCK` : ' · IN TIME'}</span>;
        }
        if (!next.reorderBy) return <span className="stat-sub">SET A LEAD TIME FOR A REORDER-BY DATE</span>;
        const late = next.reorderBy <= (r?.asOf ?? '');
        return <span className={`stat-sub ${late ? 'tier-red' : ''}`}>{late ? 'ORDER NOW — IT WON\'T LAND BEFORE STOCK RUNS OUT' : `REORDER BY ${day(next.reorderBy)}`}</span>;
      })()}
    </Tile>
  );

  // 3. on the way — dated, counted entries for products in the catalog
  const asOf = r?.asOf ?? '';
  const known = new Set(v.products.filter((p) => p.inCatalog).map((p) => p.productId));
  const coming = v.plan.incoming.filter((e) => e.expectedDate > asOf && known.has(e.productId));
  const units = coming.reduce((n, e) => n + e.units, 0);
  const first = [...coming].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];
  const unlinked = unlinkedRunUnits(data?.productionRuns ?? []);
  const wayTile = (
    <Tile label="ON THE WAY" sub={<>
      {first ? `NEXT ~${day(first.expectedDate)}` : 'NOTHING DATED'}
      {unlinked > 0 && <span className="block">+{unlinked.toLocaleString('en-US')} MORE IN PRODUCTION, NOT LINKED TO A SHOPIFY PRODUCT — NOT COUNTED</span>}
    </>}>
      <Big>{plural(units, 'UNIT')}</Big>
    </Tile>
  );

  // 4. money in stock, split by age on the webstore
  const archive = age?.bands.find((x) => x.band === 'ARCHIVE');
  const shelfTile = (
    <Tile label="STOCK AT COST" sub={<>
      {plural(shelf.units, 'UNIT')}
      {age && archive && age.atCost > 0 && <> · <span className="text-[var(--vhs-white)]">{Math.round((archive.atCost / age.atCost) * 100)}%</span> IN ARCHIVE (12 MO+ ON THE WEBSTORE)</>}
      {shelf.unitsNoCost > 0 && <> · {shelf.unitsNoCost} WITHOUT A COST</>}
    </>}>
      <Big>{fm(shelf.atCost)}</Big>
      {age && age.atCost > 0 && (
        <span className="flex h-2 w-full overflow-hidden rounded-full" role="img"
          aria-label={`At cost by age: ${age.bands.filter((x) => x.atCost > 0).map((x) => `${BAND_LABEL[x.band].toLowerCase()} ${Math.round((x.atCost / age.atCost) * 100)}%`).join(', ')}`}>
          {age.bands.filter((x) => x.atCost > 0).map((x) => <span key={x.band} style={{ width: `${(x.atCost / age.atCost) * 100}%`, background: BAND_COLOR[x.band] }} />)}
        </span>
      )}
    </Tile>
  );

  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">{riskTile}{nextTile}{wayTile}{shelfTile}</div>;
}
