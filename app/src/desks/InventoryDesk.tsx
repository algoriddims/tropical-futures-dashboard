import { useState } from 'react';
import { useTerminal } from '@/terminal/TerminalContext';
import { rideState, sellThrough, daysOfStock } from '@/game/engine';
import type { Product } from '@/game/types';

type SortKey = 'revenue' | 'units' | 'stock' | 'sellthrough';

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'revenue', label: 'REVENUE', hint: 'U' },
  { key: 'units', label: 'UNITS 7D', hint: 'V' },
  { key: 'stock', label: 'STOCK RISK', hint: 'S' },
  { key: 'sellthrough', label: 'SELL-THROUGH', hint: 'T' },
];

const STATE_TONE: Record<string, string> = {
  THRIVING: 'tier-green', NORMAL: 'tier-green', QUIET: 'tier-amber', CLOSED: 'tier-amber',
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
    cost: data.products.reduce((s, p) => s + p.stock * p.unitCost, 0),
    retail: data.products.reduce((s, p) => s + p.stock * p.price, 0),
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="window flex min-h-0 flex-1 flex-col">
        <div className="window-head">
          <span className="wh-title">RIDES / INVENTORY</span>
          <span className="flex items-center gap-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`font-display text-sm px-1.5 border ${
                  sort === s.key ? 'border-[var(--palm)] palm' : 'border-[var(--crt-line)] dim hover:text-[var(--vhs-white)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-[0.78rem]">
            <thead className="sticky top-0 bg-[var(--crt-dark)]">
              <tr className="border-b border-[var(--crt-mid)] text-left font-display text-sm dim">
                <th className="px-3 py-1.5 font-normal">RIDE</th>
                <th className="px-2 py-1.5 font-normal">DROP</th>
                <th className="px-2 py-1.5 text-right font-normal">RETAIL</th>
                <th className="px-2 py-1.5 text-right font-normal">COST</th>
                <th className="px-2 py-1.5 text-right font-normal">MARGIN</th>
                <th className="px-2 py-1.5 text-right font-normal">STOCK</th>
                <th className="px-2 py-1.5 text-right font-normal">SOLD 7D</th>
                <th className="px-2 py-1.5 text-right font-normal">SELL-THRU</th>
                <th className="px-2 py-1.5 text-right font-normal">DAYS LEFT</th>
                <th className="px-3 py-1.5 text-right font-normal">STATE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = rideState(p);
                const dos = daysOfStock(p);
                const margin = (p.price - p.unitCost) / p.price;
                return (
                  <tr key={p.id} className="border-b border-[var(--crt-mid)] hover:bg-[var(--crt-mid)]">
                    <td className="px-3 py-2 warm">{p.name}</td>
                    <td className="px-2 py-2 dim text-[0.7rem]">{p.drop}</td>
                    <td className="px-2 py-2 text-right font-display text-base text-[var(--vhs-white)]">${p.price}</td>
                    <td className="px-2 py-2 text-right dim">${p.unitCost}</td>
                    <td className="px-2 py-2 text-right water">{Math.round(margin * 100)}%</td>
                    <td className={`px-2 py-2 text-right font-display text-base ${p.stock === 0 ? (p.restockPolicy === 'LIMITED' ? 'dim' : 'tier-red') : p.stock < 10 ? 'tier-amber' : 'warm'}`}>
                      {p.stock}
                    </td>
                    <td className="px-2 py-2 text-right warm">
                      {p.sold7d}
                      <span className={`ml-1 text-[0.68rem] ${p.sold7d >= p.soldPrev7d ? 'tier-green' : 'tier-red'}`}>
                        {p.sold7d >= p.soldPrev7d ? '▲' : '▼'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-display text-base palm">{Math.round(sellThrough(p) * 100)}%</span>
                    </td>
                    <td className={`px-2 py-2 text-right ${dos < 5 ? 'tier-red' : dos < 14 ? 'tier-amber' : 'dim'}`}>
                      {dos === Infinity ? '—' : `${Math.floor(dos)}D`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`badge ${stateTone(st, p)}`} title={p.restockPolicy ? `RESTOCK POLICY: ${p.restockPolicy}` : 'RESTOCK POLICY NOT SET'}>
                        {st === 'SOLD OUT' && p.restockPolicy === 'LIMITED' ? 'SOLD OUT ✓' : st}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--crt-mid)] px-3 py-1.5 font-display text-base">
          <span className="dim">TOTALS · {data.products.length} RIDES</span>
          <span className="flex gap-4">
            <span className="warm">{totals.stock.toLocaleString()} UNITS</span>
            <span className="tier-red">${totals.cost.toLocaleString()} @ COST</span>
            <span className="water">${totals.retail.toLocaleString()} @ RETAIL</span>
          </span>
        </div>
      </div>
    </div>
  );
}
