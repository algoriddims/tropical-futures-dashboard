// ── Field ownership ───────────────────────────────────────────────────────
// Who owns each part of ParkData:
//
//   MANUAL (terminal)  bankBalance, costs, growthTargetPct, wholesalePct,
//                      nextDrop, annualBudget, monthlySalesGoal — entered by hand, persisted to
//                      localStorage, re-applied over every import.
//   SYNC (import)      everything else — products, pipeline, channels, orders,
//                      campaigns, days, quests, rates, meta. Replaced whole by
//                      each valid import.
//   SYNC + OVERRIDE    stockist/pop-up shelf counts (allocated, sold). The
//                      sync owns them, but a hand correction is recorded as a
//                      ShelfEdit with the sync value it replaced. A later
//                      import never silently overwrites an edit: if the sync
//                      value moved, the edit is flagged as a conflict for the
//                      user to resolve.

import type { CostItem, ParkData } from './types';
import { syncedCash } from './engine';
import { validateParkData } from './validate';

export const FIELD_OWNERSHIP = {
  manual: ['bankBalance', 'costs', 'growthTargetPct', 'wholesalePct', 'nextDrop', 'annualBudget', 'monthlySalesGoal'],
  syncWithOverride: ['channels[].stock[].allocated', 'channels[].stock[].sold'],
} as const;

export type ShelfField = 'allocated' | 'sold';

export interface ShelfEdit {
  channel: string;
  productId: string;
  field: ShelfField;
  value: number;
  /** The sync's value when the edit was made (null if the row had no sync value). */
  base: number | null;
  editedAt: string; // ISO
}

export interface ManualSlices {
  /** Hand-entered cash; only used when no bank accounts are synced. */
  bankBalance: number | null;
  costs: CostItem[];
  /** planning inputs — strategy is yours, not the sync's */
  growthTargetPct: number;
  wholesalePct: number;
  nextDrop: { name: string; date: string } | null;
  annualBudget: number;
  monthlySalesGoal: number;
  shelfEdits: ShelfEdit[];
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
    // Synced bank accounts own the balance when present; manual entry is the fallback.
    bankBalance: syncedCash(base) ?? m.bankBalance ?? base.bankBalance ?? null,
    costs: m.costs ?? base.costs,
    growthTargetPct: m.growthTargetPct ?? base.growthTargetPct ?? 25,
    wholesalePct: m.wholesalePct ?? base.wholesalePct ?? 0.6,
    nextDrop: m.nextDrop !== undefined ? m.nextDrop : base.nextDrop ?? null,
    annualBudget: m.annualBudget ?? base.annualBudget ?? 0,
    monthlySalesGoal: m.monthlySalesGoal ?? base.monthlySalesGoal ?? 0,
  };
}

/**
 * The manual scalar slices of a ParkData (shelf edits live separately).
 * While bank accounts are synced, d.bankBalance is the bank's figure, not a
 * hand entry — it's left out so it can't be saved as one and resurface,
 * stale and undated, under a later sync without the bank.
 */
export function extractManual(d: ParkData): Partial<Omit<ManualSlices, 'shelfEdits'>> {
  return {
    ...(syncedCash(d) === null ? { bankBalance: d.bankBalance } : {}),
    costs: d.costs,
    growthTargetPct: d.growthTargetPct,
    wholesalePct: d.wholesalePct,
    nextDrop: d.nextDrop,
    annualBudget: d.annualBudget,
    monthlySalesGoal: d.monthlySalesGoal ?? 0,
  };
}

/** Returns false when storage is full/unavailable (the session still works, nothing persists). */
export function saveManual(m: Partial<ManualSlices>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
}

// ── Shelf edits ───────────────────────────────────────────────────────────

export type ShelfEditState = 'applied' | 'matches-sync' | 'conflict' | 'orphaned';

export interface ShelfEditStatus {
  edit: ShelfEdit;
  state: ShelfEditState;
  /** Current sync value for the cell (null when the row is gone from the sync). */
  syncValue: number | null;
}

export function shelfKey(e: Pick<ShelfEdit, 'channel' | 'productId' | 'field'>): string {
  return `${e.channel}\u0000${e.productId}\u0000${e.field}`;
}

function syncValueOf(base: ParkData, e: Pick<ShelfEdit, 'channel' | 'productId' | 'field'>): number | null {
  const row = base.channels.find((c) => c.name === e.channel)?.stock.find((s) => s.productId === e.productId);
  return row ? row[e.field] : null;
}

/**
 * Record a hand correction. One active edit per cell: re-editing a cell
 * replaces its edit. Re-applying the same value is a no-op (returns the same
 * array), so replaying an edit changes nothing.
 */
export function recordShelfEdit(
  edits: ShelfEdit[],
  syncBase: ParkData,
  e: Omit<ShelfEdit, 'base' | 'editedAt'>,
  now: Date = new Date(),
): ShelfEdit[] {
  const key = shelfKey(e);
  const existing = edits.find((x) => shelfKey(x) === key);
  if (existing && existing.value === e.value) return edits;
  const base = syncValueOf(syncBase, e);
  const rest = edits.filter((x) => shelfKey(x) !== key);
  // Setting a cell back to exactly what the sync says retires the edit.
  if (base === e.value) return rest;
  return [...rest, { ...e, base, editedAt: now.toISOString() }];
}

/** Drop an edit — the sync's value wins. */
export function discardShelfEdit(edits: ShelfEdit[], key: string): ShelfEdit[] {
  return edits.filter((x) => shelfKey(x) !== key);
}

/** Keep the edit and accept that the sync moved: re-base it on the current sync value. */
export function rebaseShelfEdit(edits: ShelfEdit[], syncBase: ParkData, key: string): ShelfEdit[] {
  return edits.map((x) => (shelfKey(x) === key ? { ...x, base: syncValueOf(syncBase, x) } : x));
}

/**
 * Overlay shelf edits on sync data. An edit whose base no longer matches the
 * sync is still applied (the manual count is never silently lost) but is
 * reported as a conflict so the user can choose.
 */
export function applyShelfEdits(base: ParkData, edits: ShelfEdit[]): { data: ParkData; status: ShelfEditStatus[] } {
  const status: ShelfEditStatus[] = [];
  const byChannel = new Map<string, ShelfEdit[]>();
  for (const e of edits) {
    const syncValue = syncValueOf(base, e);
    if (syncValue === null) {
      status.push({ edit: e, state: 'orphaned', syncValue });
      continue;
    }
    const state: ShelfEditState =
      syncValue === e.value ? 'matches-sync' : syncValue === e.base ? 'applied' : 'conflict';
    status.push({ edit: e, state, syncValue });
    byChannel.set(e.channel, [...(byChannel.get(e.channel) ?? []), e]);
  }
  if (byChannel.size === 0) return { data: base, status };
  return {
    data: {
      ...base,
      channels: base.channels.map((c) => {
        const ce = byChannel.get(c.name);
        if (!ce) return c;
        return {
          ...c,
          stock: c.stock.map((s) => {
            const mine = ce.filter((e) => e.productId === s.productId);
            return mine.length ? mine.reduce((row, e) => ({ ...row, [e.field]: e.value }), s) : s;
          }),
        };
      }),
    },
    status,
  };
}

// ── Imported sync data ────────────────────────────────────────────────────
// A full ParkData snapshot produced externally (e.g. the Claude Code sync
// writing park-data.json) and pasted into the terminal's IMPORT modal.
// Stored whole; manual slices are re-applied on top. Each import also
// archives the previous snapshot so the terminal can brief you on what
// changed since the last sync.

const DATA_KEY = 'tfi-data-v1';
const PREV_KEY = 'tfi-data-prev-v1';

interface StoredSync {
  savedAt: string; // ISO timestamp of the import
  payload: ParkData;
}

export type LoadedSync =
  | { status: 'ok'; savedAt: string; payload: ParkData }
  | { status: 'invalid'; errors: string[] };

function readSync(key: string): LoadedSync | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', errors: ['stored snapshot is not valid JSON'] };
  }
  // current shape: wrapper with savedAt; legacy shape: bare ParkData
  const wrapped = parsed && typeof parsed === 'object' && 'payload' in parsed;
  const payload = wrapped ? (parsed as { payload: unknown }).payload : parsed;
  const savedAt = wrapped ? String((parsed as { savedAt?: unknown }).savedAt ?? '') : '';
  const v = validateParkData(payload);
  return v.ok ? { status: 'ok', savedAt, payload: v.data } : { status: 'invalid', errors: v.errors };
}

/** The stored snapshot, or why it can't be used. Invalid snapshots are left in storage for export. */
export function loadImported(): LoadedSync | null {
  return readSync(DATA_KEY);
}

export function loadPreviousSync(): ParkData | null {
  const prev = readSync(PREV_KEY);
  return prev?.status === 'ok' ? prev.payload : null;
}

/**
 * Store a validated snapshot. Returns the import timestamp, or null when
 * storage failed — in which case the previous snapshot is left untouched.
 */
export function persistImported(d: ParkData, now: Date = new Date()): string | null {
  try {
    const existingRaw = localStorage.getItem(DATA_KEY);
    const existing = readSync(DATA_KEY);
    const savedAt = now.toISOString();
    localStorage.setItem(DATA_KEY, JSON.stringify({ savedAt, payload: d } satisfies StoredSync));
    // Archive only a snapshot that was itself valid; an invalid one stays
    // recoverable via export until this point, then is replaced.
    if (existing?.status === 'ok' && existingRaw) {
      try {
        localStorage.setItem(PREV_KEY, existingRaw);
      } catch {
        // the delta briefing is a convenience; the new snapshot is saved
      }
    }
    return savedAt;
  } catch {
    return null;
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

/**
 * Everything this browser holds, exactly as stored (including a snapshot
 * that fails validation), so it can be saved before clearing or re-importing.
 */
export function exportBackup(now: Date = new Date()): string {
  const get = (k: string): unknown => {
    try {
      const raw = localStorage.getItem(k);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  };
  return JSON.stringify(
    { exportedAt: now.toISOString(), imported: get(DATA_KEY), previous: get(PREV_KEY), manual: get(KEY) },
    null,
    2,
  );
}
