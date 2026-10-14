import { formatMoney } from '@/analytics/money';
import * as M from '@/analytics/metrics';
import type { ChannelGroup } from '@/analytics/channels';
import type { AnalyticsView } from './useAnalytics';

const GROUP_LABEL: Record<ChannelGroup, string> = { DTC: 'DTC', WHOLESALE: 'Wholesale', UNMAPPED: 'Unmapped' };

// DTC vs wholesale on one basis: Shopify net product revenue, sale on the
// order date and returns on the return date. Wholesale has no connected
// records, so it is shown as unavailable rather than borrowed from elsewhere.
export function ChannelComparison({ v }: { v: AnalyticsView }) {
  const c = v.a.currency;
  const groups: ChannelGroup[] = ['DTC', 'WHOLESALE', 'UNMAPPED'];
  const lines = M.channelBreakdown(v.a, v.cmp.current);
  const priorLines = M.channelBreakdown(v.a, v.cmp.prior);
  const wholesale = M.wholesaleSales();
  const fmt = (minor: number) => formatMoney({ currency: c, minor });

  const row = (label: string, cur: M.PeriodTotals, prior: M.PeriodTotals, indent = false) => {
    const gm = M.grossMargin(cur, c);
    const aov = M.aovAtPurchase(cur, c);
    return (
      <tr key={label} className="border-t border-[var(--crt-mid)]">
        <th scope="row" className={`px-2 py-1.5 text-left font-normal ${indent ? 'pl-6 dim' : 'warm'}`}>{label}</th>
        <td className="px-2 py-1.5 text-right font-display">{fmt(cur.netSales)}</td>
        <td className="px-2 py-1.5 text-right dim">{fmt(prior.netSales)}</td>
        <td className="px-2 py-1.5 text-right">{fmt(cur.netSalesWithCost - cur.cogs)}</td>
        <td className="px-2 py-1.5 text-right">{gm.value === null ? '—' : `${gm.value.toFixed(1)}%${gm.status === 'partial' ? '*' : ''}`}</td>
        <td className="px-2 py-1.5 text-right">{cur.orders}</td>
        <td className="px-2 py-1.5 text-right">{cur.netItems}</td>
        <td className="px-2 py-1.5 text-right">{aov.value ? formatMoney(aov.value) : '—'}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <caption className="sr-only">Sales by channel group, this period vs prior</caption>
          <thead>
            <tr className="stat-label text-left">
              <th scope="col" className="px-2 py-1.5 font-normal">Channel</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Net revenue</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Prior</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Gross profit</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Margin</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Orders</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Units</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">AOV</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              if (g === 'WHOLESALE') {
                return (
                  <tr key={g} className="border-t border-[var(--crt-mid)]">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal warm">Wholesale</th>
                    <td colSpan={7} className="px-2 py-1.5 stat-sub">UNAVAILABLE — {wholesale.reason}</td>
                  </tr>
                );
              }
              const cur = M.periodTotals(v.a, v.cmp.current, g);
              const prior = M.periodTotals(v.a, v.cmp.prior, g);
              const members = [...new Set([...lines, ...priorLines].filter((l) => l.group === g).map((l) => l.channel))];
              if (g === 'UNMAPPED' && members.length === 0) return null;
              return [
                row(GROUP_LABEL[g], cur, prior),
                ...members.map((ch) => row(ch, M.periodTotals({ ...v.a, daily: v.a.daily.filter((r) => r.channel === ch) }, v.cmp.current),
                  M.periodTotals({ ...v.a, daily: v.a.daily.filter((r) => r.channel === ch) }, v.cmp.prior), true)),
              ];
            })}
            {row('All channels', M.periodTotals(v.a, v.cmp.current), M.periodTotals(v.a, v.cmp.prior))}
          </tbody>
        </table>
      </div>
      <p className="stat-sub">
        SAME BASIS FOR EVERY ROW: SHOPIFY NET PRODUCT REVENUE (SALE ON ORDER DATE, RETURNS ON RETURN DATE), EXCL. SHIPPING AND TAX. * = MARGIN ON THE PART WITH RECORDED COST.
        UNMAPPED CHANNELS COUNT IN "ALL CHANNELS" BUT IN NEITHER GROUP UNTIL YOU DECIDE WHAT THEY ARE (SRC/ANALYTICS/CHANNELS.TS).
        WHOLESALE WOULD BE SHOWN AS SEPARATE ORDERED / INVOICED / FULFILLED / PAID AMOUNTS, AND SHIPMENTS TO RETAILERS ARE SELL-IN, NOT SELL-THROUGH.
      </p>
    </div>
  );
}
