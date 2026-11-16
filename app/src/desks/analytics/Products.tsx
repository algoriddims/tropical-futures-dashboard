import { Fragment, useState } from 'react';
import { formatMoney } from '@/analytics/money';
import * as M from '@/analytics/metrics';
import { formatRange } from '@/analytics/period';
import type { AnalyticsView } from './useAnalytics';

// ── helpers ────────────────────────────────────────────────────────────────

function coverText(c: M.CoverResult | null): string {
  if (!c) return '—';
  switch (c.cover.kind) {
    case 'weeks': return `~${c.cover.weeks < 10 ? c.cover.weeks.toFixed(1) : Math.round(c.cover.weeks)} wk`;
    case 'no-recent-sales': return 'No recent sales';
    case 'out-of-stock': return 'Out of stock';
    case 'not-tracked': return 'Not tracked';
    case 'bundle': return 'Bundle (components)';
  }
}

/** Margin on the subset with recorded cost; "—" without positive costed revenue. */
function marginText(s: M.SalesSlice): string {
  if (s.netSalesWithCost <= 0) return '—';
  return `${(((s.netSalesWithCost - s.cogs) / s.netSalesWithCost) * 100).toFixed(0)}%${s.netSalesWithCost < s.netSales ? '*' : ''}`;
}

const pubText = (p: M.ProductPerf) => (p.publishedAt ? `${new Date(p.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${p.ageDays} d` : 'not published');

type SortKey = 'revenue' | 'change' | 'units' | 'available' | 'cover' | 'age' | 'name';

const SORTS: { key: SortKey; label: string; dir: 1 | -1 }[] = [
  { key: 'revenue', label: 'Net revenue', dir: -1 },
  { key: 'change', label: 'Change', dir: -1 },
  { key: 'units', label: 'Units', dir: -1 },
  { key: 'available', label: 'Sellable', dir: -1 },
  { key: 'cover', label: 'Cover', dir: 1 },
  { key: 'age', label: 'Published', dir: 1 },
  { key: 'name', label: 'Product', dir: 1 },
];

function sortValue(p: M.ProductPerf, k: SortKey): number | string {
  switch (k) {
    case 'revenue': return p.current.netSales;
    case 'change': return p.current.netSales - p.prior.netSales;
    case 'units': return p.current.netItems;
    case 'available': return p.stock.sellable;
    case 'cover': return p.minCover?.cover.kind === 'weeks' ? p.minCover.cover.weeks : p.stock.sellable <= 0 ? -1 : 1e9;
    case 'age': return p.ageDays ?? 1e9;
    case 'name': return p.title.toLowerCase();
  }
}

// ── product table ──────────────────────────────────────────────────────────

export function ProductTable({ v, limit }: { v: AnalyticsView; limit?: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'revenue', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const c = v.a.currency;
  const rows = [...v.products].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    const r = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return r * sort.dir || a.title.localeCompare(b.title);
  });
  const shown = limit ? rows.slice(0, limit) : rows;
  const head = (k: SortKey, label: string, align = 'text-right') => {
    const active = sort.key === k;
    return (
      <th scope="col" className={`px-2 py-1.5 font-normal ${align}`} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          className={`tap ${active ? 'text-[var(--vhs-white)]' : ''}`}
          onClick={() => setSort(active ? { key: k, dir: (sort.dir * -1) as 1 | -1 } : { key: k, dir: SORTS.find((s) => s.key === k)!.dir })}
        >
          {label}{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <caption className="sr-only">Products: sales this period vs prior, stock and cover. Sortable.</caption>
        <thead>
          <tr className="border-b border-[var(--crt-mid)] text-left stat-label">
            {head('name', 'Product', 'text-left')}
            {head('age', 'Published', 'text-left')}
            {head('revenue', `Net revenue ${formatRange(v.cmp.current)}`)}
            {head('change', 'vs prior')}
            {head('units', 'Units (prior)')}
            <th scope="col" className="px-2 py-1.5 text-right font-normal" title="Gross margin on revenue with recorded cost; * = some revenue has no cost">Margin</th>
            {head('available', 'Sellable now')}
            <th scope="col" className="px-2 py-1.5 text-left font-normal">Sizes out</th>
            {head('cover', 'Shortest cover')}
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => {
            const isOpen = open === p.productId;
            return (
              <Fragment key={p.productId + (p.inCatalog ? '' : '-x')}>
                <tr className="border-b border-[var(--crt-mid)] align-top">
                  <th scope="row" className="max-w-[18rem] px-2 py-2 text-left font-normal">
                    <button
                      className="tap text-left"
                      aria-expanded={p.variants.length ? isOpen : undefined}
                      disabled={!p.variants.length}
                      onClick={() => setOpen(isOpen ? null : p.productId)}
                    >
                      <span aria-hidden className="dim">{p.variants.length ? (isOpen ? '▾ ' : '▸ ') : '  '}</span>
                      <span className="warm">{p.title}</span>
                    </button>
                    <div className="stat-sub">{p.productType}{!p.inCatalog && ' · not in active catalog'}</div>
                  </th>
                  <td className="px-2 py-2 dim">{pubText(p)}</td>
                  <td className="px-2 py-2 text-right font-display">{formatMoney({ currency: c, minor: p.current.netSales })}</td>
                  <td className={`px-2 py-2 text-right ${p.current.netSales - p.prior.netSales > 0 ? 'tier-green' : p.current.netSales - p.prior.netSales < 0 ? 'tier-red' : 'dim'}`}>
                    {formatMoney({ currency: c, minor: p.current.netSales - p.prior.netSales }, { signed: true })}
                  </td>
                  <td className="px-2 py-2 text-right">{p.current.netItems} <span className="dim">({p.prior.netItems})</span></td>
                  <td className="px-2 py-2 text-right">{marginText(p.current)}</td>
                  <td className="px-2 py-2 text-right">
                    {p.stock.sellable}
                    {p.stock.oversold > 0 && <div className="stat-sub tier-amber">oversold {p.stock.oversold}</div>}
                    {p.stock.incoming > 0 && <div className="stat-sub">+{p.stock.incoming} incoming</div>}
                  </td>
                  <td className="px-2 py-2">{p.sizesTotal ? (p.sizesOut.length ? <span className="tier-amber">{p.sizesOut.length} of {p.sizesTotal}: {p.sizesOut.join(', ')}</span> : <span className="dim">none</span>) : <span className="dim">—</span>}</td>
                  <td className="px-2 py-2 text-right">{p.stock.sellable <= 0 && p.variants.length ? 'Out of stock' : coverText(p.minCover ?? (p.variants.length ? { cover: { kind: 'no-recent-sales' }, status: 'valid', unitsInWindow: 0, weeklyVelocity: 0, flags: [] } : null))}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-[var(--crt-mid)]">
                    <td colSpan={9} className="px-2 pb-3">
                      <table className="w-full text-[0.78rem]">
                        <caption className="sr-only">Variants of {p.title}</caption>
                        <thead>
                          <tr className="text-left stat-label">
                            <th scope="col" className="py-1 font-normal">Variant</th>
                            <th scope="col" className="py-1 text-right font-normal">Sellable</th>
                            <th scope="col" className="py-1 text-right font-normal">On hand</th>
                            <th scope="col" className="py-1 text-right font-normal">Committed</th>
                            <th scope="col" className="py-1 text-right font-normal">Incoming</th>
                            <th scope="col" className="py-1 text-right font-normal">Units, period</th>
                            <th scope="col" className="py-1 text-right font-normal">Units, 28 d to stock read</th>
                            <th scope="col" className="py-1 text-right font-normal">Cover (estimate)</th>
                            <th scope="col" className="py-1 pl-2 font-normal">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.variants.map((x) => (
                            <tr key={x.variant.variantId} className="border-t border-[var(--crt-mid)]">
                              <th scope="row" className="py-1 text-left font-normal">{x.size ?? x.color ?? x.variant.variantTitle}{x.variant.sku ? <span className="dim"> · {x.variant.sku}</span> : null}</th>
                              <td className="py-1 text-right">{x.stock.sellable}{x.stock.oversold ? <span className="tier-amber"> (−{x.stock.oversold})</span> : null}</td>
                              <td className="py-1 text-right">{x.stock.onHand}</td>
                              <td className="py-1 text-right">{x.stock.committed}</td>
                              <td className="py-1 text-right">{x.stock.incoming}</td>
                              <td className="py-1 text-right">{x.current.netItems}</td>
                              <td className="py-1 text-right">{x.cover.unitsInWindow}</td>
                              <td className="py-1 text-right">{coverText(x.cover)}</td>
                              <td className="py-1 pl-2 stat-sub">{[...x.cover.flags, ...(x.variant.unitCost === null ? ['no unit cost'] : [])].join(' · ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {limit && rows.length > limit && <p className="stat-sub mt-1">SHOWING {limit} OF {rows.length} PRODUCTS — ALL IN INVENTORY (I).</p>}
      <p className="stat-sub mt-1">* SOME REVENUE HAS NO RECORDED COST; MARGIN IS ON THE COSTED PART. UNITS ARE NET OF RETURNS. STOCK AND COVER ARE AS OF THE INVENTORY READ, ALL CHANNELS.</p>
    </div>
  );
}

// ── size availability matrix ───────────────────────────────────────────────

export function SizeMatrix({ v, lowAt = 2 }: { v: AnalyticsView; lowAt?: number }) {
  const sized = v.products.filter((p) => p.inCatalog && p.variants.some((x) => x.size));
  // Spellings of one size share a column; a product sold in several colours
  // gets one row per colour, so no colour's stock hides behind another's.
  const sizes = M.sortSizes(sized.flatMap((p) => p.variants.map((x) => x.size).filter((s): s is string => !!s).map(M.sizeKey)));
  const rows = [...sized]
    .sort((a, b) => b.current.netSales - a.current.netSales || b.stock.sellable - a.stock.sellable || a.title.localeCompare(b.title))
    .flatMap((p) => {
      const colours = [...new Set(p.variants.filter((x) => x.size).map((x) => x.color))];
      return colours.map((c) => ({ p, colour: c, variants: p.variants.filter((x) => x.size && x.color === c) }));
    });
  const others = v.products.filter((p) => p.inCatalog && p.variants.length && !p.variants.some((x) => x.size));

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 stat-sub" aria-label="Legend">
        <li><strong className="text-[var(--vhs-white)]">5</strong> = units sellable</li>
        <li><strong className="tier-amber">LOW 2</strong> = {lowAt} or fewer (a heuristic, no lead times set)</li>
        <li><strong className="tier-red">OUT</strong> = none sellable · <strong className="tier-red">OUT −1</strong> = oversold</li>
        <li><strong>·</strong> = size not offered</li>
        <li>★ = sold in the 28 days before the stock read</li>
      </ul>
      <div className="max-h-[70vh] overflow-auto border border-[var(--crt-mid)]">
        <table className="w-full min-w-[560px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <caption className="sr-only">Units sellable by product, colour and size, as of the inventory read</caption>
          <thead className="sticky top-0 bg-[var(--crt-dark)]">
            <tr className="stat-label">
              <th scope="col" className="sticky left-0 bg-[var(--crt-dark)] px-2 py-1.5 text-left font-normal">Product</th>
              {sizes.map((s) => <th key={s} scope="col" className="px-2 py-1.5 text-center font-normal">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, colour, variants }) => (
              <tr key={`${p.productId}|${colour ?? ''}`} className="border-t border-[var(--crt-mid)]">
                <th scope="row" className="sticky left-0 max-w-[9rem] bg-[var(--crt-dark)] px-2 py-1.5 text-left font-normal sm:max-w-[16rem]">
                  <span className="warm">{p.title}</span>{colour && <span className="dim"> · {colour}</span>}
                </th>
                {sizes.map((s) => {
                  const xs = variants.filter((vv) => M.sizeKey(vv.size!) === s);
                  if (!xs.length) return <td key={s} className="px-2 py-1.5 text-center dim" aria-label="not offered">·</td>;
                  const sold = xs.some((x) => x.cover.unitsInWindow > 0);
                  const n = xs.reduce((t, x) => t + x.stock.sellable, 0);
                  const oversold = xs.reduce((t, x) => t + x.stock.oversold, 0);
                  const label = n <= 0 ? `OUT${oversold ? ` −${oversold}` : ''}` : n <= lowAt ? `LOW ${n}` : String(n);
                  return (
                    <td key={s} title={xs.map((x) => x.size).join(' + ')} className={`px-2 py-1.5 text-center ${n <= 0 ? 'tier-red' : n <= lowAt ? 'tier-amber' : ''}`}>
                      {label}{sold && <span aria-label=", sold recently"> ★</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {others.length > 0 && (
        <div>
          <h3 className="stat-label">Products without sizes (colour or single variant)</h3>
          <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 text-[0.8rem] sm:grid-cols-2">
            {others.map((p) => (
              <li key={p.productId} className="flex justify-between gap-2">
                <span className="warm">{p.title}{p.variants[0].color ? <span className="dim"> · {p.variants.map((x) => x.color).join(', ')}</span> : null}</span>
                <span className={p.stock.sellable <= 0 ? 'tier-red' : p.stock.sellable <= lowAt ? 'tier-amber' : ''}>
                  {p.stock.sellable <= 0 ? 'OUT' : p.stock.sellable}{p.variants.some((x) => x.cover.unitsInWindow > 0) ? ' ★' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="stat-sub">STOCK AS OF {new Date(v.a.inventoryAsOf).toLocaleString()} ACROSS {[...new Set(v.a.variants.flatMap((x) => x.inventory.map((l) => l.locationName)))].join(' + ').toUpperCase()} — CURRENT STOCK, NOT STOCK DURING THE SELECTED PERIOD.</p>
    </div>
  );
}
