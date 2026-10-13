import type { BankAccount, CashMonth, CashInKind, SpendKind } from '@/game/types';
import { monthIn, monthSpend } from '@/game/engine';

const money = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString()}`;

/** One line per synced account: cash held, or amount owed on a card. */
export function AccountLines({ accounts }: { accounts: BankAccount[] }) {
  return (
    <div className="space-y-0.5 text-[0.72rem]">
      {accounts.map((a) => (
        <div key={a.id} className="flex justify-between gap-3">
          <span className="dim truncate">{a.name} ••{a.mask}</span>
          <span className={a.kind === 'CARD' ? 'tier-amber' : a.balance < 0 ? 'tier-red' : 'warm'}>
            {a.kind === 'CARD' ? `${money(a.balance)} OWED` : money(a.balance)}
          </span>
        </div>
      ))}
      <div className="dim">
        FROM ERA · AS OF {new Date(accounts.map((a) => a.asOf).sort()[0]).toLocaleString()}
      </div>
    </div>
  );
}

const IN_LABEL: Record<CashInKind, string> = {
  SHOPIFY_PAYOUTS: 'SHOPIFY PAYOUTS',
  PAYPAL: 'PAYPAL',
  OWNER_TRANSFERS: 'FROM OWNER',
  OTHER_IN: 'OTHER IN',
};
const SPEND_LABEL: Record<SpendKind, string> = {
  PRODUCTION: 'PRODUCTION & SUPPLIERS',
  SHIPPING: 'SHIPPING & CUSTOMS',
  ADS: 'ADS (META BILLING)',
  SOFTWARE: 'SOFTWARE & SUBSCRIPTIONS',
  ZELLE: 'ZELLE PAYMENTS',
  BANK_FEES: 'BANK FEES',
  OTHER: 'OTHER',
};
const IN_ORDER = Object.keys(IN_LABEL) as CashInKind[];
const SPEND_ORDER = Object.keys(SPEND_LABEL) as SpendKind[];

/** Month-by-month business cash in and spending across the synced accounts. */
export function CashFlowTable({ months }: { months: CashMonth[] }) {
  const ins = IN_ORDER.filter((k) => months.some((m) => m.cashIn[k]));
  const outs = SPEND_ORDER.filter((k) => months.some((m) => m.spend[k]));
  const label = (m: CashMonth) =>
    `${new Date(`${m.month}-15`).toLocaleString('en-US', { month: 'short' }).toUpperCase()}${m.partial ? '*' : ''}`;
  const cell = (v: number | undefined) => (v ? whole(v) : '—');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.74rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr className="border-b border-[var(--crt-mid)] text-left font-display text-xs dim">
            <th className="py-1 font-normal" />
            {months.map((m) => <th key={m.month} className="py-1 text-right font-normal">{label(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {ins.map((k) => (
            <tr key={k} className="border-b border-[var(--crt-mid)]">
              <td className="py-1 dim">{IN_LABEL[k]}</td>
              {months.map((m) => <td key={m.month} className="py-1 text-right tier-green">{cell(m.cashIn[k])}</td>)}
            </tr>
          ))}
          <tr className="border-b border-[var(--crt-line)] font-display">
            <td className="py-1">CASH IN</td>
            {months.map((m) => <td key={m.month} className="py-1 text-right tier-green">{whole(monthIn(m))}</td>)}
          </tr>
          {outs.map((k) => (
            <tr key={k} className="border-b border-[var(--crt-mid)]">
              <td className="py-1 dim">{SPEND_LABEL[k]}</td>
              {months.map((m) => <td key={m.month} className="py-1 text-right warm">{cell(m.spend[k])}</td>)}
            </tr>
          ))}
          <tr className="border-b border-[var(--crt-line)] font-display">
            <td className="py-1">SPENDING</td>
            {months.map((m) => <td key={m.month} className="py-1 text-right tier-red">{whole(monthSpend(m))}</td>)}
          </tr>
          <tr className="font-display">
            <td className="py-1">NET</td>
            {months.map((m) => {
              const net = monthIn(m) - monthSpend(m);
              return <td key={m.month} className={`py-1 text-right ${net < 0 ? 'tier-red' : 'tier-green'}`}>{whole(net)}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <div className="mt-1 text-[0.68rem] dim">
        * MONTH NOT COMPLETE. CARD SPENDING COUNTS WHEN CHARGED; CARD PAYMENTS AND SAVINGS SWEEPS ARE EXCLUDED. FROM-OWNER TRANSFERS ARE NOT SALES.
      </div>
    </div>
  );
}
