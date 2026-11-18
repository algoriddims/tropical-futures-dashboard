import { useMemo, useState } from 'react';
import { useAnalytics } from './analytics/useAnalytics';
import { ProductTable, SizeMatrix } from './analytics/Products';
import { StockPlanPanel } from './analytics/StockPlanPanel';
import { ChannelFilterControl } from './analytics/Performance';
import { formatRange } from '@/analytics/period';
import { runway, shelfValue, sizeCurves, stockAge, AGE_BANDS } from '@/analytics/stock';
import type { Exception } from '@/analytics/metrics';
import { AgeChart } from './stock/StockAge';
import { BAND_COLOR, BAND_LABEL } from './stock/bands';
import type { DeskKey } from '@/terminal/desks';
import { ActionList } from './analytics/ActionList';
import { Fold } from './overview/OverviewCharts';
import { StockTiles } from './stock/StockTiles';
import { RunwayChart, ShelfChart, SizeCurveChart } from './stock/StockCharts';
import { useTerminal } from '@/terminal/useTerminal';
import { rideState, sellThrough, hasSellThrough, daysOfStock } from '@/game/engine';
import type { Product } from '@/game/types';
import { money, pct, plural } from '@/game/format';
import { formatMoney } from '@/analytics/money';

type SortKey = 'revenue' | 'units' | 'stock' | 'sellthrough';

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'revenue', label: 'REVENUE 7D', hint: 'U' },
  { key: 'units', label: 'UNITS 7D', hint: 'V' },
  { key: 'stock', label: 'STOCK RISK', hint: 'S' },
  { key: 'sellthrough', label: 'SELL-THROUGH', hint: 'T' },
];

const STATE_TONE: Record<string, string> = {
  // QUIET is the normal pace for most lines here, not a warning
  THRIVING: 'tier-green', NORMAL: 'tier-green', QUIET: 'dim', CLOSED: 'tier-amber',
};

// A sellout's tone follows intent: a finished limited run is a success.
function stateTone(state: string, p: Product): string {
  if (state !== 'SOLD OUT') return STATE_TONE[state];
  return p.restockPolicy === 'LIMITED' ? 'palm' : p.restockPolicy === 'REPLENISH' ? 'tier-red' : 'tier-amber';
}

// The Stock desk, in four tiers like the overview: where stock stands, what to
// do about it, why (when each size runs out, which sizes sell, where the money
// in stock sits), and the full tables folded away. Without variant-level
// analytics (sample data, older syncs): the original list.
export default function InventoryDesk() {
  const an = useAnalytics();
  const { data, setDesk } = useTerminal();
  const [view, setView] = useState<'products' | 'sizes'>('products');
  const v = an.kind === 'ok' ? an.view : null;
  const r = useMemo(() => (v ? runway(v.a, v.products, v.plan) : null), [v]);
  const curves = useMemo(() => (v ? sizeCurves(v.a) : null), [v]);
  const shelf = useMemo(() => (v ? shelfValue(v.a) : null), [v]);
  const timeless = data?.timelessProducts;
  const age = useMemo(() => (v ? stockAge(v.a, timeless ?? []) : null), [v, timeless]);
  if (!v || !curves || !shelf) return <LegacyInventory note={an.kind === 'none' ? undefined : 'BUSINESS TIMEZONE NOT CONFIGURED — PERIOD SALES UNAVAILABLE.'} />;
  const stock: Exception[] = [...v.exceptions.filter((e) => e.drill.desk === 'i')];
  // designs reaching 12 months on the webstore within 30 days: the sample-sale decision comes up
  if (age?.archiveSoon.length) {
    const xs = age.archiveSoon;
    const cost = xs.reduce((n, x) => n + x.atCost, 0);
    stock.push({
      id: 'archive-soon', severity: 3,
      title: `${xs.length === 1 ? xs[0].title : plural(xs.length, 'design')} reach${xs.length === 1 ? 'es' : ''} 12 months on the webstore by ${new Date(`${xs[xs.length - 1].nextBandOn}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`,
      affected: xs.map((x) => x.title).join(', '),
      numbers: xs.map((x) => `${x.title}: ${plural(x.units, 'unit')}, ${x.atCost > 0 ? `${formatMoney({ currency: v.a.currency, minor: x.atCost })} at cost` : 'no cost recorded'}, archive from ${x.nextBandOn}`),
      rule: `A design moves to archive (sample sale) after ${AGE_BANDS[3].from} days on the webstore, counted from its Shopify publish date. Timeless designs are left out.`,
      drill: { desk: 'i', label: 'Stock' }, evidence: 'sufficient', atRisk: 0,
      actions: [`Last call: decide sample sale or storage for ${plural(xs.reduce((n, x) => n + x.units, 0), 'unit')}${cost > 0 ? ` (${formatMoney({ currency: v.a.currency, minor: cost })} at cost)` : ''}${xs.some((x) => x.unitsNoCost > 0) ? ', some with no cost recorded' : ''} — or mark a design Timeless`],
    });
  }
  const shelfColors = age ? {
    of: (id: string) => { const r = age.rows.find((x) => x.productId === id); return r ? { color: BAND_COLOR[r.band], label: BAND_LABEL[r.band].replace(' · SAMPLE SALE', '') } : null; },
    legend: age.bands.filter((b) => b.units > 0).map((b) => ({ color: BAND_COLOR[b.band], label: BAND_LABEL[b.band] })),
  } : undefined;
  return (
    <div className="h-full overflow-y-auto p-2 space-y-3">
      <section aria-labelledby="st-1" className="space-y-2">
        <h2 id="st-1" className="stat-label px-1">1 · WHERE STOCK STANDS <span className="dim">· AS OF {new Date(v.a.inventoryAsOf).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()}</span></h2>
        <StockTiles v={v} r={r} shelf={shelf} stock={stock} age={age} />
      </section>

      <section className="window" aria-labelledby="st-2">
        <div className="window-head">
          <h2 id="st-2" className="wh-title">2 · DO THIS WEEK</h2>
          <span className="wh-note">{stock.length ? `${plural(stock.length, 'STOCK ISSUE')} · MOST SALES AT RISK FIRST` : ''}</span>
        </div>
        <div className="window-body">
          <ActionList items={stock} currency={v.a.currency} onDrill={(d) => setDesk(d as DeskKey)} hideDrillTo="i"
            empty="NO SELLING SIZE IS OUT OR RUNNING LOW AT THE RECENT PACE." />
        </div>
      </section>

      <section aria-labelledby="st-3" className="space-y-2">
        <h2 id="st-3" className="stat-label px-1">3 · WHY</h2>
        <RunwayChart r={r} currency={v.a.currency} />
        <AgeChart age={age} currency={v.a.currency} />
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <SizeCurveChart c={curves} />
          <ShelfChart v={shelf} currency={v.a.currency} colors={shelfColors} />
        </div>
      </section>

      <section aria-labelledby="st-4" className="space-y-2">
        <h2 id="st-4" className="stat-label px-1">4 · DETAIL</h2>
        <Fold id="stock-products" title="PRODUCTS AND SIZES — TABLES">
          <div className="window">
            <div className="window-head flex-wrap">
              <h3 className="wh-title">PRODUCTS & SIZES</h3>
              <span className="wh-note flex-wrap">
                <span role="group" aria-label="View" className="flex gap-1">
                  {(['products', 'sizes'] as const).map((k) => (
                    <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
                      className={`tap border px-2 py-0.5 font-display text-sm ${view === k ? 'border-[var(--q-strong,var(--phosphor))] text-[var(--vhs-white)]' : 'border-[var(--crt-line)] dim'}`}>
                      {k === 'products' ? 'PRODUCTS' : 'SIZE AVAILABILITY'}
                    </button>
                  ))}
                </span>
                {view === 'products' && <ChannelFilterControl />}
              </span>
            </div>
            <div className="window-body space-y-2">
              <p className="stat-sub">
                {view === 'products'
                  ? `SALES: ${formatRange(v.cmp.current)} VS ${formatRange(v.cmp.prior)} (PERIOD AND CHANNEL FILTERS APPLY). STOCK AND COVER: AS OF ${new Date(v.a.inventoryAsOf).toLocaleString()}, ALL CHANNELS. CUMULATIVE DROP SELL-THROUGH IS UNAVAILABLE — NO DROP MAPPING OR RECEIPT HISTORY; "PUBLISHED" IS THE SHOPIFY PUBLISH DATE, NOT A DROP LAUNCH.`
                  : 'WHICH SIZES CAN BE BOUGHT RIGHT NOW. FILTERS DON\'T APPLY — THIS IS THE CURRENT STOCK READ.'}
              </p>
              {view === 'products' ? <ProductTable v={v} /> : <SizeMatrix v={v} />}
            </div>
          </div>
        </Fold>
        <Fold id="stock-incoming" title="STOCK ON THE WAY — ADD OR REMOVE">
          <StockPlanPanel v={v} />
        </Fold>
      </section>
    </div>
  );
}

function LegacyInventory({ note }: { note?: string }) {
  const { data, metrics } = useTerminal();
  const [sort, setSort] = useState<SortKey>('revenue');
  if (!data || !metrics) return null;

  const rows = [...data.products].sort((a, b) => {
    if (sort === 'revenue') return b.sold7d * b.price - a.sold7d * a.price;
    if (sort === 'units') return b.sold7d - a.sold7d;
    if (sort === 'stock') return daysOfStock(a) - daysOfStock(b);
    return sellThrough(b) - sellThrough(a);
  });

  const totals = {
    stock: data.products.reduce((s, p) => s + p.stock, 0),
    cost: metrics.inventoryCost,
    retail: data.products.reduce((s, p) => s + p.stock * p.price, 0),
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      {note && <p className="stat-sub tier-amber pb-1">{note}</p>}
      <div className="window flex min-h-0 flex-1 flex-col">
        <div className="window-head flex-wrap">
          <h2 className="wh-title">INVENTORY</h2>
          <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Sort by">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={`font-display text-sm px-1.5 border ${
                  sort === s.key ? 'border-[var(--palm)] palm' : 'border-[var(--crt-line)] dim hover:text-[var(--vhs-white)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[860px] text-[0.8rem]">
            <thead className="sticky top-0 bg-[var(--crt-dark)]">
              <tr className="border-b border-[var(--crt-mid)] text-left font-display text-sm dim">
                <th className="px-3 py-1.5 font-normal">PRODUCT</th>
                <th className="px-2 py-1.5 font-normal" title="SHOPIFY PRODUCT TYPE UNTIL DROPS ARE RECORDED">TYPE</th>
                <th className="px-2 py-1.5 text-right font-normal">RETAIL</th>
                <th className="px-2 py-1.5 text-right font-normal">COST</th>
                <th className="px-2 py-1.5 text-right font-normal">MARGIN</th>
                <th className="px-2 py-1.5 text-right font-normal">STOCK</th>
                <th className="px-2 py-1.5 text-right font-normal">SOLD 7D</th>
                <th className="px-2 py-1.5 text-right font-normal">SOLD 12 MO</th>
                <th className="px-2 py-1.5 text-right font-normal" title="UNITS SOLD ÷ (SOLD + IN STOCK), 12 MONTHS">SELL-THRU</th>
                <th className="px-2 py-1.5 text-right font-normal">DAYS LEFT</th>
                <th className="px-3 py-1.5 text-right font-normal">STATE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = rideState(p);
                const dos = daysOfStock(p);
                const margin = p.unitCost !== null && p.price > 0 ? (p.price - p.unitCost) / p.price : null;
                return (
                  <tr key={p.id} className="border-b border-[var(--crt-mid)] hover:bg-[var(--crt-mid)]">
                    <td className="px-3 py-2 warm">{p.name}</td>
                    <td className="px-2 py-2 dim text-[0.75rem]">{p.drop}</td>
                    <td className="px-2 py-2 text-right font-display text-base text-[var(--vhs-white)]">{money(p.price, { cents: p.price % 1 !== 0 })}</td>
                    <td className="px-2 py-2 text-right dim">{p.unitCost !== null ? money(p.unitCost, { cents: p.unitCost % 1 !== 0 }) : '—'}</td>
                    <td className={`px-2 py-2 text-right ${margin !== null && margin < 0 ? 'tier-red' : 'water'}`} title={margin !== null && margin < 0 ? 'COST IS ABOVE PRICE — CHECK THE COST IN SHOPIFY' : undefined}>
                      {margin !== null ? `${pct(margin * 100)}${margin < 0 ? ' ▲' : ''}` : '—'}
                    </td>
                    <td className={`px-2 py-2 text-right font-display text-base ${p.stock === 0 ? (p.restockPolicy === 'LIMITED' ? 'dim' : 'tier-red') : p.stock < 10 ? 'tier-amber' : 'warm'}`}>
                      {p.stock}
                    </td>
                    <td className="px-2 py-2 text-right warm">
                      {p.sold7d}
                      <span className={`ml-1 text-[0.68rem] ${p.sold7d === p.soldPrev7d ? 'dim' : p.sold7d > p.soldPrev7d ? 'tier-green' : 'tier-red'}`}>
                        {p.sold7d === p.soldPrev7d ? '–' : p.sold7d > p.soldPrev7d ? '▲' : '▼'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right dim">{p.soldTotal}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-display text-base palm">{hasSellThrough(p) ? `${Math.round(sellThrough(p) * 100)}%` : '—'}</span>
                    </td>
                    <td className={`px-2 py-2 text-right ${dos < 5 ? 'tier-red' : dos < 14 ? 'tier-amber' : 'dim'}`}>
                      {dos === Infinity ? '—' : `${Math.floor(dos)}D`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.tracked === false ? (
                        <span className="badge dim" title="SHOPIFY DOESN'T TRACK STOCK FOR THIS PRODUCT">NOT TRACKED</span>
                      ) : p.stock === 0 && p.soldTotal === 0 && !p.restockPolicy ? (
                        <span className="badge dim" title="NO STOCK AND NO SALES IN 12 MONTHS — ARCHIVE, HIDE OR SET A RESTOCK POLICY">INACTIVE</span>
                      ) : (
                        <span className={`badge ${stateTone(st, p)}`} title={p.restockPolicy ? `RESTOCK POLICY: ${p.restockPolicy}` : 'RESTOCK POLICY NOT SET'}>
                          {st === 'SOLD OUT' && p.restockPolicy === 'LIMITED' ? 'SOLD OUT ✓' : st}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--crt-mid)] px-3 py-1.5 font-display text-base">
          <span className="dim">TOTALS · {plural(data.products.length, 'PRODUCT')}</span>
          <span className="flex flex-wrap gap-x-4">
            <span className="warm">{plural(totals.stock, 'UNIT')}</span>
            <span className="tier-red">
              {money(totals.cost)} AT COST
              {metrics.inventoryUnitsWithoutCost > 0 && <span className="dim"> (EXCL. {plural(metrics.inventoryUnitsWithoutCost, 'UNIT')} WITHOUT COST)</span>}
            </span>
            <span className="water">{money(totals.retail)} AT RETAIL</span>
          </span>
        </div>
      </div>
    </div>
  );
}
