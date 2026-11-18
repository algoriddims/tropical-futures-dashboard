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

/**
 * Shorten a long name from the middle so both ends stay readable:
 * "Thinking Like an Archipelago Cap in Ivy" → "Thinking Like an…Cap in Ivy".
 * Product names often differ only at the end (colour), so plain truncation
 * makes several rows look the same.
 */
export function shortName(name: string, max = 30): string {
  const t = name.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const words = t.split(' ');
  // whole words from the end (up to half the room), then whole words from the start
  let tail = words[words.length - 1];
  for (let i = words.length - 2; i > 0 && `${words[i]} ${tail}`.length <= Math.floor(max / 2); i--) tail = `${words[i]} ${tail}`;
  const room = max - 1 - tail.length;
  let head = '';
  for (const w of words) { const next = head ? `${head} ${w}` : w; if (next.length > room) break; head = next; }
  if (!head) head = t.slice(0, Math.max(1, room));
  if (tail.length > max - 2) return `${t.slice(0, max - 1)}…`;
  return `${head}…${tail}`;
}
