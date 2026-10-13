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
