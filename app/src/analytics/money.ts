// ── Money in minor units ──────────────────────────────────────────────────
// All analytics money is an integer count of the currency's minor unit
// (cents for USD, yen for JPY, fils for KWD), tagged with its ISO currency.
// Source decimals are parsed from their string form — never via floats — and
// amounts in different currencies are never added together.

export interface Money {
  currency: string;  // ISO 4217
  minor: number;     // integer
}

const exponentCache = new Map<string, number>();

/** Decimal places of a currency's minor unit (USD 2, JPY 0, KWD 3), from the runtime's ISO data. */
export function currencyExponent(currency: string): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  let exp: number;
  try {
    exp = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new Error(`Unknown currency code "${currency}"`);
  }
  exponentCache.set(currency, exp);
  return exp;
}

/**
 * Parse a decimal string ("423.25", "-6.75", "52.906", "1e3" is rejected) into
 * minor units, rounding half away from zero beyond the currency's exponent.
 * Returns null for blank input (the source reported no value — not zero).
 */
export function parseMinor(value: string | number | null | undefined, currency: string): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Not a plain decimal amount: "${s}"`);
  const exp = currencyExponent(currency);
  const neg = m[1] === '-';
  const whole = m[2];
  const frac = (m[3] ?? '');
  const kept = frac.slice(0, exp).padEnd(exp, '0');
  const next = frac.charCodeAt(exp) - 48; // digit after the kept ones, NaN if none
  let minor = Number(whole) * 10 ** exp + (kept ? Number(kept) : 0);
  if (next >= 5) minor += 1;
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: "${s}"`);
  return neg ? -minor : minor;
}

export const money = (minor: number, currency: string): Money => ({ minor, currency });

/** Sum amounts of ONE currency. Throws on mixed currencies — convert first, with a documented rate. */
export function sumMoney(items: Money[], currency: string): Money {
  let minor = 0;
  for (const m of items) {
    if (m.currency !== currency) throw new Error(`Cannot add ${m.currency} to ${currency} without a conversion rate`);
    minor += m.minor;
  }
  return { currency, minor };
}

/** Group amounts by currency — the safe way to show totals when currencies differ and no FX basis exists. */
export function totalsByCurrency(items: Money[]): Money[] {
  const map = new Map<string, number>();
  for (const m of items) map.set(m.currency, (map.get(m.currency) ?? 0) + m.minor);
  return [...map.entries()].map(([currency, minor]) => ({ currency, minor }));
}

/** Convert with an explicit, dated rate (1 `from` = rate `to`). Rounds half away from zero. */
export function convert(m: Money, to: string, rate: { from: string; to: string; rate: number; asOf: string }): Money {
  if (rate.from !== m.currency || rate.to !== to) throw new Error(`Rate ${rate.from}→${rate.to} doesn't convert ${m.currency}→${to}`);
  const major = m.minor / 10 ** currencyExponent(m.currency);
  const raw = major * rate.rate * 10 ** currencyExponent(to);
  return { currency: to, minor: Math.sign(raw) * Math.round(Math.abs(raw)) };
}

/** Display: "−$1,526.45" / "$518" (whole units unless cents requested). */
export function formatMoney(m: Money | null | undefined, opts: { cents?: boolean; signed?: boolean } = {}): string {
  if (!m) return '—';
  const exp = currencyExponent(m.currency);
  const digits = opts.cents ? exp : 0;
  const major = Math.abs(m.minor) / 10 ** exp;
  const body = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: m.currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(major);
  const isZero = Number(major.toFixed(digits)) === 0;
  const sign = m.minor < 0 && !isZero ? '−' : opts.signed && !isZero ? '+' : '';
  return `${sign}${body}`;
}
