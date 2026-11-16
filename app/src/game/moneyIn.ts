// ── Money in vs money out, all channels ───────────────────────────────────
// The goal counts everything the business is paid, not only Shopify: stockist
// payouts and client work arrive as bank deposits the bank can't label. Each
// such deposit is tagged once by the owner; untagged ones are shown and never
// counted, so the total is a floor until they're tagged. Bank basis throughout
// (money received, money spent) — Shopify payouts arrive days after the sale
// and net of Shopify's fees, so this is not the same number as Shopify sales.
//
// Pure functions over the snapshot. Dollars in, dollars out; sums run in cents.

import type { BankDeposit, CashMonth, DepositTag, ParkData, VendorMark, VendorSpend } from './types';

const cents = (n: number | undefined) => Math.round((n ?? 0) * 100);
const dollars = (c: number) => c / 100;

export interface MonthMoney {
  month: string;                 // YYYY-MM
  partial: boolean;              // the month isn't over yet
  shopify: number;               // Shopify payouts received
  paypal: number;                // PayPal transfers received
  stockist: number;              // deposits tagged STOCKIST
  client: number;                // deposits tagged CLIENT
  /** Counted toward the goal: shopify + paypal + stockist + client. */
  counted: number;
  /** Deposits not yet tagged — not counted. */
  untagged: number;
  /** null when the snapshot has the monthly lines but not the individual deposits (re-sync to tag). */
  untaggedCount: number | null;
  /** Deposits tagged NOT_REVENUE (the owner's own money, refunds, loans). */
  notRevenue: number;
  spending: number;
  /** counted − spending. */
  net: number;
  /** 'partial' while any deposit is untagged: counted is then a floor, not the total. */
  status: 'valid' | 'partial';
}

type MoneyInput = Pick<ParkData, 'cashflow' | 'deposits' | 'depositTags'>;

export function monthMoney(d: MoneyInput, month: string): MonthMoney | null {
  const m: CashMonth | undefined = d.cashflow?.find((x) => x.month === month);
  if (!m) return null;
  const tags = d.depositTags ?? {};
  const by = { STOCKIST: 0, CLIENT: 0, NOT_REVENUE: 0 } as Record<DepositTag, number>;
  let untagged = 0;
  let untaggedCount: number | null = 0;
  if (d.deposits) {
    for (const x of d.deposits) {
      if (!x.date.startsWith(month)) continue;
      const tag = tags[x.id];
      if (tag) by[tag] += cents(x.amount);
      else { untagged += cents(x.amount); untaggedCount! += 1; }
    }
  } else {
    // an older snapshot: the lines exist but can't be tagged one by one
    untagged = cents(m.cashIn.OWNER_TRANSFERS) + cents(m.cashIn.OTHER_IN);
    untaggedCount = untagged ? null : 0;
  }
  const shopify = cents(m.cashIn.SHOPIFY_PAYOUTS);
  const paypal = cents(m.cashIn.PAYPAL);
  const counted = shopify + paypal + by.STOCKIST + by.CLIENT;
  const spending = Object.values(m.spend).reduce((s, v) => s + cents(v), 0);
  return {
    month, partial: m.partial,
    shopify: dollars(shopify), paypal: dollars(paypal), stockist: dollars(by.STOCKIST), client: dollars(by.CLIENT),
    counted: dollars(counted), untagged: dollars(untagged), untaggedCount, notRevenue: dollars(by.NOT_REVENUE),
    spending: dollars(spending), net: dollars(counted - spending),
    status: untagged ? 'partial' : 'valid',
  };
}

export interface GoalPace {
  goal: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** Average received per day so far. */
  runningPerDay: number;
  /** Per day needed for the rest of the month; 0 once the goal is met; null on the last day. */
  neededPerDay: number | null;
  met: boolean;
}

/** Pace toward a monthly goal as of `through` (YYYY-MM-DD, a day inside the month). */
export function goalPace(counted: number, goal: number, through: string): GoalPace | null {
  if (!(goal > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) return null;
  const [y, mo, day] = through.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const left = daysInMonth - day;
  const short = Math.max(0, goal - counted);
  return {
    goal, dayOfMonth: day, daysInMonth,
    runningPerDay: counted / day,
    neededPerDay: short === 0 ? 0 : left > 0 ? short / left : null,
    met: counted >= goal,
  };
}

/** Deposits newest first, each with its tag (null = untagged). */
export function taggedDeposits(d: MoneyInput): (BankDeposit & { tag: DepositTag | null })[] {
  const tags = d.depositTags ?? {};
  return [...(d.deposits ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .map((x) => ({ ...x, tag: tags[x.id] ?? null }));
}

// ── Recurring charges ─────────────────────────────────────────────────────

export interface RecurringCharge {
  vendor: string;
  /** Median of the months it was charged, over the complete months looked at. */
  typicalMonthly: number;
  monthsSeen: number;
  monthsLooked: number;
  lastMonth: string;             // YYYY-MM it was last charged (may be the current, unfinished month)
  lastAmount: number;
  /** Charged in one of the last two complete months, or the current one. */
  active: boolean;
  mark: VendorMark | null;
}

export interface OccasionalCharge { vendor: string; total: number; lastMonth: string }

export interface RecurringSummary {
  monthsLooked: string[];        // the complete months used, oldest first
  recurring: RecurringCharge[];  // active first, then largest first
  /** Sum of typicalMonthly over active charges. */
  monthlyTotal: number;
  /** …of which marked CUT. */
  markedToCut: number;
  /** Seen in only one or two months and adding up to at least `occasionalMin`: annual plans, one-offs, new vendors. */
  occasional: OccasionalCharge[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Recurring = charged in at least `minMonths` of the last `window` complete
 * months. Looks only at software and uncategorised spending (vendorSpend),
 * so shipping, ads and production — which vary with sales — stay out.
 */
export function recurringCharges(
  d: Pick<ParkData, 'cashflow' | 'vendorSpend' | 'vendorMarks'>,
  opts: { window?: number; minMonths?: number; occasionalMin?: number } = {},
): RecurringSummary | null {
  const { window = 6, minMonths = 3, occasionalMin = 90 } = opts;
  if (!d.vendorSpend || !d.cashflow?.length) return null;
  const complete = d.cashflow.filter((m) => !m.partial).map((m) => m.month).sort().slice(-window);
  if (!complete.length) return null;
  const current = d.cashflow.filter((m) => m.partial && m.month > complete[complete.length - 1]).map((m) => m.month);
  const recent = new Set([...complete.slice(-2), ...current]);
  const marks = d.vendorMarks ?? {};
  const recurring: RecurringCharge[] = [];
  const occasional: OccasionalCharge[] = [];
  for (const v of d.vendorSpend as VendorSpend[]) {
    const charged = (m: string) => (v.byMonth[m] ?? 0) > 0;
    const seen = complete.filter(charged);
    const all = [...complete, ...current].filter(charged);
    if (!all.length) continue;
    const lastMonth = all[all.length - 1];
    if (seen.length >= Math.min(minMonths, complete.length)) {
      recurring.push({
        vendor: v.vendor,
        typicalMonthly: dollars(Math.round(median(seen.map((m) => cents(v.byMonth[m]))))),
        monthsSeen: seen.length, monthsLooked: complete.length,
        lastMonth, lastAmount: v.byMonth[lastMonth],
        active: all.some((m) => recent.has(m)),
        mark: marks[v.vendor] ?? null,
      });
    } else {
      const total = dollars(all.reduce((s, m) => s + cents(v.byMonth[m]), 0));
      if (total >= occasionalMin) occasional.push({ vendor: v.vendor, total, lastMonth });
    }
  }
  recurring.sort((a, b) => Number(b.active) - Number(a.active) || b.typicalMonthly - a.typicalMonthly || a.vendor.localeCompare(b.vendor));
  occasional.sort((a, b) => b.total - a.total || a.vendor.localeCompare(b.vendor));
  const active = recurring.filter((r) => r.active);
  const sum = (rs: RecurringCharge[]) => dollars(rs.reduce((s, r) => s + cents(r.typicalMonthly), 0));
  return {
    monthsLooked: complete, recurring,
    monthlyTotal: sum(active), markedToCut: sum(active.filter((r) => r.mark === 'CUT')),
    occasional,
  };
}
