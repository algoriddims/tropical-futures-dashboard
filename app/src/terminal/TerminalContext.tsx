import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ParkData } from '@/game/types';
import { computeMetrics, buildNotices } from '@/game/engine';
import { FixtureSource } from '@/game/source';
import {
  applyManual, applyShelfEdits, clearImported, discardShelfEdit, exportBackup, extractManual, loadImported,
  loadManual, loadManualSync, loadPreviousSync, persistImported, rebaseShelfEdit, recordShelfEdit, reconcileManual, saveManual,
  saveManualSync, stashManual,
} from '@/game/overrides';
import type { ManualSlices, ShelfEditStatus, ShelfField } from '@/game/overrides';
import { validateParkData } from '@/game/validate';
import { fetchManual, fetchRemoteSnapshot, pushManual, uploadSnapshot } from '@/game/remote';
import { diffSnapshots } from '@/game/engine';
import type { SyncDelta } from '@/game/engine';
import { loadLook, nextLook, saveLook } from './look';
import type { Look } from './look';
import { DESKS } from './desks';
import type { ChannelFilter } from '@/analytics/channels';
import type { DeskKey } from './desks';
import { TerminalCtx } from './useTerminal';
import type { LiveEvent, ManualSyncState, TerminalState } from './useTerminal';

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
  // Typed-in records are saved to the server when there is one; this browser only caches them.
  const [manualSync, setManualSync] = useState<ManualSyncState>({ state: 'local' });
  const syncMeta = useRef(loadManualSync());
  const pushTimer = useRef<number | undefined>(undefined);
  const setMeta = (m: { revision: number | null; dirty: boolean }) => { syncMeta.current = m; saveManualSync(m); };
  const [desk, setDesk] = useState<DeskKey>('s');
  // Complete calendar days in the business timezone (7 / 14 / 30), compared with the period just before.
  const [range, setRange] = useState(30);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('ALL');
  const [helpOpen, setHelpOpen] = useState(false);
  const [look, setLook] = useState<Look>(() => loadLook());
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [imported, setImported] = useState(false);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [storedSnapshotErrors, setStoredSnapshotErrors] = useState<string[] | null>(null);
  const [delta, setDelta] = useState<SyncDelta | null>(null);
  const [shared, setShared] = useState<'checking' | 'server' | 'local'>('checking');
  const [sharedError, setSharedError] = useState<string[] | null>(null);
  const idRef = useRef(0);

  // Show a snapshot and cache it in this browser (so it still opens offline).
  const showSnapshot = useCallback((payload: ParkData, savedAt: string) => {
    const prev = loadImported();
    persistImported(payload, savedAt ? new Date(savedAt) : new Date());
    setImported(true);
    setImportedAt(savedAt || null);
    setStoredSnapshotErrors(null);
    setDelta(prev?.status === 'ok' && prev.savedAt !== savedAt ? diffSnapshots(prev.payload, payload) : null);
    setLiveEvents([]);
    setBase(payload);
  }, []);

  const adoptServerManual = useCallback((payload: Partial<ManualSlices>, revision: number) => {
    setManual(payload);
    setStorageOk(saveManual(payload));
    setMeta({ revision, dirty: false });
  }, []);

  const pushManualNow = useCallback(async (payload: Partial<ManualSlices>) => {
    setManualSync({ state: 'saving' });
    const r = await pushManual(payload, syncMeta.current.revision);
    if (r.status === 'saved') {
      setMeta({ revision: r.revision, dirty: false });
      setManualSync({ state: 'saved', revision: r.revision, savedAt: r.savedAt });
    } else if (r.status === 'conflict') {
      stashManual(payload);
      if (r.current) adoptServerManual(r.current.payload as Partial<ManualSlices>, r.current.revision);
      setManualSync({ state: 'conflict', message: 'ANOTHER DEVICE SAVED FIRST — ITS ENTRIES ARE SHOWN; THIS BROWSER\'S COPY WAS KEPT IN EXPORT BACKUP' });
    } else {
      setManualSync({ state: 'unsaved', message: `NOT SAVED TO THE SERVER (${r.message.toUpperCase()}) — KEPT IN THIS BROWSER, RETRIED ON THE NEXT CHANGE OR RELOAD` });
    }
  }, [adoptServerManual]);

  const syncManualFromServer = useCallback(async () => {
    const r = await fetchManual();
    if (r.status !== 'ok') {
      if (r.status === 'error') setManualSync({ state: 'unsaved', message: `COULD NOT READ SAVED ENTRIES FROM THE SERVER (${r.message.toUpperCase()})` });
      return;
    }
    const local = loadManual();
    const decision = reconcileManual(local, syncMeta.current, r.record);
    if (decision === 'push-local') await pushManualNow(local);
    else if (decision === 'adopt-server' && r.record) {
      adoptServerManual(r.record.payload as Partial<ManualSlices>, r.record.revision);
      setManualSync({ state: 'saved', revision: r.record.revision, savedAt: r.record.savedAt });
    } else if (decision === 'conflict' && r.record) {
      stashManual(local);
      adoptServerManual(r.record.payload as Partial<ManualSlices>, r.record.revision);
      setManualSync({ state: 'conflict', message: 'ENTRIES ON THE SERVER ARE NEWER — THEY ARE SHOWN; THIS BROWSER\'S UNSAVED COPY WAS KEPT IN EXPORT BACKUP' });
    } else if (r.record) {
      setManualSync({ state: 'saved', revision: r.record.revision, savedAt: r.record.savedAt });
    } else {
      setManualSync({ state: 'saved' });
    }
  }, [adoptServerManual, pushManualNow]);

  const reloadShared = useCallback(async () => {
    const r = await fetchRemoteSnapshot();
    if (r.status === 'unavailable') { setShared('local'); return; }
    setShared('server');
    void syncManualFromServer();
    if (r.status === 'ok') {
      setSharedError(null);
      // Unchanged since last time: keep the current view (and its delta).
      const cached = loadImported();
      if (r.savedAt && cached?.status === 'ok' && cached.savedAt === r.savedAt) return;
      showSnapshot(r.payload, r.savedAt);
    } else if (r.status === 'invalid') {
      setSharedError(['THE SHARED SNAPSHOT FAILED VALIDATION — SHOWING THIS BROWSER\'S LAST GOOD DATA', ...r.errors]);
    } else if (r.status === 'error') {
      setSharedError([`COULD NOT LOAD THE SHARED SNAPSHOT: ${r.message.toUpperCase()}`]);
    } else {
      setSharedError(null); // empty: nothing uploaded yet
    }
  }, [showSnapshot, syncManualFromServer]);

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
      // then check for a shared snapshot on the server
      void reloadShared();
    });
  }, [reloadShared]);

  const { data, shelfStatus } = useMemo(() => {
    if (!base) return { data: null, shelfStatus: [] as ShelfEditStatus[] };
    const withManual = applyManual(base, manual);
    const r = applyShelfEdits(withManual, manual.shelfEdits ?? []);
    return { data: r.data, shelfStatus: r.status };
  }, [base, manual]);

  const commitManual = useCallback((next: Partial<ManualSlices>) => {
    setManual(next);
    setStorageOk(saveManual(next));
    setMeta({ revision: syncMeta.current.revision, dirty: true });
    if (shared !== 'server') return;
    setManualSync({ state: 'saving' });
    // Debounced so typing a number doesn't send one save per keystroke.
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => { void pushManualNow(next); }, 600);
  }, [shared, pushManualNow]);

  const updateData = useCallback((mut: (d: ParkData) => ParkData) => {
    if (!data) return;
    // extractManual leaves out a synced bank balance, so it can't be saved as a hand entry
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

  const importData = useCallback(async (raw: string): Promise<string[] | null> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const t = raw.trim();
      return [
        'INVALID JSON — USE CHOOSE FILE, OR PASTE THE FULL park-data.json CONTENTS',
        !t.startsWith('{')
          ? `WHAT WAS PASTED STARTS WITH "${t.slice(0, 24)}" — THE FILE ITSELF STARTS WITH "{"`
          : !t.endsWith('}')
            ? `THE PASTE LOOKS CUT OFF: ${t.length.toLocaleString('en-US')} CHARACTERS, AND IT DOESN'T END WITH "}"`
            : `${t.length.toLocaleString('en-US')} CHARACTERS PASTED, BUT THEY AREN'T VALID JSON`,
      ];
    }
    const v = validateParkData(parsed);
    if (!v.ok) return ['NOT IMPORTED — THE CURRENT DATA IS UNCHANGED', ...v.errors];
    if (shared === 'server') {
      // Upload the file as sent (unknown extra fields included); the server copy is what every device loads.
      const up = await uploadSnapshot(parsed);
      if (!up.ok) return [`NOT UPLOADED — THE SHARED DATA IS UNCHANGED: ${up.error.toUpperCase()}`];
      setSharedError(null);
      showSnapshot(v.data, up.savedAt);
      return null;
    }
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
  }, [shared, showSnapshot]);

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

  const forgetDevice = useCallback(() => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('tfi-')) localStorage.removeItem(k);
    } catch {
      // storage blocked: nothing was stored either
    }
    window.location.reload();
  }, []);

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
    // Only in local sample mode — never on the hosted site, not even for the
    // moment before the shared snapshot arrives.
    if (!hasData || imported || shared !== 'local') return;
    let timer: number;
    const tick = () => {
      const item = LIVE_ITEMS[Math.floor(Math.random() * LIVE_ITEMS.length)];
      setLiveEvents((ev) => [{ id: idRef.current++, ...item }, ...ev].slice(0, 6));
      timer = window.setTimeout(tick, 6000 + Math.random() * 9000);
    };
    timer = window.setTimeout(tick, 3500);
    return () => window.clearTimeout(timer);
  }, [hasData, imported, shared]);

  const metrics = useMemo(() => (data ? computeMetrics(data, range) : null), [data, range]);
  const notices = useMemo(() => (data && metrics ? buildNotices(data, metrics) : []), [data, metrics]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // A modal dialog owns the keyboard (it handles its own Esc).
      if (document.querySelector('[aria-modal="true"]')) return;
      if (k === '?') { setHelpOpen((h) => !h); return; }
      if (k === 't') { toggleLook(); return; }
      const deskHit = DESKS.find((d) => d.key === k);
      if (deskHit) { setDesk(deskHit.key); return; }
      if (k === '1') setRange(7);
      if (k === '2') setRange(14);
      if (k === '3') setRange(30);
    },
    [toggleLook],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const value: TerminalState = {
    data, metrics, notices, desk, setDesk, range, setRange, channelFilter, setChannelFilter,
    helpOpen, setHelpOpen, look, toggleLook, liveEvents,
    sourceName: imported ? 'IMPORTED SYNC' : source.name,
    updateData, editShelf, resolveShelfEdit, shelfStatus, storageOk,
    imported, importedAt, storedSnapshotErrors, delta, shared, sharedError, reloadShared, importData, clearImport, exportStored, forgetDevice, manualSync,
  };
  return <TerminalCtx.Provider value={value}>{children}</TerminalCtx.Provider>;
}
