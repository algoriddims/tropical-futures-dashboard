import { createContext, useContext } from 'react';
import type { ParkData, Notice } from '@/game/types';
import type { Metrics, SyncDelta } from '@/game/engine';
import type { ShelfEditStatus, ShelfField } from '@/game/overrides';
import type { Look } from './look';
import type { DeskKey } from './desks';
import type { ChannelFilter } from '@/analytics/channels';

export interface LiveEvent {
  id: number;
  text: string;
  amount: number;
}

export interface TerminalState {
  data: ParkData | null;
  metrics: Metrics | null;
  notices: Notice[];
  desk: DeskKey;
  setDesk: (d: DeskKey) => void;
  /** Reporting period: the last N complete days (7, 14 or 30) vs the N days before. */
  range: number;
  setRange: (r: number) => void;
  /** Channel group the sales and profit panels show; stock is never filtered. */
  channelFilter: ChannelFilter;
  setChannelFilter: (c: ChannelFilter) => void;
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
  /**
   * Where imports go: 'server' = the shared snapshot on the hosting server
   * (every device sees it); 'local' = this browser only; 'checking' = not yet known.
   */
  shared: 'checking' | 'server' | 'local';
  /** Problem with the shared snapshot (unreadable or failed validation), if any. */
  sharedError: string[] | null;
  /** Re-fetch the shared snapshot from the server. */
  reloadShared: () => Promise<void>;
  /** Paste a full park-data.json; resolves to error lines, or null on success. Uploads when shared. */
  importData: (raw: string) => Promise<string[] | null>;
  /** Drop the imported snapshot and return to sample data. */
  clearImport: () => void;
  /** JSON of everything stored in this browser, for backup before clearing/re-importing. */
  exportStored: () => string;
  /** Remove everything this browser stored (cached snapshot + typed-in entries) and reload. */
  forgetDevice: () => void;
  /** Whether typed-in records are saved on the server ('local' = no server, browser only). */
  manualSync: ManualSyncState;
}

export interface ManualSyncState {
  state: 'local' | 'saving' | 'saved' | 'unsaved' | 'conflict';
  revision?: number;
  savedAt?: string;
  message?: string;
}

export const TerminalCtx = createContext<TerminalState | null>(null);

export function useTerminal(): TerminalState {
  const v = useContext(TerminalCtx);
  if (!v) throw new Error('useTerminal outside provider');
  return v;
}
