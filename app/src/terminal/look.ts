// Visual look: 'paper' (light, quiet, Are.na-like) or 'terminal' (the
// original CRT). Purely presentational: every desk, number and shortcut is
// the same in both. Remembered per browser; storage failures fall back to
// the default.

export type Look = 'paper' | 'terminal';

export const DEFAULT_LOOK: Look = 'paper';
const KEY = 'tfi-look-v1';

export function loadLook(): Look {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'terminal' || v === 'paper' ? v : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // remembered for this session only
  }
}
