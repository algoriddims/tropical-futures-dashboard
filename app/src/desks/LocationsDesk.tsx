import { useTerminal } from '@/terminal/TerminalContext';
import { channelStats, stockistOwed } from '@/game/engine';
import type { Channel, ChannelStock } from '@/game/types';
import { InlineNumber } from '@/components/InlineEdit';

const TYPE_TONE: Record<Channel['type'], string> = {
  ONLINE: 'tier-green',
  STOCKIST: 'water',
  POPUP: 'tier-amber',
};

export default function LocationsDesk() {
  const { data, updateData } = useTerminal();
  if (!data) return null;

  const patchStock = (channelName: string, productId: string, patch: Partial<ChannelStock>) =>
    updateData((d) => ({
      ...d,
      channels: d.channels.map((ch) =>
        ch.name === channelName
          ? { ...ch, stock: ch.stock.map((s) => (s.productId === productId ? { ...s, ...patch } : s)) }
          : ch,
      ),
    }));

  const stats = data.channels.map((c) => ({ c, st: channelStats(c, data.products) }));
  const stockists = stats.filter((s) => s.c.type !== 'ONLINE');
  const outThere = stockists.reduce((s, x) => s + x.st.onHand, 0);
  const outValue = stockists.reduce((s, x) => s + x.st.retailValue, 0);
  const soldThere = stockists.reduce((s, x) => s + x.st.soldUnits, 0);
  const owed = stockistOwed(data);
  const owedTotal = owed.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* consignment summary */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">STOCK OUT IN THE WORLD</span>
          <span className="dim text-sm">STOCKISTS + POP-UPS</span>
        </div>
        <div className="window-body grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="font-display text-sm dim">UNITS ON SHELVES</div>
            <div className="font-display text-3xl text-[var(--vhs-white)]">{outThere}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">RETAIL VALUE OUT</div>
            <div className="font-display text-3xl water">${outValue.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">UNITS SOLD VIA PARTNERS</div>
            <div className="font-display text-3xl phosphor">{soldThere}</div>
          </div>
          <div>
            <div className="font-display text-sm dim">PARTNER SELL-THROUGH</div>
            <div className="font-display text-3xl palm">
              {Math.round((soldThere / (soldThere + outThere || 1)) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* money owed by stockists */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">MONEY OWED TO THE PARK</span>
          <span className="dim text-sm">
            WHOLESALE CUT{' '}
            <InlineNumber
              value={data.wholesalePct * 100}
              format={(v) => `${Math.round(v)}%`}
              title="SET WHOLESALE CUT (% OF RETAIL)"
              onCommit={(v) => updateData((d) => ({ ...d, wholesalePct: Math.max(0, Math.min(100, Math.round(v))) / 100 }))}
            />
            {' '}OF RETAIL · COLLECTS NEXT MONTH IN FORECAST
          </span>
        </div>
        <div className="window-body">
          {owed.length === 0 ? (
            <div className="font-display text-sm dim">NO UNCOLLECTED STOCKIST SALES — NOTHING OWED.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              {owed.map((o) => (
                <span key={o.name} className="font-display text-base">
                  <span className="warm">{o.name}</span>{' '}
                  <span className="sun">${o.amount.toLocaleString()}</span>
                </span>
              ))}
              <span className="font-display text-lg ml-auto">
                <span className="dim">TOTAL OWED </span>
                <span className={owedTotal >= 500 ? 'tier-amber' : 'phosphor'}>${owedTotal.toLocaleString()}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* per-location windows */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ c, st }) => (
          <div key={c.name} className="window">
            <div className="window-head">
              <span className="wh-title">{c.name} · {c.location}</span>
              <span className="flex items-center gap-2">
                {c.type !== 'ONLINE' && <span className="dim text-xs">SYNC OWNS COUNTS · EDITS LAST TILL NEXT SYNC</span>}
                <span className={`badge ${TYPE_TONE[c.type]}`}>{c.type}</span>
              </span>
            </div>
            <div className="window-body space-y-2">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="font-display text-xs dim">REVENUE</div>
                  <div className="font-display text-xl phosphor">${c.revenue.toLocaleString()}</div>
                </div>
                <div>
                  <div className="font-display text-xs dim">ON HAND</div>
                  <div className="font-display text-xl text-[var(--vhs-white)]">{st.onHand}</div>
                </div>
                <div>
                  <div className="font-display text-xs dim">SOLD</div>
                  <div className="font-display text-xl warm">{st.soldUnits}</div>
                </div>
                <div>
                  <div className="font-display text-xs dim">SELL-THRU</div>
                  <div className={`font-display text-xl ${st.sellThrough > 0.7 ? 'palm' : st.sellThrough < 0.35 ? 'tier-amber' : 'water'}`}>
                    {Math.round(st.sellThrough * 100)}%
                  </div>
                </div>
              </div>

              <table className="w-full text-[0.74rem]">
                <thead>
                  <tr className="border-b border-[var(--crt-mid)] text-left font-display text-xs dim">
                    <th className="py-1 font-normal">PRODUCT</th>
                    <th className="py-1 text-right font-normal">ALLOC</th>
                    <th className="py-1 text-right font-normal">SOLD</th>
                    <th className="py-1 text-right font-normal">ON HAND</th>
                    <th className="py-1 text-right font-normal">SELL-THRU</th>
                    <th className="py-1 pr-1 text-right font-normal">SIGNAL</th>
                  </tr>
                </thead>
                <tbody>
                  {st.rows.map((r) => {
                    const editable = c.type !== 'ONLINE';
                    const signal =
                      r.sellThrough >= 0.85 && r.allocated >= 10 ? { label: 'RESTOCK', tone: 'tier-green' }
                      : r.onHand >= 15 && r.sellThrough < 0.3 ? { label: 'DEAD STOCK', tone: 'tier-amber' }
                      : { label: 'OK', tone: 'dim' };
                    return (
                      <tr key={r.product.id} className="border-b border-[var(--crt-mid)] last:border-0">
                        <td className="py-1.5 warm truncate max-w-[140px]">{r.product.name}</td>
                        <td className="py-1.5 text-right dim">
                          {editable ? (
                            <InlineNumber
                              value={r.allocated}
                              title="SET UNITS ALLOCATED"
                              onCommit={(v) => patchStock(c.name, r.product.id, { allocated: Math.max(0, Math.round(v), r.sold) })}
                            />
                          ) : r.allocated}
                        </td>
                        <td className="py-1.5 text-right warm">
                          {editable ? (
                            <InlineNumber
                              value={r.sold}
                              title="SET UNITS SOLD"
                              onCommit={(v) => patchStock(c.name, r.product.id, { sold: Math.min(Math.max(0, Math.round(v)), r.allocated) })}
                            />
                          ) : r.sold}
                        </td>
                        <td className={`py-1.5 text-right font-display text-base ${r.onHand === 0 ? 'tier-red' : 'text-[var(--vhs-white)]'}`}>{r.onHand}</td>
                        <td className="py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="h-1 w-10 bg-[var(--crt-mid)]">
                              <div className="h-full bg-[var(--palm)]" style={{ width: `${Math.min(100, r.sellThrough * 100)}%` }} />
                            </div>
                            <span className="dim">{Math.round(r.sellThrough * 100)}%</span>
                          </div>
                        </td>
                        <td className="py-1.5 pr-1 text-right">
                          <span className={`badge ${signal.tone}`}>{signal.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
