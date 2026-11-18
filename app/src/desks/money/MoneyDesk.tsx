// The Money desk, in four tiers like the overview and Stock: where cash
// stands, what to do, why (one forecast on the bank's basis, a typical month
// in and out, recurring charges), and the full tables folded away.
// Figures in src/game/cashPlan.ts.
import type { ReactNode } from 'react';
import { useTerminal } from '@/terminal/useTerminal';
import type { DeskKey } from '@/terminal/desks';
import type { CashPlan, Scenario } from '@/game/cashPlan';
import { cashVerdict, ymLabel } from '@/game/cashPlan';
import { recurringCharges, taggedDeposits } from '@/game/moneyIn';
import type { Exception } from '@/analytics/metrics';
import type { SpendKind } from '@/game/types';
import { money, plural } from '@/game/format';
import { AccountLines, CashFlowTable } from '@/components/BankAccounts';
import { ActionList } from '../analytics/ActionList';
import { Fold } from '../overview/OverviewCharts';
import { DepositTagging, RecurringCharges } from './MoneyPanels';
import { CostLines } from '../CostsDesk';

const KIND_LABEL: Record<SpendKind, string> = {
  ADS: 'Ads (Meta billing)', SOFTWARE: 'Software & subscriptions', SHIPPING: 'Shipping & customs', OTHER: 'Other',
  ZELLE: 'Zelle payments', BANK_FEES: 'Bank fees', PRODUCTION: 'Production',
};
const TONE = { red: 'tier-red', amber: 'tier-amber', green: 'tier-green' } as const;
const SCENARIO_COLOR: Record<Scenario['key'], string> = { LOW: 'var(--phase-2)', MID: 'var(--vhs-white)', HIGH: 'var(--phase-1)' };
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();
const monShort = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

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

function Card({ title, head, note, children }: { title: string; head?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="window min-w-0" aria-label={title}>
      <div className="window-head flex-wrap"><h3 className="wh-title">{title}</h3>{head && <span className="wh-note">{head}</span>}</div>
      <div className="window-body">{children}{note && <div className="stat-sub mt-2">{note}</div>}</div>
    </section>
  );
}

export default function MoneyDesk({ plan }: { plan: CashPlan }) {
  const { data, setDesk } = useTerminal();
  if (!data) return null;
  const v = cashVerdict(plan);
  const owedOnRuns = plan.due.reduce((s, x) => s + x.amount, 0);
  const [low, mid, high] = plan.scenarios;
  const last = plan.months.length - 1;
  const basis = `${monShort(plan.basisMonths[0])}–${monShort(plan.basisMonths[plan.basisMonths.length - 1])}`;
  const sameMid = Math.abs(mid.monthlyIn - low.monthlyIn) < 0.5;

  // ── tier 2: things to do about money, most money first ──
  const actions: Exception[] = [];
  const waiting = taggedDeposits(data).filter((x) => !x.tag);
  if (waiting.length) {
    const total = waiting.reduce((s, x) => s + x.amount, 0);
    actions.push({
      id: 'tag-deposits', severity: 1, title: `Tag ${plural(waiting.length, 'deposit')} (${money(total)}) — they decide which line below is real`,
      affected: 'Money in', numbers: waiting.slice(0, 4).map((x) => `${x.date}: ${money(x.amount, { cents: true })} — ${x.label}${x.memo ? ` "${x.memo}"` : ''}`),
      rule: 'Deposits that aren\'t Shopify or PayPal payouts count as money in only once tagged as stockist or client money. Untagged, the forecast leaves them out.',
      drill: { desk: 'c', label: 'Money' }, evidence: 'sufficient', atRisk: Math.round(total * 100),
      actions: [`About ${money(plan.moneyIn.untaggedInBasis)}/month of ${basis} deposits are untagged; tagged as stockist or client money they would lift every line of the forecast by that much`],
    });
  }
  const undated = plan.due.filter((x) => !x.dated);
  if (undated.length) {
    const total = undated.reduce((s, x) => s + x.amount, 0);
    actions.push({
      id: 'undated-production', severity: 2, title: `Set due dates for ${money(total)} of production costs`,
      affected: 'Production', numbers: undated.map((x) => `${x.text}: ${money(x.amount)}`),
      rule: 'An unpaid production cost without a due date is taken out of cash this month — the cautious choice, but it may make this month look worse than it is.',
      drill: { desk: 'p', label: 'Production' }, evidence: 'sufficient', atRisk: Math.round(total * 100),
      actions: ['Counted as paid this month until a due date is set on the run'],
    });
  }
  const rc = data.vendorSpend?.length ? recurringCharges(data) : null;
  const unmarked = rc?.recurring.filter((r) => r.active && !r.mark) ?? [];
  if (rc && unmarked.length) {
    const total = unmarked.reduce((s, r) => s + r.typicalMonthly, 0);
    actions.push({
      id: 'review-recurring', severity: 3, title: `Decide keep or cut on ${plural(unmarked.length, 'recurring charge')} (${money(total)}/mo)`,
      affected: 'Money out', numbers: unmarked.slice(0, 4).map((r) => `${r.vendor}: ${money(r.typicalMonthly, { cents: true })}/mo`),
      rule: 'Charged in at least 3 of the last 6 complete months and not yet marked. Marks are notes; nothing is cancelled from here.',
      drill: { desk: 'c', label: 'Money' }, evidence: 'sufficient', atRisk: Math.round(total * 12 * 100),
      actions: [`${money(total * 12)} a year in total`],
    });
  }
  actions.sort((a, b) => b.atRisk - a.atRisk);
  const side = (e: Exception) => e.id === 'review-recurring' ? `${money(e.atRisk / 100)} A YEAR` : e.id === 'undated-production' ? `${money(e.atRisk / 100)} OWED` : `${money(e.atRisk / 100)} NOT COUNTED`;

  return (
    <div className="h-full overflow-y-auto p-2 space-y-3">
      <section aria-labelledby="mo-1" className="space-y-2">
        <h2 id="mo-1" className="stat-label px-1">1 · WHERE CASH STANDS <span className="dim">· BALANCES AS OF {dayLabel(plan.from)}</span></h2>
        <p className={`px-1 font-display text-base ${TONE[v.tone]}`}>{v.title} <span className="stat-sub normal-case">· {v.detail.toUpperCase()}</span></p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="CASH ON HAND" sub={<>
            BANK {money(plan.bank)} − CARD {money(plan.card)}
            {owedOnRuns > 0 && <span className="block"><strong className="text-[var(--vhs-white)]">{money(plan.start - owedOnRuns)}</strong> AFTER {money(owedOnRuns)} STILL OWED ON PRODUCTION</span>}
          </>}>
            <Big tone={plan.start < 0 ? 'tier-red' : ''}>{money(plan.start)}</Big>
            {plan.start > 0 && owedOnRuns > 0 && (
              <svg viewBox="0 0 260 22" width="100%" height="22" preserveAspectRatio="none" role="img" aria-label={`${money(plan.start)} now; ${money(plan.start - owedOnRuns)} after production still owed`}>
                <rect x="0" y="7" width="260" height="8" rx="4" fill="var(--phase-1)" />
                <rect x={Math.max(0, 260 * (1 - Math.min(1, owedOnRuns / plan.start)))} y="7" width={260 * Math.min(1, owedOnRuns / plan.start)} height="8" fill="var(--crt-dark)" stroke="var(--critical)" strokeWidth="1.5" />
              </svg>
            )}
          </Tile>
          <Tile label="MONEY IN · A TYPICAL MONTH" sub={<>
            SHOPIFY + PAYPAL PAYOUTS, {basis} AVERAGE
            {plan.moneyIn.tagged > 0 && <> · +{money(plan.moneyIn.tagged)} TAGGED</>}
            {plan.moneyIn.untaggedInBasis > 0 && <span className="block tier-amber">+{money(plan.moneyIn.untaggedInBasis)}/MO IN UNTAGGED DEPOSITS — NOT COUNTED</span>}
          </>}>
            <Big>{money(plan.moneyIn.payouts + plan.moneyIn.tagged)}</Big>
          </Tile>
          <Tile label="MONEY OUT · A TYPICAL MONTH" sub={<>
            {plan.moneyOut.source === 'COST_LINES' ? 'YOUR COST LINES' : `RUNNING COSTS, ${basis} AVERAGE`} · PRODUCTION PLANNED FROM YOUR RUNS
            {plan.moneyOut.source === 'ACTUAL' && plan.moneyOut.byKind.length > 0 && <span className="block">{plan.moneyOut.byKind.slice(0, 3).map((k) => `${KIND_LABEL[k.kind].split(' ')[0].toUpperCase()} ${money(k.monthly)}`).join(' · ')}</span>}
          </>}>
            <Big>{money(plan.moneyOut.monthly)}</Big>
          </Tile>
          <Tile label={`CASH BY ${ymLabel(plan.months[last])}`} sub={<>
            <span className={TONE[v.tone]}>{money(low.closing[last])}</span> AT PAYOUTS ONLY · <span className="text-[var(--vhs-white)]">{money(high.closing[last])}</span> AT THE LAST 30 DAYS' PACE
          </>}>
            <Big tone={low.closing[last] < 0 ? 'tier-red' : ''}>{money(low.closing[last])}–{money(high.closing[last])}</Big>
          </Tile>
        </div>
      </section>

      <section className="window" aria-labelledby="mo-2">
        <div className="window-head">
          <h2 id="mo-2" className="wh-title">2 · DO THIS WEEK</h2>
          <span className="wh-note">{actions.length ? `${plural(actions.length, 'MONEY TASK')} · MOST MONEY FIRST` : ''}</span>
        </div>
        <div className="window-body">
          <ActionList items={actions} currency="USD" onDrill={(d) => setDesk(d as DeskKey)} hideDrillTo="c" sideNote={side} empty="NOTHING ABOUT MONEY NEEDS YOU THIS WEEK." />
        </div>
      </section>
      {waiting.length > 0 && <DepositTagging />}

      <section aria-labelledby="mo-3" className="space-y-2">
        <h2 id="mo-3" className="stat-label px-1">3 · WHY</h2>
        <OutlookChart plan={plan} sameMid={sameMid} />
        <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
          <TypicalMonth plan={plan} basis={basis} />
          <RecurringCharges />
        </div>
      </section>

      <section aria-labelledby="mo-4" className="space-y-2">
        <h2 id="mo-4" className="stat-label px-1">4 · DETAIL</h2>
        <Fold id="money-flow" title="BANK + CARD, MONTH BY MONTH — TABLE">
          <div className="window">
            <div className="window-body grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
              <AccountLines accounts={data.accounts ?? []} />
              {data.cashflow?.length ? <CashFlowTable months={data.cashflow} /> : null}
            </div>
          </div>
        </Fold>
        {waiting.length === 0 && <Fold id="money-tags" title="DEPOSITS AND THEIR TAGS"><DepositTagging /></Fold>}
        <Fold id="money-lines" title="YOUR OWN COST LINES (OPTIONAL)"><CostLines /></Fold>
        <Fold id="money-how" title="HOW THE FORECAST WORKS">
          <div className="window"><div className="window-body space-y-1 text-[0.8rem]">
            <p>STARTS FROM CASH NET OF THE CARD ON {dayLabel(plan.from)}: {money(plan.start)}. THE FIRST MONTH IS THE REST OF {monShort(plan.months[0])}, PRORATED.</p>
            <p>MONEY IN, THREE CASES: PAYOUTS ONLY ({money(low.monthlyIn)}/MO, THE {basis} AVERAGE OF SHOPIFY + PAYPAL PAYOUTS) · PLUS DEPOSITS YOU TAGGED AS STOCKIST OR CLIENT MONEY ({money(mid.monthlyIn)}/MO) · THE LAST 30 DAYS' SHOPIFY SALES ({money(plan.moneyIn.recentSales)}){plan.moneyIn.payoutRate !== null ? ` AT THE ${Math.round(plan.moneyIn.payoutRate * 100)}% OF SALES THAT REACHED THE BANK IN ${basis}` : ' BEFORE FEES'}, PLUS TAGGED MONEY ({money(high.monthlyIn)}/MO). UNTAGGED DEPOSITS ARE NEVER COUNTED.</p>
            <p>MONEY OUT: {plan.moneyOut.source === 'COST_LINES' ? 'YOUR RECURRING COST LINES' : `THE ${basis} AVERAGE OF BANK + CARD SPENDING WITHOUT PRODUCTION (${money(plan.moneyOut.monthly)}/MO; PRODUCTION AVERAGED ${money(plan.moneyOut.productionAvg)}/MO AND IS LEFT OUT)`}. PRODUCTION COMES FROM YOUR RUNS: EACH UNPAID COST ON ITS DUE MONTH, UNDATED ONES THIS MONTH. RUNS YOU HAVEN'T RECORDED AREN'T IN IT.</p>
            <p>STOCK THAT ARRIVES ISN'T TURNED INTO EXTRA SALES — THE SALES CASES ALREADY SAY HOW MUCH COMES IN.</p>
          </div></div>
        </Fold>
      </section>
    </div>
  );
}

// ── cash outlook: three cases, production payments marked ──

function OutlookChart({ plan, sameMid }: { plan: CashPlan; sameMid: boolean }) {
  const W = 760, H = 260, X0 = 64, X1 = 690, TOP = 14, BOTTOM = 220;
  const series = plan.scenarios.filter((s) => !(s.key === 'MID' && sameMid));
  const pts = (s: Scenario) => [plan.start, ...s.closing];
  const all = series.flatMap(pts);
  const max = Math.max(...all, 1) * 1.08;
  const min = Math.min(0, ...all);
  const y = (v: number) => TOP + ((max - v) / (max - min || 1)) * (BOTTOM - TOP);
  const n = plan.months.length + 1;
  const x = (i: number) => X0 + (i / (n - 1)) * (X1 - X0);
  const labels = ['NOW', ...plan.months.map((m, i) => (i === 0 ? `${monShort(m)} END` : monShort(m)))];
  const step = (() => { const raw = (max - min) / 4; const p = 10 ** Math.floor(Math.log10(raw || 1)); return Math.ceil(raw / p) * p; })();
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);
  const dueBy = plan.months.map((_, i) => plan.due.filter((d) => d.index === i).reduce((s, d) => s + d.amount, 0));
  const lowPts = pts(plan.scenarios[0]);
  const highPts = pts(plan.scenarios[2]);
  const band = [...highPts.map((v, i) => `${x(i)},${y(v)}`), ...lowPts.map((v, i) => `${x(i)},${y(v)}`).reverse()].join(' ');

  return (
    <Card title={`CASH OUTLOOK · TO ${ymLabel(plan.months[plan.months.length - 1])}`} note={
      <>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <svg width="18" height="10" aria-hidden><line x1="0" x2="18" y1="5" y2="5" stroke={SCENARIO_COLOR[s.key]} strokeWidth="2.5" strokeDasharray={s.key === 'MID' ? '4 3' : undefined} /></svg>
              {s.label.toUpperCase()} · {money(s.monthlyIn)}/MO IN
            </span>
          ))}
          <span className="inline-flex items-center gap-1"><svg width="10" height="10" aria-hidden><path d="M1 1 L9 1 L5 9 Z" fill="var(--critical)" /></svg>PRODUCTION PAYMENT</span>
        </span>
        <span className="block mt-1">
          EVERY LINE TAKES OUT {money(plan.moneyOut.monthly)}/MO OF RUNNING COSTS AND THE PRODUCTION STILL OWED. THE SHADED AREA IS THE RANGE BETWEEN PAYOUTS ONLY AND THE RECENT SALES PACE.
          {sameMid && ' TAGGED STOCKIST AND CLIENT MONEY WOULD ADD A THIRD LINE — NONE IS TAGGED YET.'}
        </span>
        {plan.due.length > 0 && (
          <span className="block mt-1">
            PRODUCTION STILL OWED: {[...new Set(plan.due.map((d) => d.run))].map((run) => {
              const xs = plan.due.filter((d) => d.run === run);
              const undated = xs.some((d) => !d.dated);
              return `${run.toUpperCase()} −${money(xs.reduce((n, d) => n + d.amount, 0))} (${undated ? 'NO DATE — COUNTED NOW' : [...new Set(xs.map((d) => ymLabel(plan.months[d.index])))].join(', ')})`;
            }).join(' · ')}
          </span>
        )}
      </>
    }>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[540px]" role="img"
          aria-label={`Cash forecast: ${series.map((s) => `${s.label.toLowerCase()} ends at ${money(s.closing[s.closing.length - 1])}`).join('; ')}. The table below lists the figures.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={X0 - 4} x2={X1} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--critical)' : 'var(--crt-mid)'} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={X0 - 8} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--vhs-dim)">{money(t)}</text>
            </g>
          ))}
          <polygon points={band} fill="var(--phase-1)" opacity="0.08" />
          {labels.map((l, i) => <text key={l + i} x={x(i)} y={H - 18} fontSize="10" textAnchor="middle" fill="var(--vhs-dim)">{l}</text>)}
          {dueBy.map((amt, i) => amt > 0 && (
            <g key={`due-${i}`}>
              <path d={`M${x(i + 1) - 5} ${BOTTOM + 6} L${x(i + 1) + 5} ${BOTTOM + 6} L${x(i + 1)} ${BOTTOM + 14} Z`} fill="var(--critical)" />
              <text x={x(i + 1)} y={TOP + 2} fontSize="10" textAnchor="middle" fill="var(--critical)">−{money(amt)} PRODUCTION</text>
              <line x1={x(i + 1)} x2={x(i + 1)} y1={TOP + 6} y2={BOTTOM} stroke="var(--critical)" strokeDasharray="2 3" opacity="0.6" />
            </g>
          ))}
          {series.map((s) => {
            const p = pts(s);
            return (
              <g key={s.key}>
                <polyline points={p.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={SCENARIO_COLOR[s.key]} strokeWidth="2.5" strokeDasharray={s.key === 'MID' ? '5 4' : undefined} strokeLinejoin="round" />
                {p.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={SCENARIO_COLOR[s.key]}><title>{`${s.label}: ${labels[i]} ${money(v)}`}</title></circle>)}
                <text x={X1 + 6} y={y(p[p.length - 1]) + 4} fontSize="11" fill={SCENARIO_COLOR[s.key]} className="font-display">{money(p[p.length - 1])}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="mt-1">
        <summary className="stat-sub cursor-pointer">SHOW AS TABLE</summary>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full min-w-[480px] text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <caption className="sr-only">Cash at the end of each month, by case</caption>
            <thead><tr className="stat-label text-left">
              <th scope="col" className="px-2 py-1 font-normal">Month</th>
              {series.map((s) => <th key={s.key} scope="col" className="px-2 py-1 text-right font-normal">{s.label}</th>)}
              <th scope="col" className="px-2 py-1 text-right font-normal">Production paid</th>
            </tr></thead>
            <tbody>
              {plan.months.map((m, i) => (
                <tr key={m} className="border-t border-[var(--crt-mid)]">
                  <th scope="row" className="px-2 py-1 text-left font-normal">{ymLabel(m)}{i === 0 ? ' (rest)' : ''}</th>
                  {series.map((s) => <td key={s.key} className={`px-2 py-1 text-right ${s.closing[i] < 0 ? 'tier-red' : ''}`}>{money(s.closing[i])}</td>)}
                  <td className="px-2 py-1 text-right">{dueBy[i] ? `−${money(dueBy[i])}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

// ── a typical month: what comes in vs what goes out ──

function TypicalMonth({ plan, basis }: { plan: CashPlan; basis: string }) {
  const ins = [
    { label: 'Shopify + PayPal payouts', value: plan.moneyIn.payouts, kind: 'in' as const },
    ...(plan.moneyIn.tagged > 0 ? [{ label: 'Tagged stockist & client money', value: plan.moneyIn.tagged, kind: 'in' as const }] : []),
    ...(plan.moneyIn.untaggedInBasis > 0 ? [{ label: 'Untagged deposits (not counted)', value: plan.moneyIn.untaggedInBasis, kind: 'untagged' as const }] : []),
  ];
  const outs = plan.moneyOut.source === 'ACTUAL'
    ? [...plan.moneyOut.byKind.map((k) => ({ label: KIND_LABEL[k.kind], value: k.monthly, kind: 'out' as const })),
      ...(plan.moneyOut.productionAvg > 0 ? [{ label: 'Production (planned from runs instead)', value: plan.moneyOut.productionAvg, kind: 'excluded' as const }] : [])]
    : [{ label: 'Your recurring cost lines', value: plan.moneyOut.monthly, kind: 'out' as const }];
  const max = Math.max(...ins.map((r) => r.value), ...outs.map((r) => r.value), 1);
  const fill = { in: 'var(--phase-1)', untagged: 'repeating-linear-gradient(135deg, var(--phase-1) 0 2px, color-mix(in srgb, var(--phase-1) 16%, transparent) 2px 6px)', out: 'var(--phase-2)', excluded: 'var(--vhs-dim)' };
  const net = plan.moneyIn.payouts + plan.moneyIn.tagged - plan.moneyOut.monthly;
  const Row = ({ r }: { r: { label: string; value: number; kind: keyof typeof fill } }) => (
    <li className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-[0.8rem]">
      <span className={`truncate ${r.kind === 'excluded' || r.kind === 'untagged' ? 'dim' : ''}`} title={r.label}>{r.label}</span>
      <span className="block h-3 w-full" aria-hidden>
        <span className="block h-full rounded-sm" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: fill[r.kind], opacity: r.kind === 'excluded' ? 0.45 : 1 }} />
      </span>
      <span className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(r.value)}</span>
    </li>
  );
  return (
    <Card title={`A TYPICAL MONTH · ${basis} AVERAGE`} head={<span className={net < 0 ? 'tier-red' : 'tier-green'}>{money(net, { signed: true })}/MO COUNTED</span>} note={
      `IN IS MONEY THAT REACHED THE BANK; OUT IS BANK + CARD SPENDING WHEN CHARGED. ADS ARE BILLING DATES, NOT WHEN THEY RAN. PRODUCTION IS SHOWN FOR SCALE ONLY — THE FORECAST TAKES IT FROM YOUR RUNS.`
    }>
      <h4 className="stat-label">IN</h4>
      <ul className="mt-1 space-y-1.5" aria-label="Money in, typical month">{ins.map((r) => <Row key={r.label} r={r} />)}</ul>
      <h4 className="stat-label mt-3">OUT</h4>
      <ul className="mt-1 space-y-1.5" aria-label="Money out, typical month">{outs.map((r) => <Row key={r.label} r={r} />)}</ul>
    </Card>
  );
}
