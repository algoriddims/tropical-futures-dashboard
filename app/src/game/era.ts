// ── ERA (bank + card) → snapshot ──────────────────────────────────────────
// Adds business bank balances and a monthly cash-flow summary to a snapshot,
// from a read-only ERA extract. Only accounts on the allow-list are used —
// the owner chose them; personal and investment accounts never enter.
//
// Classification is our own, rule by rule, because ERA's categories don't
// fit a business view (it files Shopify payouts under "Shopping and gear").
// Transfers between the synced accounts are excluded so nothing counts twice.

import type { AccountKind, BankAccount, CashInKind, CashMonth, ParkData, SpendKind } from './types';

export interface EraTxn {
  date: string;              // YYYY-MM-DD (transaction date)
  account: string;           // account id in the extract
  amount: number;            // signed: + money in (or card credit), − money out (or card charge)
  description: string;
  memo?: string;             // free text on incoming transfers, kept for context
  linkedTransfer: boolean;   // ERA matched it to a counterpart in another account
}

export interface EraExtract {
  extractedAt: string;
  from: string;              // first date covered, YYYY-MM-DD
  /** Ids the owner approved. Anything else in the extract is refused. */
  allowedAccounts: string[];
  accounts: (BankAccount & { id: string })[];
  transactions: EraTxn[];
  /**
   * ERA's own monthly spending per account (its cash-flow tool), used as a
   * checksum on the copied transactions: sum of outflows that aren't linked
   * transfers must match to the cent.
   */
  checks: { account: string; month: string; spending: number }[];
}

type Class =
  | { kind: 'INTERNAL' }
  | { kind: 'IN'; to: CashInKind }
  | { kind: 'OUT'; to: SpendKind };

// First match wins. Patterns run on the upper-cased description.
const RULES: { re: RegExp; cls: (t: EraTxn, kind: AccountKind) => Class | null }[] = [
  // moves between the synced accounts
  { re: /CHASE CREDIT CARD|AUTOMATIC PAYMENT|^PAYMENT$|PAYMENT THANK|ODP TRANSFER|TRANSFER (TO|FROM) (CHECKING|SAVINGS)/, cls: () => ({ kind: 'INTERNAL' }) },
  // money in
  { re: /^SHOPIFY$/, cls: (t, k) => (k !== 'CARD' && t.amount > 0 ? { kind: 'IN', to: 'SHOPIFY_PAYOUTS' } : null) },
  { re: /PAYPAL TRANSFER/, cls: (t) => (t.amount > 0 ? { kind: 'IN', to: 'PAYPAL' } : null) },
  { re: /REAL TIME TRANSFER RECD/, cls: (t) => (t.amount > 0 ? { kind: 'IN', to: 'OWNER_TRANSFERS' } : null) },
  // spending
  { re: /PEACHY PRINT|ALIPAY|OUTGOING WIRE/, cls: () => ({ kind: 'OUT', to: 'PRODUCTION' }) },
  { re: /QWIK PACK|\bUPS\b|USPS|FEDEX|DHL|DELBROS/, cls: () => ({ kind: 'OUT', to: 'SHIPPING' }) },
  { re: /^FACEBOOK$|FACEBK/, cls: () => ({ kind: 'OUT', to: 'ADS' }) },
  { re: /OVERDRAFT|WIRE FEE|MEMBERSHIP FEE|SERVICE FEE/, cls: () => ({ kind: 'OUT', to: 'BANK_FEES' }) },
  { re: /ZELLE/, cls: () => ({ kind: 'OUT', to: 'ZELLE' }) },
  {
    re: /QUICKBOOKS|INTUIT|ADOBE|CURSOR|GOOGLE|KLAVIYO|ANTHROPIC|CLAUDE|MOONSHOT|ELEVENLABS|OBSIDIAN|TYPEFORM|FIGMA|BLUEHOST|PROTON|PERPLEXITY|RADAR|DIVISARE|META PAY|^SHOPIFY$/,
    cls: () => ({ kind: 'OUT', to: 'SOFTWARE' }),
  },
];

export function classify(t: EraTxn, kind: AccountKind): Class {
  const d = t.description.toUpperCase();
  for (const r of RULES) {
    if (r.re.test(d)) {
      const c = r.cls(t, kind);
      if (c) return c;
    }
  }
  return t.amount > 0 ? { kind: 'IN', to: 'OTHER_IN' } : { kind: 'OUT', to: 'OTHER' };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(round2(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface EraLayer {
  accounts: BankAccount[];
  cashflow: CashMonth[];
  notes: string[];
}

export function buildEraLayer(x: EraExtract, now: Date = new Date(x.extractedAt)): EraLayer {
  const allowed = new Set(x.allowedAccounts);
  const stray = [...x.accounts.map((a) => a.id), ...x.transactions.map((t) => t.account)].filter((id) => !allowed.has(id));
  if (stray.length) throw new Error(`Extract contains accounts outside the approved list: ${[...new Set(stray)].join(', ')}`);
  const kindOf = new Map(x.accounts.map((a) => [a.id, a.kind]));
  for (const t of x.transactions) if (!kindOf.has(t.account)) throw new Error(`Transaction on unknown account ${t.account}`);

  // checksum against ERA's own monthly totals
  const bad: string[] = [];
  for (const c of x.checks) {
    const sum = x.transactions
      .filter((t) => t.account === c.account && t.date.startsWith(c.month) && t.amount < 0 && !t.linkedTransfer)
      .reduce((s, t) => s - t.amount, 0);
    if (Math.abs(sum - c.spending) > 0.005) bad.push(`${c.account} ${c.month}: copied ${fmt(sum)} vs ERA ${fmt(c.spending)}`);
  }
  if (bad.length) throw new Error(`Transactions don't match ERA's monthly totals — re-extract:\n${bad.join('\n')}`);

  const months = new Map<string, CashMonth>();
  const monthOf = (m: string) => {
    let cm = months.get(m);
    if (!cm) { cm = { month: m, partial: false, cashIn: {}, spend: {} }; months.set(m, cm); }
    return cm;
  };
  const other: string[] = [];
  const owner: string[] = [];
  let fees = 0;
  for (const t of [...x.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const c = classify(t, kindOf.get(t.account)!);
    const cm = monthOf(t.date.slice(0, 7));
    if (c.kind === 'INTERNAL') continue;
    if (c.kind === 'IN') {
      cm.cashIn[c.to] = round2((cm.cashIn[c.to] ?? 0) + t.amount);
      if (c.to === 'OWNER_TRANSFERS') owner.push(`${t.date} ${fmt(t.amount)}${t.memo ? ` "${t.memo}"` : ''}`);
      if (c.to === 'OTHER_IN') other.push(`${t.date} ${t.description} +${fmt(t.amount)}`);
    } else {
      // a refund on a spend line (positive amount) reduces that line
      cm.spend[c.to] = round2((cm.spend[c.to] ?? 0) - t.amount);
      if (c.to === 'OTHER') other.push(`${t.date} ${t.description} ${fmt(-t.amount)}`);
      if (c.to === 'BANK_FEES' && /OVERDRAFT/i.test(t.description)) fees += -t.amount;
    }
  }
  // Calendar month in the business's local time (not UTC), so a sync run on
  // the evening of the last day doesn't mark the next month as current.
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const firstMonth = x.from.slice(0, 7);
  const cashflow = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ ...m, partial: m.month === nowMonth || (m.month === firstMonth && !x.from.endsWith('-01')) }));

  const accounts: BankAccount[] = x.accounts.map((a) => ({
    id: a.id, name: a.name, mask: a.mask, kind: a.kind, balance: round2(a.balance),
    ...(a.available !== undefined ? { available: round2(a.available) } : {}),
    ...(a.creditLimit !== undefined ? { creditLimit: a.creditLimit } : {}),
    asOf: a.asOf,
  }));

  const notes: string[] = [];
  const label = (a: BankAccount) => `${a.name} ••${a.mask}`;
  notes.push(`Bank: only the business accounts you approved are included — ${accounts.map(label).join(', ')}. Balances as reported by the bank via ERA.`);
  notes.push('Cash flow excludes moves between these accounts (card payments, savings sweeps), so card spending counts once, when charged.');
  for (const a of accounts) if (a.kind !== 'CARD' && a.balance < 0) notes.push(`${label(a)} is overdrawn (${fmt(a.balance)}).`);
  if (fees > 0) notes.push(`Overdraft fees in this period: ${fmt(fees)}.`);
  if (owner.length) {
    notes.push(`Transfers in from the owner's personal account (${owner.length}) — memos suggest partner sales or design income, but they are not counted as sales: ${owner.join('; ')}.`);
  }
  if (other.length) notes.push(`Not matched to a spending category (shown as Other): ${other.slice(0, 8).join('; ')}${other.length > 8 ? ` and ${other.length - 8} more` : ''}.`);
  notes.push('Shopify payouts arrive net of Shopify fees and on Shopify\'s schedule, so they differ from Shopify net sales.');
  return { accounts, cashflow, notes };
}

/** Add an ERA layer to a snapshot (e.g. one built from Shopify). */
export function withEra(d: ParkData, x: EraExtract): ParkData {
  const era = buildEraLayer(x);
  const asOf = era.accounts.map((a) => a.asOf).sort()[0];
  const meta = d.meta ?? {};
  return {
    ...d,
    accounts: era.accounts,
    cashflow: era.cashflow,
    meta: {
      ...meta,
      sources: [...(meta.sources ?? []), { label: 'ERA', extractedAt: x.extractedAt, coverageEnd: asOf }],
      notes: [...(meta.notes ?? []), ...era.notes],
    },
  };
}
