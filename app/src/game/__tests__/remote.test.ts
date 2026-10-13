import { describe, expect, it } from 'vitest';
import { fetchRemoteSnapshot, uploadSnapshot } from '../remote';
import { fixtureData } from '../fixtures';

const res = (status: number, body: unknown, server = true) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: server ? { 'X-TFI-Server': '1', 'Content-Type': 'application/json' } : { 'Content-Type': 'text/html' },
  });

describe('fetchRemoteSnapshot', () => {
  it('a dev server answering with index.html is not mistaken for the snapshot store', async () => {
    expect(await fetchRemoteSnapshot(async () => res(200, '<!doctype html>', false))).toEqual({ status: 'unavailable' });
  });

  it('network failure means no shared store (fall back to local)', async () => {
    expect(await fetchRemoteSnapshot(async () => { throw new TypeError('offline'); })).toEqual({ status: 'unavailable' });
  });

  it('server with nothing uploaded yet (and the older 404 form)', async () => {
    expect(await fetchRemoteSnapshot(async () => res(200, { snapshot: null }))).toEqual({ status: 'empty' });
    expect(await fetchRemoteSnapshot(async () => res(404, { snapshot: null }))).toEqual({ status: 'empty' });
  });

  it('loads and fully validates the shared snapshot', async () => {
    const r = await fetchRemoteSnapshot(async () => res(200, { savedAt: '2026-10-13T20:00:00Z', payload: fixtureData }));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.payload.products.length).toBe(fixtureData.products.length);
  });

  it('a shared snapshot that fails validation is reported, never rendered', async () => {
    const bad = { ...fixtureData, products: [{ id: 'x' }] };
    const r = await fetchRemoteSnapshot(async () => res(200, { savedAt: 't', payload: bad }));
    expect(r.status).toBe('invalid');
  });

  it('auth or server errors are surfaced', async () => {
    expect(await fetchRemoteSnapshot(async () => res(500, { error: 'x' }))).toEqual({ status: 'error', message: 'server answered 500' });
  });
});

describe('uploadSnapshot', () => {
  it('PUTs JSON and returns the server timestamp', async () => {
    let seen: RequestInit | undefined;
    const r = await uploadSnapshot({ a: 1 }, async (_u, init) => { seen = init; return res(200, { savedAt: 'T' }); });
    expect(r).toEqual({ ok: true, savedAt: 'T' });
    expect(seen?.method).toBe('PUT');
    expect((seen?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('passes the server reason through on failure', async () => {
    expect(await uploadSnapshot({}, async () => res(500, { error: 'could not save the snapshot (EACCES)' })))
      .toEqual({ ok: false, error: 'could not save the snapshot (EACCES)' });
  });
});
