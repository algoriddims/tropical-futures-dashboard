// Visual look: 'paper' (light, quiet, Are.na-like), 'dark' (the same quiet
// layout on charcoal) or 'terminal' (the original CRT). Purely
// presentational: every desk, number and shortcut is the same in all three.
// Remembered per browser; with no saved choice, the quiet look follows the
// system light/dark setting. Storage failures fall back to the default.

export type Look = 'paper' | 'dark' | 'terminal';

export const LOOKS: Look[] = ['paper', 'dark', 'terminal'];
export const DEFAULT_LOOK: Look = 'paper';
const KEY = 'tfi-look-v1';

const isLook = (v: unknown): v is Look => LOOKS.includes(v as Look);

export function systemLook(): Look {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

export function loadLook(): Look {
  try {
    const v = localStorage.getItem(KEY);
    return isLook(v) ? v : systemLook();
  } catch {
    return systemLook();
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // remembered for this session only
  }
}

/** T cycles PAPER → DARK → TERMINAL → PAPER. */
export function nextLook(look: Look): Look {
  return LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length];
}
