// ── Display formatting ────────────────────────────────────────────────────
// One place for money and counts, so every desk writes "−$1,548" the same way
// (true minus sign, no "$-…", no "$17,625.5", no "$1,970.753").

export interface MoneyOpts {
  /** Always show cents (account balances). Default: whole dollars. */
  cents?: boolean;
  /** Prefix positive values with "+" (deltas). */
  signed?: boolean;
}

/** null/undefined/NaN → "—": unknown is not zero. */
export function money(n: number | null | undefined, opts: MoneyOpts = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const digits = opts.cents ? 2 : 0;
  const abs = Math.abs(n);
  const rounded = Number(abs.toFixed(digits));
  const body = rounded.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const isZero = rounded === 0;
  const sign = n < 0 && !isZero ? '−' : opts.signed && !isZero ? '+' : '';
  return `${sign}$${body}`;
}

/** "1 unit", "3 units"; keeps the word's case ("3 UNITS"). */
export function plural(n: number, word: string, many = `${word}${word === word.toUpperCase() ? 'S' : 's'}`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;
}

/** Percent with a true minus sign; null → "—". */
export function pct(n: number | null | undefined, digits = 0, signed = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const v = Number(n.toFixed(digits));
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}
