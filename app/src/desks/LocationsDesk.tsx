import type React from 'react';
import { useTerminal } from '@/terminal/TerminalContext';
import { channelStats } from '@/game/engine';
import type { Channel } from '@/game/types';
import { shelfKey } from '@/game/overrides';
import type { ShelfEditStatus, ShelfField } from '@/game/overrides';
import { InlineNumber } from '@/components/InlineEdit';

const TYPE_TONE: Record<Channel['type'], string> = {
  ONLINE: 'tier-green',
  STOCKIST: 'water',
  POPUP: 'tier-amber',
};

export default function LocationsDesk() {
  const { data, editShelf, resolveShelfEdit, shelfStatus, storageOk } = useTerminal();
  if (!data) return null;

  const statusByKey = new Map(shelfStatus.map((s) => [shelfKey(s.edit), s]));
  const cellStatus = (channel: string, productId: string, field: ShelfField) =>
    statusByKey.get(shelfKey({ channel, productId, field }));
  const conflicts = shelfStatus.filter((s) => s.state === 'conflict' || s.state === 'orphaned');
  const activeEdits = shelfStatus.filter((s) => s.state !== 'orphaned').length;
  const productName = (id: string) => data.products.find((p) => p.id === id)?.name ?? id;

  const stats = data.channels.map((c) => ({ c, st: channelStats(c, data.products) }));
  const stockists = stats.filter((s) => s.c.type !== 'ONLINE');
  const outThere = stockists.reduce((s, x) => s + x.st.onHand, 0);
  const outValue = stockists.reduce((s, x) => s + x.st.retailValue, 0);
  const soldThere = stockists.reduce((s, x) => s + x.st.soldUnits, 0);

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

      {/* shelf corrections that disagree with the latest sync */}
      {conflicts.length > 0 && (
        <div className="window">
          <div className="window-head">
            <span className="wh-title tier-amber">SHELF COUNT CONFLICTS · {conflicts.length}</span>
            <span className="dim text-sm">YOUR CORRECTION IS STILL SHOWN UNTIL YOU CHOOSE</span>
          </div>
          <div className="window-body space-y-1">
            {conflicts.map((c) => <ConflictRow key={shelfKey(c.edit)} c={c} name={productName(c.edit.productId)} onResolve={resolveShelfEdit} />)}
          </div>
        </div>
      )}

      {/* collections — deliberately not estimated */}
      <div className="window">
        <div className="window-head">
          <span className="wh-title">MONEY OWED BY PARTNERS</span>
          <span className="dim text-sm">NOT TRACKED YET</span>
        </div>
        <div className="window-body text-[0.74rem] dim">
          UNITS SOLD ON A SHELF ARE NOT THE SAME AS MONEY OWED. BALANCES NEED WHOLESALE INVOICES, CONSIGNMENT
          STATEMENTS AND THE PAYMENTS ALREADY RECEIVED — THOSE RECORDS AREN'T IN THE TERMINAL YET, SO NO TOTAL IS SHOWN.
        </div>
      </div>

      {/* per-location windows */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ c, st }) => (
          <div key={c.name} className="window">
            <div className="window-head">
              <span className="wh-title">{c.name} · {c.location}</span>
              <span className="flex items-center gap-2">
                {c.type !== 'ONLINE' && (
                  <span className="dim text-xs">
                    COUNTS FROM SYNC{activeEdits > 0 ? ` · ✎ = YOUR CORRECTION` : ' · CLICK A COUNT TO CORRECT'}
                    {!storageOk && <span className="tier-red"> · NOT SAVING — STORAGE FULL</span>}
                  </span>
                )}
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
                    const limited = r.product.restockPolicy === 'LIMITED';
                    const signal =
                      limited && r.onHand === 0 ? { label: 'SOLD OUT ✓', tone: 'palm' }
                      : r.sellThrough >= 0.85 && r.allocated >= 10 && !limited ? { label: 'RESTOCK', tone: 'tier-green' }
                      : r.onHand >= 15 && r.sellThrough < 0.3 ? { label: 'DEAD STOCK', tone: 'tier-amber' }
                      : { label: 'OK', tone: 'dim' };
                    return (
                      <tr key={r.product.id} className="border-b border-[var(--crt-mid)] last:border-0">
                        <td className="py-1.5 warm truncate max-w-[140px]">{r.product.name}</td>
                        <td className="py-1.5 text-right dim">
                          {editable ? (
                            <EditedCell status={cellStatus(c.name, r.product.id, 'allocated')}>
                              <InlineNumber
                                value={r.allocated}
                                title="CORRECT UNITS ALLOCATED"
                                onCommit={(v) => editShelf(c.name, r.product.id, 'allocated', Math.max(0, Math.round(v), r.sold))}
                              />
                            </EditedCell>
                          ) : r.allocated}
                        </td>
                        <td className="py-1.5 text-right warm">
                          {editable ? (
                            <EditedCell status={cellStatus(c.name, r.product.id, 'sold')}>
                              <InlineNumber
                                value={r.sold}
                                title="CORRECT UNITS SOLD"
                                onCommit={(v) => editShelf(c.name, r.product.id, 'sold', Math.min(Math.max(0, Math.round(v)), r.allocated))}
                              />
                            </EditedCell>
                          ) : r.sold}
                        </td>
                        <td className={`py-1.5 text-right font-display text-base ${r.onHand === 0 ? (limited ? 'dim' : 'tier-red') : 'text-[var(--vhs-white)]'}`}>{r.onHand}</td>
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

// Marks a count that differs from the sync because of a hand correction.
function EditedCell({ status, children }: { status: ShelfEditStatus | undefined; children: React.ReactNode }) {
  if (!status || status.state === 'matches-sync') return <>{children}</>;
  const conflict = status.state === 'conflict';
  return (
    <span
      className={conflict ? 'tier-amber' : 'sun'}
      title={`YOUR CORRECTION ${new Date(status.edit.editedAt).toLocaleString()} · SYNC SAYS ${status.syncValue ?? '—'}`}
    >
      {conflict ? '≠' : '✎'}{children}
    </span>
  );
}

function ConflictRow({ c, name, onResolve }: {
  c: ShelfEditStatus; name: string; onResolve: (key: string, keep: 'sync' | 'mine') => void;
}) {
  const key = shelfKey(c.edit);
  const what = c.edit.field === 'sold' ? 'SOLD' : 'ALLOCATED';
  return (
    <div className="tape-row">
      <span className="warm flex-1 truncate">
        {c.edit.channel} · {name} · {what}:{' '}
        {c.state === 'orphaned'
          ? <>YOUR {c.edit.value} — ROW NO LONGER IN THE SYNC</>
          : <>YOU SET {c.edit.value} (SYNC WAS {c.edit.base ?? '—'}), LATEST SYNC SAYS {c.syncValue}</>}
      </span>
      <button className="keycap-btn px-1.5 font-display text-sm dim" onClick={() => onResolve(key, 'sync')}>USE SYNC</button>
      {c.state === 'conflict' && (
        <button className="keycap-btn px-1.5 font-display text-sm sun" onClick={() => onResolve(key, 'mine')}>KEEP MINE</button>
      )}
    </div>
  );
}
