// Stock age: how long each design has been on the webstore, in four bands
// (under 6 months, 6–9, 9–12, 12+ = archive / sample sale) plus Timeless for
// designs the owner re-releases. Shown as shares of units, of money at cost
// and of the last 90 days' sales, then product by product with the Timeless
// toggle and the sample-sale list.
import { useTerminal } from '@/terminal/useTerminal';
import { formatMoney } from '@/analytics/money';
import type { Ymd } from '@/analytics/period';
import type { AgeBand, AgeRow, StockAge } from '@/analytics/stock';
import { AGE_BANDS } from '@/analytics/stock';
import { BAND_COLOR, BAND_LABEL } from './bands';
import { plural } from '@/game/format';
import { Card } from './StockCharts';

const BAND_RANGE: Record<AgeBand, string> = {
  ...Object.fromEntries(AGE_BANDS.map((b) => [b.band, b.range.toUpperCase()])) as Record<'NEW' | 'AGED' | 'LAST_CALL' | 'ARCHIVE', string>,
  TIMELESS: 'RE-RELEASED, DOESN\'T AGE', UNKNOWN: 'NO PUBLISH DATE — AGE UNKNOWN',
};

const day = (d: Ymd) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
const months = (days: number) => (days < 60 ? `${days} D` : `${Math.floor(days / 30.44)} MO`);

function StackBar({ label, total, parts, fmt }: { label: string; total: number; parts: { band: AgeBand; value: number }[]; fmt: (n: number) => string }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="stat-label">{label} <span className="text-[var(--vhs-white)]">{fmt(total)}</span></span>
      <span className="flex h-6 w-full overflow-hidden rounded-sm" role="img"
        aria-label={`${label}: ${shown.map((p) => `${BAND_LABEL[p.band].toLowerCase()} ${Math.round((p.value / total) * 100)}%`).join(', ')}`}>
        {total > 0 && shown.map((p) => {
          const pct = (p.value / total) * 100;
          return (
            <span key={p.band} className="flex items-center justify-center overflow-hidden text-[0.7rem] font-display" title={`${BAND_LABEL[p.band]}: ${fmt(p.value)} (${Math.round(pct)}%)`}
              style={{ width: `${pct}%`, background: BAND_COLOR[p.band], color: p.band === 'AGED' ? '#1b1b1b' : 'var(--on-phase)' }}>
              {pct >= 9 ? `${Math.round(pct)}%` : ''}
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function AgeChart({ age, currency }: { age: StockAge | null; currency: string }) {
  const { data, updateData } = useTerminal();
  if (!age) return <Card title="STOCK BY AGE"><p className="stat-sub">UNAVAILABLE — BUSINESS TIMEZONE NOT CONFIGURED.</p></Card>;
  const fm = (minor: number) => formatMoney({ currency, minor });
  const timeless = new Set(data?.timelessProducts ?? []);
  const toggle = (id: string) => updateData((d) => {
    const cur = d.timelessProducts ?? [];
    return { ...d, timelessProducts: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
  });
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  const archive = age.bands.find((b) => b.band === 'ARCHIVE');

  return (
    <Card title="STOCK BY AGE · TIME ON THE WEBSTORE" note={
      <>
        AGE COUNTS FROM THE DAY THE DESIGN WENT UP ON THE WEBSTORE (SHOPIFY PUBLISH DATE), TO THE STOCK READ ({day(age.asOf)}). A RESTOCK DOESN'T RESET IT; RE-PUBLISHING IN SHOPIFY DOES.
        {' '}★ MARKS A DESIGN TIMELESS: IT NEVER AGES INTO ARCHIVE. VALUES ARE AT RECORDED UNIT COST; UNITS WITHOUT A COST AREN'T VALUED.
      </>
    }>
      <div className="space-y-2">
        <StackBar label="UNITS" total={age.units} parts={age.bands.map((b) => ({ band: b.band, value: b.units }))} fmt={(n) => n.toLocaleString('en-US')} />
        <StackBar label="AT COST" total={age.atCost} parts={age.bands.map((b) => ({ band: b.band, value: b.atCost }))} fmt={fm} />
        <StackBar label="SALES, 90 DAYS" total={age.sales90} parts={age.bands.map((b) => ({ band: b.band, value: b.sales90 }))} fmt={fm} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <caption className="sr-only">Stock by age band</caption>
          <thead><tr className="stat-label text-left">
            <th scope="col" className="py-1 pr-2 font-normal">Age</th>
            <th scope="col" className="px-2 py-1 text-right font-normal">Products</th>
            <th scope="col" className="px-2 py-1 text-right font-normal">Units</th>
            <th scope="col" className="px-2 py-1 text-right font-normal">At cost</th>
            <th scope="col" className="px-2 py-1 text-right font-normal">Share of cost</th>
            <th scope="col" className="px-2 py-1 text-right font-normal">Share of 90-day sales</th>
          </tr></thead>
          <tbody>
            {age.bands.map((b) => (
              <tr key={b.band} className="border-t border-[var(--crt-mid)]">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLOR[b.band] }} />
                    <span className="font-display">{BAND_LABEL[b.band]}</span>
                  </span>
                  <span className="stat-sub block">{BAND_RANGE[b.band]}</span>
                </th>
                <td className="px-2 py-1 text-right">{b.products}</td>
                <td className="px-2 py-1 text-right">{b.units} <span className="dim">({pct(b.units, age.units)})</span></td>
                <td className="px-2 py-1 text-right">{fm(b.atCost)}</td>
                <td className="px-2 py-1 text-right">{pct(b.atCost, age.atCost)}</td>
                <td className="px-2 py-1 text-right">{pct(b.sales90, age.sales90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1">
        {age.bands.filter((b) => b.units > 0).map((b) => {
          const rows = age.rows.filter((r) => r.band === b.band);
          const isArchive = b.band === 'ARCHIVE';
          return (
            <details key={b.band} className="border-t border-[var(--crt-mid)] pt-1" open={isArchive}>
              <summary className="cursor-pointer text-[0.8rem]">
                <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: BAND_COLOR[b.band] }} />
                <span className="font-display">{isArchive ? 'SAMPLE SALE LIST' : BAND_LABEL[b.band]}</span>
                <span className="dim"> · {plural(rows.length, 'PRODUCT')} · {plural(b.units, 'UNIT')} · {fm(b.atCost)} AT COST · {fm(b.atRetail)} AT FULL PRICE</span>
              </summary>
              {isArchive && archive && (
                <p className="stat-sub mt-1">
                  12 MONTHS OR MORE ON THE WEBSTORE: STORE IT OR CUT THE PRICE — YOUR CALL. UNIT COST IS SHOWN SO A SALE PRICE CAN STAY ABOVE IT.
                  THE DASHBOARD DOESN'T CHANGE PRICES IN SHOPIFY.
                </p>
              )}
              <ul className="mt-1 divide-y divide-[var(--crt-mid)] text-[0.8rem]">
                {rows.map((r) => <AgeItem key={r.productId} r={r} fm={fm} timeless={timeless.has(r.productId)} onToggle={() => toggle(r.productId)} detail={isArchive} />)}
              </ul>
            </details>
          );
        })}
      </div>
    </Card>
  );
}

function AgeItem({ r, fm, timeless, onToggle, detail }: { r: AgeRow; fm: (n: number) => string; timeless: boolean; onToggle: () => void; detail: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1">
      <span className="min-w-0 flex-1">
        <span className="warm">{r.title}</span>
        <span className="stat-sub block">
          {r.ageDays !== null ? `${months(r.ageDays)} ON THE WEBSTORE (SINCE ${day(r.published!)})` : 'NOT PUBLISHED TO THE WEBSTORE'}
          {' · '}{plural(r.units, 'UNIT')}
          {detail && <> · PRICE {fm(r.price)}{r.unitCost !== null ? ` · UNIT COST ${fm(r.unitCost)}` : ' · NO UNIT COST'}</>}
          {' · '}{r.atCost > 0 ? `${fm(r.atCost)} AT COST` : 'NOT VALUED'}
          {' · '}{r.sales90 > 0 ? `${fm(r.sales90)} SOLD IN 90 D` : r.lastSale ? `LAST SALE ${day(r.lastSale)}` : 'NO SALE IN 12 MO'}
          {r.nextBand && r.nextBandOn && <> · <span className="text-[var(--vhs-white)]">{BAND_LABEL[r.nextBand]} FROM {day(r.nextBandOn)}</span></>}
        </span>
      </span>
      <button onClick={onToggle} aria-pressed={timeless} title={timeless ? 'Timeless: never ages. Click to let it age again.' : 'Mark as Timeless: a design you keep re-releasing; it never ages into archive.'}
        className={`tap shrink-0 border px-1.5 font-display text-xs ${timeless ? 'border-[var(--phase-1)] text-[var(--vhs-white)]' : 'border-[var(--crt-line)] dim'}`}>
        {timeless ? '★ TIMELESS' : '☆ TIMELESS'}
      </button>
    </li>
  );
}
