// Money panels fed by the bank sync: the all-channel goal on the overview,
// and on the costs desk the deposits to tag and the recurring charges.
// The numbers come from src/game/moneyIn.ts; this file only formats them.
import { useTerminal } from '@/terminal/useTerminal';
import { goalPace, monthMoney, recurringCharges, taggedDeposits } from '@/game/moneyIn';
import type { MonthMoney } from '@/game/moneyIn';
import type { DepositTag, ParkData, VendorMark } from '@/game/types';
import { todayIn } from '@/analytics/period';
import { money, pct, plural } from '@/game/format';
import { InlineNumber } from '@/components/InlineEdit';

const monthLabel = (ym: string, year = false) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).toUpperCase();
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();

/** The day the bank data runs to, in the business timezone, and its month. */
function bankThrough(d: ParkData): { through: string; month: string } | null {
  if (!d.accounts?.length || !d.cashflow?.length) return null;
  const asOf = d.accounts.map((a) => a.asOf).sort()[0];
  const through = todayIn(d.analytics?.timezone ?? 'UTC', new Date(asOf));
  return { through, month: through.slice(0, 7) };
}

const pressed = 'border-[var(--q-strong,var(--phosphor))] text-[var(--vhs-white)]';
const unpressed = 'border-[var(--crt-line)] dim';

// ── Overview: money in vs money out against the goal ──────────────────────

function Line({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3 text-[0.8rem]">
      <dt className="dim">{label}</dt>
      <dd className={tone} style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
    </div>
  );
}

export function MoneyInOut() {
  const { data, updateData, setDesk } = useTerminal();
  if (!data) return null;
  const at = bankThrough(data);
  if (!at) {
    return (
      <section className="window" aria-labelledby="mio-h">
        <div className="window-head"><h2 id="mio-h" className="wh-title">MONEY IN VS OUT</h2></div>
        <div className="window-body">
          <p className="stat-sub">UNAVAILABLE — THE BUSINESS BANK AND CARD ARE NOT IN THIS SYNC, SO MONEY RECEIVED ACROSS ALL CHANNELS CAN'T BE COUNTED. SHOPIFY SALES ARE ABOVE.</p>
        </div>
      </section>
    );
  }
  const cur = monthMoney(data, at.month);
  const prevMonth = data.cashflow!.map((m) => m.month).filter((m) => m < at.month).sort().pop();
  const prev = prevMonth ? monthMoney(data, prevMonth) : null;
  const goal = data.monthlySalesGoal ?? 0;
  const pace = cur ? goalPace(cur.counted, goal, at.through) : null;
  const share = cur && goal > 0 ? (cur.counted / goal) * 100 : null;

  const untaggedNote = (m: MonthMoney) =>
    m.untaggedCount === null
      ? `${money(m.untagged)} OF OTHER DEPOSITS CAN'T BE TAGGED IN THIS SYNC — RE-SYNC THE BANK`
      : `${money(m.untagged)} IN ${plural(m.untaggedCount, 'DEPOSIT')} NOT TAGGED YET — NOT COUNTED`;

  return (
    <section className="window" aria-labelledby="mio-h">
      <div className="window-head flex-wrap">
        <h2 id="mio-h" className="wh-title">MONEY IN VS OUT · {monthLabel(at.month, true)}</h2>
        <span className="wh-note">ALL CHANNELS · BANK MONEY TO {dayLabel(at.through)}</span>
      </div>
      <div className="window-body grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* received vs the goal */}
        <div className="min-w-0">
          <div className="stat-label">RECEIVED SO FAR {cur?.status === 'partial' && <span className="badge tier-amber ml-1" title="Some deposits aren't tagged, so this is a floor, not the total">AT LEAST</span>}</div>
          <div className="font-display text-5xl leading-tight break-words">{cur ? money(cur.counted) : '—'}</div>
          <div className="mt-1 flex items-center justify-between gap-2 stat-sub">
            <span>
              GOAL{' '}
              <InlineNumber
                className="warm"
                value={goal > 0 ? goal : null}
                format={(v) => (v === null ? 'SET A MONTHLY GOAL' : `${money(v)}/MO`)}
                title="SET THE MONTHLY GOAL, ALL CHANNELS (0 TO CLEAR)"
                onCommit={(v) => updateData((d) => ({ ...d, monthlySalesGoal: Math.max(0, Math.round(v)) }))}
              />
            </span>
            {share !== null && <span className={share >= 100 ? 'tier-green' : 'warm'}>{pct(share)}</span>}
          </div>
          {share !== null && pace && (
            <div className="mt-1 relative" role="img" aria-label={`${pct(share)} of the goal, day ${pace.dayOfMonth} of ${pace.daysInMonth}`}>
              <div className="h-1.5 bg-[var(--crt-mid)]">
                <div className="h-full" style={{ width: `${Math.min(100, share)}%`, background: share >= 100 ? 'var(--palm)' : 'var(--sun)' }} />
              </div>
              {/* where today would be if money arrived evenly */}
              <div className="absolute top-[-2px] h-[10px] w-px bg-[var(--vhs-white)]" style={{ left: `${(pace.dayOfMonth / pace.daysInMonth) * 100}%` }} aria-hidden />
            </div>
          )}
          {!cur && <p className="stat-sub mt-1">NO BANK TRANSACTIONS IN {monthLabel(at.month)} YET.</p>}
          {cur && pace && (
            <p className="stat-sub mt-1">
              {pace.met
                ? `GOAL MET ON DAY ${pace.dayOfMonth} OF ${pace.daysInMonth}.`
                : pace.neededPerDay === null
                  ? `${money(goal - cur.counted)} SHORT ON THE LAST DAY.`
                  : `NEEDS ${money(pace.neededPerDay)}/DAY FOR THE REST OF THE MONTH · RUNNING AT ${money(pace.runningPerDay)}/DAY.`}
            </p>
          )}
        </div>

        {/* where it came from */}
        {cur && (
          <div className="min-w-0">
            <div className="stat-label">WHERE IT CAME FROM</div>
            <dl className="mt-1 space-y-0.5">
              <Line label="SHOPIFY PAYOUTS" value={money(cur.shopify)} />
              <Line label="PAYPAL" value={money(cur.paypal)} />
              <Line label="STOCKISTS (TAGGED)" value={money(cur.stockist)} />
              <Line label="CLIENT WORK (TAGGED)" value={money(cur.client)} />
              {cur.notRevenue > 0 && <Line label="NOT REVENUE — LEFT OUT" value={money(cur.notRevenue)} tone="dim" />}
            </dl>
            {cur.untagged > 0 && (
              <p className="mt-2 text-[0.8rem] tier-amber">
                {untaggedNote(cur)}.{' '}
                <button onClick={() => setDesk('c')} className="tap border border-[var(--crt-line)] px-2 py-0.5 font-display text-sm text-[var(--vhs-white)]">TAG THEM →</button>
              </p>
            )}
          </div>
        )}

        {/* against what went out */}
        {cur && (
          <div className="min-w-0">
            <div className="stat-label">MONEY OUT · NET</div>
            <dl className="mt-1 space-y-0.5">
              <Line label={`SPENT IN ${monthLabel(cur.month)}`} value={money(cur.spending)} />
              <Line label="RECEIVED − SPENT" value={money(cur.net, { signed: true })} tone={cur.net < 0 ? 'tier-red' : 'tier-green'} />
              {prev && (
                <Line
                  label={`${monthLabel(prev.month)}: ${money(prev.counted)} IN · ${money(prev.spending)} OUT`}
                  value={money(prev.net, { signed: true })}
                  tone={prev.net < 0 ? 'tier-red' : 'tier-green'}
                />
              )}
            </dl>
            {prev && prev.untagged > 0 && <p className="stat-sub mt-1">{monthLabel(prev.month)}: {untaggedNote(prev)}.</p>}
          </div>
        )}
      </div>
      <div className="window-body pt-0">
        <p className="stat-sub">
          MONEY THAT REACHED THE BUSINESS ACCOUNTS, NOT SHOPIFY SALES: PAYOUTS ARRIVE DAYS AFTER A SALE AND AFTER SHOPIFY'S FEES. YOUR OWN TRANSFERS NEVER COUNT. SPENDING IS BANK + CARD, COUNTED WHEN CHARGED.
        </p>
      </div>
    </section>
  );
}

// ── Costs: deposits to tag ────────────────────────────────────────────────

const TAGS: { key: DepositTag; label: string; hint: string }[] = [
  { key: 'STOCKIST', label: 'STOCKIST', hint: 'A shop paying you for sales — counts toward the goal' },
  { key: 'CLIENT', label: 'CLIENT', hint: 'Paid client or creative work — counts toward the goal' },
  { key: 'NOT_REVENUE', label: 'NOT REVENUE', hint: 'Your own money, a refund or a loan — left out' },
];

export function DepositTagging() {
  const { data, updateData } = useTerminal();
  if (!data?.accounts?.length) return null;
  const all = taggedDeposits(data);
  const rows = [...all].sort((a, b) => Number(!!a.tag) - Number(!!b.tag)); // untagged first, each newest first
  const waiting = all.filter((x) => !x.tag);
  const setTag = (id: string, tag: DepositTag | null) =>
    updateData((d) => {
      const next = { ...(d.depositTags ?? {}) };
      if (tag) next[id] = tag; else delete next[id];
      return { ...d, depositTags: next };
    });

  return (
    <section className="window" aria-labelledby="dep-h">
      <div className="window-head flex-wrap">
        <h2 id="dep-h" className="wh-title">MONEY IN TO TAG</h2>
        <span className="wh-note">{data.deposits ? (waiting.length ? `${plural(waiting.length, 'DEPOSIT')} WAITING · ${money(waiting.reduce((s, x) => s + x.amount, 0))}` : 'ALL TAGGED') : ''}</span>
      </div>
      <div className="window-body space-y-2">
        <p className="stat-sub">
          THE BANK CAN'T TELL A STOCKIST PAYOUT FROM YOUR OWN TOP-UP. TAG EACH DEPOSIT ONCE; STOCKIST AND CLIENT MONEY THEN COUNT TOWARD THE GOAL ON THE OVERVIEW. SHOPIFY AND PAYPAL PAYOUTS COUNT ON THEIR OWN. PRESS A TAG AGAIN TO CLEAR IT.
        </p>
        {!data.deposits ? (
          <p className="stat-sub tier-amber">THIS SYNC HAS THE MONTHLY TOTALS BUT NOT THE INDIVIDUAL DEPOSITS — RUN THE BANK SYNC AGAIN TO TAG THEM.</p>
        ) : rows.length === 0 ? (
          <p className="stat-sub">NO DEPOSITS OTHER THAN SHOPIFY AND PAYPAL PAYOUTS IN THIS SYNC.</p>
        ) : (
          <div className="max-h-[22rem] overflow-auto">
            <table className="w-full min-w-[560px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <caption className="sr-only">Bank deposits that are not Shopify or PayPal payouts, with a tag for each</caption>
              <thead>
                <tr className="stat-label text-left">
                  <th scope="col" className="px-2 py-1.5 font-normal">Date</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-normal">Amount</th>
                  <th scope="col" className="px-2 py-1.5 font-normal">What the bank says</th>
                  <th scope="col" className="px-2 py-1.5 font-normal">It is</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} className="border-t border-[var(--crt-mid)]">
                    <td className="px-2 py-1.5 whitespace-nowrap">{dayLabel(x.date)} {x.date.slice(0, 4)}</td>
                    <td className="px-2 py-1.5 text-right font-display">{money(x.amount, { cents: true })}</td>
                    <th scope="row" className="px-2 py-1.5 text-left font-normal">
                      <span className="warm">{x.label}</span>
                      {x.memo && <span className="dim"> · “{x.memo}”</span>}
                    </th>
                    <td className="px-2 py-1.5">
                      <span role="group" aria-label={`Tag for ${money(x.amount, { cents: true })} on ${x.date}`} className="flex flex-wrap gap-1">
                        {TAGS.map((t) => (
                          <button key={t.key} onClick={() => setTag(x.id, x.tag === t.key ? null : t.key)} aria-pressed={x.tag === t.key} title={t.hint}
                            className={`tap border px-2 py-0.5 font-display text-xs ${x.tag === t.key ? pressed : unpressed}`}>
                            {t.label}
                          </button>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Costs: recurring charges ──────────────────────────────────────────────

const MARKS: VendorMark[] = ['KEEP', 'CUT'];

export function RecurringCharges() {
  const { data, updateData } = useTerminal();
  if (!data?.accounts?.length) return null;
  const r = recurringCharges(data);
  const setMark = (vendor: string, mark: VendorMark | null) =>
    updateData((d) => {
      const next = { ...(d.vendorMarks ?? {}) };
      if (mark) next[vendor] = mark; else delete next[vendor];
      return { ...d, vendorMarks: next };
    });

  return (
    <section className="window" aria-labelledby="rec-h">
      <div className="window-head flex-wrap">
        <h2 id="rec-h" className="wh-title">RECURRING CHARGES</h2>
        <span className="wh-note">{r ? `${money(r.monthlyTotal)}/MO · ${money(r.monthlyTotal * 12)}/YR${r.markedToCut > 0 ? ` · ${money(r.markedToCut)}/MO MARKED TO CUT` : ''}` : 'FROM BANK + CARD'}</span>
      </div>
      <div className="window-body space-y-2">
        {!r ? (
          <p className="stat-sub">UNAVAILABLE — THIS NEEDS A BANK SYNC WITH VENDOR DETAIL AND AT LEAST ONE COMPLETE MONTH. RUN THE BANK SYNC AGAIN.</p>
        ) : (
          <>
            <p className="stat-sub">
              CHARGED IN AT LEAST {Math.min(3, r.monthsLooked.length)} OF THE LAST {plural(r.monthsLooked.length, 'COMPLETE MONTH')} ({monthLabel(r.monthsLooked[0])}–{monthLabel(r.monthsLooked[r.monthsLooked.length - 1])}), SOFTWARE AND UNCATEGORISED SPENDING ONLY — SHIPPING, ADS AND PRODUCTION MOVE WITH SALES AND ARE LEFT OUT. "TYPICAL" IS THE MIDDLE MONTH, NOT THE AVERAGE. MARKS ARE YOUR NOTES; NOTHING IS CANCELLED FROM HERE.
            </p>
            {r.recurring.length === 0 ? (
              <p className="stat-sub">NOTHING WAS CHARGED OFTEN ENOUGH TO COUNT AS RECURRING.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <caption className="sr-only">Recurring charges on the business bank and card, largest first</caption>
                  <thead>
                    <tr className="stat-label text-left">
                      <th scope="col" className="px-2 py-1.5 font-normal">Vendor</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-normal">Typical / month</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-normal">Per year</th>
                      <th scope="col" className="px-2 py-1.5 font-normal">Seen</th>
                      <th scope="col" className="px-2 py-1.5 font-normal">Last charged</th>
                      <th scope="col" className="px-2 py-1.5 font-normal">Your call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.recurring.map((x) => (
                      <tr key={x.vendor} className={`border-t border-[var(--crt-mid)] ${x.active ? '' : 'dim'}`}>
                        <th scope="row" className={`px-2 py-1.5 text-left font-normal ${x.active ? 'warm' : ''} ${x.mark === 'CUT' ? 'line-through' : ''}`}>{x.vendor}</th>
                        <td className="px-2 py-1.5 text-right font-display">{money(x.typicalMonthly, { cents: true })}</td>
                        <td className="px-2 py-1.5 text-right">{x.active ? money(x.typicalMonthly * 12) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{x.monthsSeen} OF {x.monthsLooked} MO</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {monthLabel(x.lastMonth)} · {money(x.lastAmount, { cents: true })}
                          {!x.active && <span className="tier-amber"> · NOT CHARGED SINCE — NOT IN THE TOTAL</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <span role="group" aria-label={`Decision for ${x.vendor}`} className="flex gap-1">
                            {MARKS.map((m) => (
                              <button key={m} onClick={() => setMark(x.vendor, x.mark === m ? null : m)} aria-pressed={x.mark === m}
                                className={`tap border px-2 py-0.5 font-display text-xs ${x.mark === m ? pressed : unpressed}`}>
                                {m}
                              </button>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {r.occasional.length > 0 && (
              <div>
                <h3 className="stat-label">Seen in only one or two months — annual plans, one-offs or new ($90+)</h3>
                <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 text-[0.8rem] sm:grid-cols-2">
                  {r.occasional.map((o) => (
                    <li key={o.vendor} className="flex justify-between gap-2">
                      <span className="warm">{o.vendor} <span className="dim">· {monthLabel(o.lastMonth)}</span></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(o.total, { cents: true })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
