import { useState } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import { rideState, sellThrough, hasSellThrough, daysOfStock } from '@/game/engine';
import type { Product } from '@/game/types';
import { money, pct, plural } from '@/game/format';

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

export default function InventoryDesk() {
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
