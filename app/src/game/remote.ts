// ── Shared snapshot on the server ────────────────────────────────────────
// When the app is served by server.mjs (e.g. on Railway), the latest
// snapshot lives on the server, behind the same password, so every device
// sees the same data without importing a file. Elsewhere (dev server, static
// preview) there's no such endpoint and the app keeps its per-browser import.
//
// The server marks its responses with X-TFI-Server: 1 — a dev server that
// answers any path with index.html must not be mistaken for it.

import type { ParkData } from './types';
import { validateParkData } from './validate';

const URL_PATH = '/api/snapshot';

export type RemoteSnapshot =
  | { status: 'unavailable' }                       // no snapshot server here
  | { status: 'empty' }                             // server, but nothing uploaded yet
  | { status: 'ok'; savedAt: string; payload: ParkData }
  | { status: 'invalid'; savedAt: string; errors: string[] }
  | { status: 'error'; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const isServer = (r: Response) => r.headers.get('X-TFI-Server') === '1';

export async function fetchRemoteSnapshot(fetchImpl: FetchLike = fetch): Promise<RemoteSnapshot> {
  let r: Response;
  try {
    r = await fetchImpl(URL_PATH, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    return { status: 'unavailable' };
  }
  if (!isServer(r)) return { status: 'unavailable' };
  if (r.status === 404) return { status: 'empty' };
  if (!r.ok) return { status: 'error', message: `server answered ${r.status}` };
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    return { status: 'error', message: 'server returned unreadable data' };
  }
  if (body && typeof body === 'object' && 'snapshot' in body && (body as { snapshot: unknown }).snapshot === null) {
    return { status: 'empty' };
  }
  const { savedAt, payload } = (body ?? {}) as { savedAt?: unknown; payload?: unknown };
  const at = typeof savedAt === 'string' ? savedAt : '';
  // Same full validation as a pasted import: a bad shared snapshot is never rendered.
  const v = validateParkData(payload);
  return v.ok ? { status: 'ok', savedAt: at, payload: v.data } : { status: 'invalid', savedAt: at, errors: v.errors };
}

export type UploadResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** Upload an already-validated snapshot as the shared one. */
export async function uploadSnapshot(payload: unknown, fetchImpl: FetchLike = fetch): Promise<UploadResult> {
  let r: Response;
  try {
    r = await fetchImpl(URL_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: 'could not reach the server — check your connection' };
  }
  let body: { savedAt?: string; error?: string } = {};
  try {
    body = await r.json();
  } catch {
    // fall through to the status message
  }
  if (r.ok && body.savedAt) return { ok: true, savedAt: body.savedAt };
  return { ok: false, error: body.error ?? `server answered ${r.status}` };
}

// ── Import feed ──────────────────────────────────────────────────────────
// One entry per upload the server still keeps (newest first): when it was
// uploaded, what it covers, and the sync's data notes. No business records.

export interface ImportFeedEntry {
  savedAt: string;
  current: boolean;
  coverageStart?: string;
  coverageEnd?: string;
  extractedAt?: string;
  sources: string[];
  notes: string[];
  counts?: { products: number; orders: number; days: number; accounts: number };
}

export type ImportFeed =
  | { status: 'unavailable' }
  | { status: 'ok'; entries: ImportFeedEntry[] }
  | { status: 'error'; message: string };

const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function toEntry(x: unknown): ImportFeedEntry | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.savedAt !== 'string') return null;
  const m = (o.meta && typeof o.meta === 'object' ? o.meta : {}) as Record<string, unknown>;
  const c = o.counts && typeof o.counts === 'object' ? (o.counts as Record<string, unknown>) : null;
  return {
    savedAt: o.savedAt,
    current: o.current === true,
    coverageStart: optStr(m.coverageStart),
    coverageEnd: optStr(m.coverageEnd),
    extractedAt: optStr(m.extractedAt),
    sources: Array.isArray(m.sources)
      ? m.sources.map((s) => optStr((s as { label?: unknown } | null)?.label)).filter((s): s is string => !!s)
      : [],
    notes: Array.isArray(m.notes) ? m.notes.filter((n): n is string => typeof n === 'string') : [],
    counts: c ? { products: num(c.products), orders: num(c.orders), days: num(c.days), accounts: num(c.accounts) } : undefined,
  };
}

export async function fetchImportFeed(fetchImpl: FetchLike = fetch): Promise<ImportFeed> {
  let r: Response;
  try {
    r = await fetchImpl(`${URL_PATH}/history`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    return { status: 'unavailable' };
  }
  if (!isServer(r)) return { status: 'unavailable' };
  if (!r.ok) return { status: 'error', message: `server answered ${r.status}` };
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    return { status: 'error', message: 'server returned unreadable data' };
  }
  const raw = (body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(raw)) return { status: 'error', message: 'server returned no feed' };
  const entries = raw.map(toEntry).filter((e): e is ImportFeedEntry => e !== null);
  return { status: 'ok', entries };
}
