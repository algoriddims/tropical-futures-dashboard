// ── Cash plan: one forecast, on the bank's basis ──────────────────────────
// Replaces two answers that disagreed: "runway = cash ÷ burn" (assumes no
// money comes in) and a forecast that took Shopify net sales as income
// (before fees, and from a one-product spike) while also counting production
// twice (in the spending average and again as runs due).
//
// Money in is money that reached the business accounts, in three cases:
//   LOW  — Shopify + PayPal payouts, the average of the last 3 complete months
//   MID  — LOW + deposits tagged as stockist or client money (same months)
//   HIGH — the last 30 days' Shopify sales at the payout rate seen in those
//          months, + tagged money
// Untagged deposits are never counted. Money out is the average spending of
// the last 3 complete months *without* production (production is planned
// from the runs: unpaid costs on their due month, undated ones now), or the
// owner's own recurring cost lines when any exist.
//
// Pure functions. Dollars in, dollars out.

import type { CashMonth, ParkData, SpendKind } from './types';
import { cardOwed, monthSpend, netCash, oneOffCosts, trailing30dRevenue, monthlyBurn, burnSource } from './engine';
import { runCashDue } from './production';
import { taggedDeposits } from './moneyIn';

export type ScenarioKey = 'LOW' | 'MID' | 'HIGH';

export interface Scenario {
  key: ScenarioKey;
  label: string;
  /** Money in per full month. */
  monthlyIn: number;
  /** Cash at the end of each forecast month (index 0 = rest of the start month). */
  closing: number[];
  low: { index: number; value: number };
  /** First month index whose closing is below zero; null if none within the horizon. */
  runsOutAt: number | null;
}

export interface DueItem { index: number; amount: number; text: string; run: string; dated: boolean }

export interface CashPlan {
  /** Net cash (bank − card) at the balance date. */
  start: number;
  bank: number | null;
  card: number;
  /** The day the balances are from (YYYY-MM-DD) — the forecast starts here. */
  from: string;
  /** YYYY-MM of each forecast month; index 0 is the rest of the start month. */
  months: string[];
  /** Share of month 0 still to come. */
  firstFraction: number;
  basisMonths: string[];
  moneyIn: {
    payouts: number;            // Shopify + PayPal, monthly average
    tagged: number;             // stockist + client deposits, monthly average
    untaggedInBasis: number;    // untagged deposits in the basis months, monthly average (not counted)
    recentSales: number;        // last 30 days of Shopify net sales
    payoutRate: number | null;  // payouts ÷ Shopify net sales over the basis months
  };
  moneyOut: {
    source: 'ACTUAL' | 'COST_LINES';
    monthly: number;            // running costs per month, production excluded (ACTUAL)
    byKind: { kind: SpendKind; monthly: number }[];
    productionAvg: number;      // production spending in the basis months, monthly average — left out, planned from runs
  };
  due: DueItem[];
  scenarios: Scenario[];
}

const SPEND_ORDER: SpendKind[] = ['ADS', 'SOFTWARE', 'SHIPPING', 'OTHER', 'ZELLE', 'BANK_FEES', 'PRODUCTION'];

const ymAdd = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const ymDiff = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Shopify net sales per YYYY-MM from the analytics block (dollars); empty without it. */
function shopifyNetByMonth(d: ParkData): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of d.analytics?.daily ?? []) out.set(r.date.slice(0, 7), (out.get(r.date.slice(0, 7)) ?? 0) + r.netSales / 100);
  return out;
}

/**
 * The cash plan, or null when it can't be made honestly: no cash figure, or
 * no synced months to base money in and out on.
 */
export function cashPlan(d: ParkData, months = 6, today?: string): CashPlan | null {
  const start = netCash(d);
  const flow = d.cashflow ?? [];
  const basis = flow.filter((m) => !m.partial).slice(-3);
  if (start === null || !basis.length) return null;

  // start from the day the balances were read (today when typed in by hand)
  const asOf = d.accounts?.length ? d.accounts.map((a) => a.asOf).sort()[0].slice(0, 10) : (today ?? new Date().toISOString().slice(0, 10));
  const startYm = asOf.slice(0, 7);
  const [y, mo, day] = asOf.split('-').map(Number);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const firstFraction = (dim - day) / dim;
  const basisMonths = basis.map((m) => m.month);

  // money in
  const payouts = avg(basis.map((m) => (m.cashIn.SHOPIFY_PAYOUTS ?? 0) + (m.cashIn.PAYPAL ?? 0)));
  const deps = taggedDeposits(d).filter((x) => basisMonths.includes(x.date.slice(0, 7)));
  const tagged = deps.filter((x) => x.tag === 'STOCKIST' || x.tag === 'CLIENT').reduce((s, x) => s + x.amount, 0) / basis.length;
  const untaggedInBasis = deps.filter((x) => !x.tag).reduce((s, x) => s + x.amount, 0) / basis.length;
  const net = shopifyNetByMonth(d);
  const salesInBasis = basisMonths.reduce((s, m) => s + (net.get(m) ?? 0), 0);
  const shopifyPayouts = basis.reduce((s, m) => s + (m.cashIn.SHOPIFY_PAYOUTS ?? 0), 0);
  const payoutRate = salesInBasis > 0 && basisMonths.every((m) => net.has(m)) ? Math.min(1, shopifyPayouts / salesInBasis) : null;
  const recentSales = trailing30dRevenue(d);

  // money out
  const source = burnSource(d) === 'COST_LINES' ? 'COST_LINES' : 'ACTUAL';
  const kindAvg = (k: SpendKind) => avg(basis.map((m: CashMonth) => m.spend[k] ?? 0));
  const byKind = SPEND_ORDER.filter((k) => k !== 'PRODUCTION').map((kind) => ({ kind, monthly: round2(kindAvg(kind)) })).filter((x) => x.monthly > 0);
  const productionAvg = round2(kindAvg('PRODUCTION'));
  const monthlyOut = source === 'COST_LINES' ? monthlyBurn(d) : round2(avg(basis.map((m) => monthSpend(m) - (m.spend.PRODUCTION ?? 0))));

  // production and one-off costs, on their month
  const due: DueItem[] = runCashDue(d.productionRuns ?? []).map((c) => ({
    index: c.due ? Math.max(0, Math.min(months, ymDiff(startYm, c.due.slice(0, 7)))) : 0,
    amount: c.amount, text: `${c.run}: ${c.description}`, run: c.run, dated: !!c.due,
  }));
  const oneOff = oneOffCosts(d);
  if (oneOff > 0) due.push({ index: 0, amount: oneOff, text: 'One-off cost lines', run: 'One-off cost lines', dated: false });

  const monthsYm = Array.from({ length: months + 1 }, (_, i) => ymAdd(startYm, i));
  const run = (key: ScenarioKey, label: string, monthlyIn: number): Scenario => {
    const closing: number[] = [];
    let cash = start;
    for (let i = 0; i <= months; i++) {
      const f = i === 0 ? firstFraction : 1;
      cash += (monthlyIn - monthlyOut) * f - due.filter((x) => x.index === i).reduce((s, x) => s + x.amount, 0);
      closing.push(round2(cash));
    }
    const lowIdx = closing.reduce((b, v, i) => (v < closing[b] ? i : b), 0);
    const out = closing.findIndex((v) => v < 0);
    return { key, label, monthlyIn: round2(monthlyIn), closing, low: { index: lowIdx, value: closing[lowIdx] }, runsOutAt: out === -1 ? null : out };
  };
  const highIn = payoutRate !== null ? recentSales * payoutRate + tagged : recentSales + tagged;
  const scenarios = [
    run('LOW', 'Payouts only', payouts),
    run('MID', 'Payouts + tagged stockist & client money', payouts + tagged),
    run('HIGH', payoutRate !== null ? "Last 30 days' sales pace, after fees" : "Last 30 days' sales pace (before fees)", highIn),
  ];

  return {
    start, bank: d.bankBalance, card: cardOwed(d) ?? 0, from: asOf, months: monthsYm, firstFraction, basisMonths,
    moneyIn: { payouts: round2(payouts), tagged: round2(tagged), untaggedInBasis: round2(untaggedInBasis), recentSales: round2(recentSales), payoutRate },
    moneyOut: { source, monthly: monthlyOut, byKind, productionAvg },
    due, scenarios,
  };
}

export interface CashVerdict { tone: 'red' | 'amber' | 'green'; title: string; detail: string }

const ymLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).toUpperCase().replace(' ', ' ’');

/**
 * One sentence on cash, from the cautious case: money reaching the bank as
 * payouts only. Never says "self-funding" on the strength of a sales spike.
 */
export function cashVerdict(p: CashPlan): CashVerdict {
  const low = p.scenarios[0];
  const high = p.scenarios[2];
  const months = p.months.length - 1;
  if (p.start < 0) return { tone: 'red', title: 'SHORT NOW', detail: `Net of the card, cash is −$${Math.abs(Math.round(p.start)).toLocaleString('en-US')}.` };
  if (low.runsOutAt !== null) {
    return {
      tone: 'red', title: `AT PAYOUTS ONLY, CASH RUNS OUT IN ${ymLabel(p.months[low.runsOutAt])}`,
      detail: high.runsOutAt === null ? 'At the last 30 days’ sales pace it holds — the gap between the two is the decision.' : 'Even at the last 30 days’ sales pace it runs out.',
    };
  }
  const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
  const lowNet = low.monthlyIn - p.moneyOut.monthly;
  const highNet = high.monthlyIn - p.moneyOut.monthly;
  const end = low.closing[low.closing.length - 1];
  const pace = `At the last 30 days’ sales pace it ${highNet >= 0 ? 'grows' : 'falls'} about ${usd(highNet)} a month.`;
  if (low.low.value < p.moneyOut.monthly) {
    return { tone: 'amber', title: `AT PAYOUTS ONLY, CASH DIPS TO ${usd(low.low.value)} IN ${ymLabel(p.months[low.low.index])}`, detail: `Less than one month of running costs left at the low point. ${pace}` };
  }
  if (lowNet < 0) {
    return { tone: 'amber', title: `AT PAYOUTS ONLY, CASH FALLS ABOUT ${usd(lowNet)} A MONTH`, detail: `${usd(end)} by ${ymLabel(p.months[p.months.length - 1])}, after production still owed. ${pace}` };
  }
  return {
    tone: 'green', title: `CASH HOLDS FOR ${months} MONTHS EVEN AT PAYOUTS ONLY`,
    detail: `Lowest ${usd(low.low.value)} in ${ymLabel(p.months[low.low.index])}. Production you haven't recorded isn't included.`,
  };
}

export { ymLabel };
