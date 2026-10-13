import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ParkData, Notice } from '@/game/types';
import type { Metrics } from '@/game/engine';
import { computeMetrics, buildNotices } from '@/game/engine';
import { FixtureSource } from '@/game/source';
import { applyManual, loadManual, persistManual, loadImported, loadPreviousSync, persistImported, clearImported, isParkData } from '@/game/overrides';
import { diffSnapshots } from '@/game/engine';
import type { SyncDelta } from '@/game/engine';

export type DeskKey = 's' | 'p' | 'i' | 'l' | 'o' | 'a' | 'n' | 'c' | 'g';

export const DESKS: { key: DeskKey; label: string; title: string }[] = [
  { key: 's', label: 'STATUS', title: 'PARK STATUS' },
  { key: 'p', label: 'BUILDS', title: 'RIDES UNDER CONSTRUCTION' },
  { key: 'g', label: 'GOALS', title: 'PARK PLANNER' },
  { key: 'i', label: 'RIDES', title: 'RIDES / INVENTORY' },
  { key: 'l', label: 'SHOPS', title: 'STORE LOCATIONS' },
  { key: 'c', label: 'COSTS', title: 'FINANCES / BURN' },
  { key: 'o', label: 'ORDERS', title: 'ORDERS / CASH' },
  { key: 'a', label: 'ADS', title: 'AD MACHINES' },
  { key: 'n', label: 'NEWS', title: 'NEWSFEED' },
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
  liveCash: number;
  liveEvents: LiveEvent[];
  sourceName: string;
  freshness: { label: string; minutesAgo: number }[];
  /** Mutate ParkData; manual slices (bank, costs, stockist stock) persist to localStorage. */
  updateData: (mut: (d: ParkData) => ParkData) => void;
  /** True when rendering an imported sync snapshot rather than fixture data. */
  imported: boolean;
  /** ISO timestamp of the current imported snapshot (null on fixture data). */
  importedAt: string | null;
  /** Delta vs the previous sync (null on first import / fixture data). */
  delta: SyncDelta | null;
  /** Paste a full park-data.json; returns an error message or null on success. */
  importData: (raw: string) => string | null;
  /** Drop the imported snapshot and return to the live source. */
  clearImport: () => void;
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
  const [data, setData] = useState<ParkData | null>(null);
  const [desk, setDesk] = useState<DeskKey>('s');
  const [range, setRange] = useState(7);
  const [helpOpen, setHelpOpen] = useState(false);
  const [liveCash, setLiveCash] = useState(0);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [imported, setImported] = useState(false);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [delta, setDelta] = useState<SyncDelta | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    source.load().then((base) => {
      const imp = loadImported();
      setImported(imp !== null);
      setImportedAt(imp?.savedAt ?? null);
      if (imp) {
        const prev = loadPreviousSync();
        setDelta(prev ? diffSnapshots(prev, imp.payload) : null);
      }
      setData(applyManual(imp?.payload ?? base, loadManual()));
    });
  }, []);

  const updateData = useCallback((mut: (d: ParkData) => ParkData) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = mut(prev);
      persistManual(next);
      return next;
    });
  }, []);

  const importData = useCallback((raw: string): string | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return 'INVALID JSON — PASTE THE FULL park-data.json CONTENTS';
    }
    if (!isParkData(parsed)) {
      return 'NOT A VALID PARK-DATA FILE — NEEDS products, pipeline, channels, campaigns, days, orders, grossMargin, targetRoas';
    }
    const prev = loadImported()?.payload ?? null;
    const savedAt = persistImported(parsed);
    setImported(true);
    setImportedAt(savedAt);
    setDelta(prev ? diffSnapshots(prev, parsed) : null);
    setLiveCash(0);
    setLiveEvents([]);
    setData(applyManual(parsed, loadManual()));
    return null;
  }, []);

  const clearImport = useCallback(() => {
    clearImported();
    setImported(false);
    setImportedAt(null);
    setDelta(null);
    setLiveCash(0);
    setLiveEvents([]);
    source.load().then((base) => setData(applyManual(base, loadManual())));
  }, []);

  // Simulated live order stream — makes the park feel alive on sample data.
  // Never runs on imported syncs: real snapshots must not accrue fake cash.
  useEffect(() => {
    if (!data || imported) return;
    let timer: number;
    const tick = () => {
      const item = LIVE_ITEMS[Math.floor(Math.random() * LIVE_ITEMS.length)];
      setLiveCash((c) => c + item.amount);
      setLiveEvents((ev) => [{ id: idRef.current++, ...item }, ...ev].slice(0, 6));
      timer = window.setTimeout(tick, 6000 + Math.random() * 9000);
    };
    timer = window.setTimeout(tick, 3500);
    return () => window.clearTimeout(timer);
  }, [data, imported]);

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
      const deskHit = DESKS.find((d) => d.key === k);
      if (deskHit) { setDesk(deskHit.key); return; }
      if (k === '1') setRange(1);
      if (k === '2') setRange(7);
      if (k === '3') setRange(30);
    },
    [],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const value: TerminalState = {
    data, metrics, notices, desk, setDesk, range, setRange,
    helpOpen, setHelpOpen, liveCash, liveEvents,
    sourceName: imported ? 'IMPORTED SYNC' : source.name, freshness: source.freshness,
    updateData, imported, importedAt, delta, importData, clearImport,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTerminal(): TerminalState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTerminal outside provider');
  return v;
}
