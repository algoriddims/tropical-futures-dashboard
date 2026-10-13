import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ParkData, Notice } from '@/game/types';
import type { Metrics } from '@/game/engine';
import { computeMetrics, buildNotices } from '@/game/engine';
import { FixtureSource } from '@/game/source';
import {
  applyManual, applyShelfEdits, clearImported, discardShelfEdit, exportBackup, extractManual, loadImported,
  loadManual, loadPreviousSync, persistImported, rebaseShelfEdit, recordShelfEdit, saveManual,
} from '@/game/overrides';
import type { ManualSlices, ShelfEditStatus, ShelfField } from '@/game/overrides';
import { validateParkData } from '@/game/validate';
import { diffSnapshots } from '@/game/engine';
import type { SyncDelta } from '@/game/engine';
import { loadLook, nextLook, saveLook } from './look';
import type { Look } from './look';

export type DeskKey = 's' | 'p' | 'i' | 'l' | 'o' | 'a' | 'n' | 'c' | 'g';

export const DESKS: { key: DeskKey; label: string; title: string }[] = [
  { key: 's', label: 'STATUS', title: 'OVERVIEW' },
  { key: 'p', label: 'PIPELINE', title: 'PRODUCTION PIPELINE' },
  { key: 'g', label: 'GOALS', title: 'PLANNING' },
  { key: 'i', label: 'INVENTORY', title: 'INVENTORY' },
  { key: 'l', label: 'SHOPS', title: 'STORE LOCATIONS' },
  { key: 'c', label: 'COSTS', title: 'FINANCES / BURN' },
  { key: 'o', label: 'ORDERS', title: 'ORDERS / CASH' },
  { key: 'a', label: 'ADS', title: 'AD CAMPAIGNS' },
  { key: 'n', label: 'ALERTS', title: 'ALERTS' },
];

export interface LiveEvent {
  id: number;
  text: string;
  amount: number;
}

interface TerminalState {
  data: ParkData | null;
  metrics: Metrics | null;
  notices: Notice[];
  desk: DeskKey;
  setDesk: (d: DeskKey) => void;
  range: number;
  setRange: (r: number) => void;
  helpOpen: boolean;
  setHelpOpen: (b: boolean) => void;
  /** Visual look — presentational only. */
  look: Look;
  toggleLook: () => void;
  /** Simulated order stream — sample mode only, never added to bank cash. */
  liveEvents: LiveEvent[];
  sourceName: string;
  /** Mutate the manual slices of ParkData (bank, costs, planning inputs); persisted to localStorage. */
  updateData: (mut: (d: ParkData) => ParkData) => void;
  /** Record a hand correction to a stockist shelf count; persisted, and checked against later imports. */
  editShelf: (channel: string, productId: string, field: ShelfField, value: number) => void;
  /** Resolve a shelf edit: 'sync' drops it, 'mine' keeps it re-based on the current sync value. */
  resolveShelfEdit: (key: string, keep: 'sync' | 'mine') => void;
  shelfStatus: ShelfEditStatus[];
  /** False when the last write to localStorage failed — edits then last only this session. */
  storageOk: boolean;
  /** True when rendering an imported sync snapshot rather than fixture data. */
  imported: boolean;
  /** ISO timestamp of the current imported snapshot (null on fixture data). */
  importedAt: string | null;
  /** Validation errors when the stored snapshot could not be loaded (sample data shown instead). */
  storedSnapshotErrors: string[] | null;
  /** Delta vs the previous sync (null on first import / fixture data). */
  delta: SyncDelta | null;
  /** Paste a full park-data.json; returns error lines, or null on success. */
  importData: (raw: string) => string[] | null;
  /** Drop the imported snapshot and return to sample data. */
  clearImport: () => void;
  /** JSON of everything stored in this browser, for backup before clearing/re-importing. */
  exportStored: () => string;
}

const Ctx = createContext<TerminalState | null>(null);

const source = new FixtureSource(); // ← swap for ShopifyAdminSource / MetaMarketingSource

const LIVE_ITEMS = [
  { text: 'KEEP GOING 333 JERSEY / M', amount: 88 },
  { text: 'I <3 DOLPHINS BABY TEE / L', amount: 45 },
  { text: 'ARCHIPELAGO CAP · NAVY', amount: 46 },
  { text: 'INHALER ZIPPER JERSEY', amount: 118 },
  { text: 'S*XBOMB BABY TEE / M', amount: 45 },
  { text: 'WATER DROPLET SARONG', amount: 56 },
];

export function TerminalProvider({ children }: { children: ReactNode }) {
  // base = what the source/import says; manual = what the user entered.
  // The data every desk sees is always derived: base + manual + shelf edits.
  const [base, setBase] = useState<ParkData | null>(null);
  const [manual, setManual] = useState<Partial<ManualSlices>>(() => loadManual());
  const [storageOk, setStorageOk] = useState(true);
  const [desk, setDesk] = useState<DeskKey>('s');
  const [range, setRange] = useState(7);
  const [helpOpen, setHelpOpen] = useState(false);
  const [look, setLook] = useState<Look>(() => loadLook());
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [imported, setImported] = useState(false);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [storedSnapshotErrors, setStoredSnapshotErrors] = useState<string[] | null>(null);
  const [delta, setDelta] = useState<SyncDelta | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    source.load().then((sample) => {
      const imp = loadImported();
      if (imp?.status === 'ok') {
        setImported(true);
        setImportedAt(imp.savedAt || null);
        const prev = loadPreviousSync();
        setDelta(prev ? diffSnapshots(prev, imp.payload) : null);
        setBase(imp.payload);
      } else {
        // An invalid stored snapshot stays in storage (exportable) but is never rendered.
        setStoredSnapshotErrors(imp?.status === 'invalid' ? imp.errors : null);
        setBase(sample);
      }
    });
  }, []);

  const { data, shelfStatus } = useMemo(() => {
    if (!base) return { data: null, shelfStatus: [] as ShelfEditStatus[] };
    const withManual = applyManual(base, manual);
    const r = applyShelfEdits(withManual, manual.shelfEdits ?? []);
    return { data: r.data, shelfStatus: r.status };
  }, [base, manual]);

  const commitManual = useCallback((next: Partial<ManualSlices>) => {
    setManual(next);
    setStorageOk(saveManual(next));
  }, []);

  const updateData = useCallback((mut: (d: ParkData) => ParkData) => {
    if (!data) return;
    commitManual({ ...manual, ...extractManual(mut(data)) });
  }, [data, manual, commitManual]);

  const editShelf = useCallback((channel: string, productId: string, field: ShelfField, value: number) => {
    if (!base) return;
    commitManual({ ...manual, shelfEdits: recordShelfEdit(manual.shelfEdits ?? [], base, { channel, productId, field, value }) });
  }, [base, manual, commitManual]);

  const resolveShelfEdit = useCallback((key: string, keep: 'sync' | 'mine') => {
    if (!base) return;
    const edits = manual.shelfEdits ?? [];
    commitManual({ ...manual, shelfEdits: keep === 'sync' ? discardShelfEdit(edits, key) : rebaseShelfEdit(edits, base, key) });
  }, [base, manual, commitManual]);

  const importData = useCallback((raw: string): string[] | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return ['INVALID JSON — PASTE THE FULL park-data.json CONTENTS'];
    }
    const v = validateParkData(parsed);
    if (!v.ok) return ['NOT IMPORTED — THE CURRENT DATA IS UNCHANGED', ...v.errors];
    const prev = loadImported();
    const savedAt = persistImported(v.data);
    if (savedAt === null) {
      return ['NOT IMPORTED — BROWSER STORAGE IS FULL OR BLOCKED. EXPORT A BACKUP, THEN CLEAR SPACE.'];
    }
    setImported(true);
    setImportedAt(savedAt);
    setStoredSnapshotErrors(null);
    setDelta(prev?.status === 'ok' ? diffSnapshots(prev.payload, v.data) : null);
    setLiveEvents([]);
    setBase(v.data);
    return null;
  }, []);

  const clearImport = useCallback(() => {
    clearImported();
    setImported(false);
    setImportedAt(null);
    setStoredSnapshotErrors(null);
    setDelta(null);
    setLiveEvents([]);
    source.load().then(setBase);
  }, []);

  const exportStored = useCallback(() => exportBackup(), []);

  const toggleLook = useCallback(() => {
    setLook((l) => {
      const next = nextLook(l);
      saveLook(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.look = look;
  }, [look]);

  // Simulated order stream — makes sample data feel alive.
  // Never runs on imported syncs, and never touches cash.
  const hasData = data !== null;
  useEffect(() => {
    if (!hasData || imported) return;
    let timer: number;
    const tick = () => {
      const item = LIVE_ITEMS[Math.floor(Math.random() * LIVE_ITEMS.length)];
      setLiveEvents((ev) => [{ id: idRef.current++, ...item }, ...ev].slice(0, 6));
      timer = window.setTimeout(tick, 6000 + Math.random() * 9000);
    };
    timer = window.setTimeout(tick, 3500);
    return () => window.clearTimeout(timer);
  }, [hasData, imported]);

  const metrics = useMemo(() => (data ? computeMetrics(data, range) : null), [data, range]);
  const notices = useMemo(() => (data && metrics ? buildNotices(data, metrics) : []), [data, metrics]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === '?') { setHelpOpen((h) => !h); return; }
      if (k === 'escape') { setHelpOpen(false); return; }
      if (k === 't') { toggleLook(); return; }
      const deskHit = DESKS.find((d) => d.key === k);
      if (deskHit) { setDesk(deskHit.key); return; }
      if (k === '1') setRange(1);
      if (k === '2') setRange(7);
      if (k === '3') setRange(30);
    },
    [toggleLook],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const value: TerminalState = {
    data, metrics, notices, desk, setDesk, range, setRange,
    helpOpen, setHelpOpen, look, toggleLook, liveEvents,
    sourceName: imported ? 'IMPORTED SYNC' : source.name,
    updateData, editShelf, resolveShelfEdit, shelfStatus, storageOk,
    imported, importedAt, storedSnapshotErrors, delta, importData, clearImport, exportStored,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTerminal(): TerminalState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTerminal outside provider');
  return v;
}
