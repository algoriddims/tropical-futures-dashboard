// ── Manual data slices ────────────────────────────────────────────────────
// These parts of ParkData have no API source — no service can sync your bank
// balance, your cost lines, or your planning inputs. They are entered by hand
// in the terminal and persisted to this browser's localStorage, then merged
// on top of whatever the source loads. Stockist shelf counts are SYNC-OWNED:
// the sync agent collects them with the rest of the snapshot, and each import
// replaces them wholesale.

import type { CostItem, ParkData } from './types';

export interface ManualSlices {
  bankBalance: number;
  costs: CostItem[];
  /** planning inputs — strategy is yours, not the sync's */
  growthTargetPct: number;
  wholesalePct: number;
  nextDrop: { name: string; date: string } | null;
  annualBudget: number;
}

const KEY = 'tfi-manual-v1';

export function loadManual(): Partial<ManualSlices> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ManualSlices>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function applyManual(base: ParkData, m: Partial<ManualSlices>): ParkData {
  return {
    ...base,
    bankBalance: m.bankBalance ?? base.bankBalance,
    costs: m.costs ?? base.costs,
    growthTargetPct: m.growthTargetPct ?? base.growthTargetPct ?? 25,
    wholesalePct: m.wholesalePct ?? base.wholesalePct ?? 0.6,
    nextDrop: m.nextDrop !== undefined ? m.nextDrop : base.nextDrop ?? null,
    annualBudget: m.annualBudget ?? base.annualBudget ?? 0,
  };
}

export function persistManual(d: ParkData): void {
  const slices: ManualSlices = {
    bankBalance: d.bankBalance,
    costs: d.costs,
    growthTargetPct: d.growthTargetPct,
    wholesalePct: d.wholesalePct,
    nextDrop: d.nextDrop,
    annualBudget: d.annualBudget,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(slices));
  } catch {
    // storage full or unavailable — the session still works, nothing persists
  }
}

// ── Imported sync data ────────────────────────────────────────────────────
// A full ParkData snapshot produced externally (e.g. the Claude Code sync
// writing park-data.json) and pasted into the terminal's IMPORT modal.
// Stored whole; manual slices (bank, costs, planning inputs) are re-applied
// on top — those always belong to the terminal, not the sync. Each import
// also archives the previous snapshot so the terminal can brief you on what
// changed since the last sync.

const DATA_KEY = 'tfi-data-v1';
const PREV_KEY = 'tfi-data-prev-v1';

interface StoredSync {
  savedAt: string; // ISO timestamp
  payload: ParkData;
}

export function isParkData(v: unknown): v is ParkData {
  const p = v as ParkData | null;
  return !!p
    && Array.isArray(p.products) && Array.isArray(p.pipeline)
    && Array.isArray(p.channels) && Array.isArray(p.campaigns)
    && Array.isArray(p.days) && Array.isArray(p.orders)
    && typeof p.grossMargin === 'number' && typeof p.targetRoas === 'number';
}

function readSync(key: string): StoredSync | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // current shape: wrapper with savedAt; legacy shape: bare ParkData
    if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
      const s = parsed as StoredSync;
      return isParkData(s.payload) ? s : null;
    }
    return isParkData(parsed) ? { savedAt: '', payload: parsed } : null;
  } catch {
    return null;
  }
}

export function loadImported(): StoredSync | null {
  return readSync(DATA_KEY);
}

export function loadPreviousSync(): ParkData | null {
  return readSync(PREV_KEY)?.payload ?? null;
}

export function persistImported(d: ParkData): string {
  try {
    const existing = readSync(DATA_KEY);
    if (existing) localStorage.setItem(PREV_KEY, JSON.stringify(existing));
    const savedAt = new Date().toISOString();
    localStorage.setItem(DATA_KEY, JSON.stringify({ savedAt, payload: d } satisfies StoredSync));
    return savedAt;
  } catch {
    return '';
  }
}

export function clearImported(): void {
  try {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(PREV_KEY);
  } catch {
    // non-fatal
  }
}
