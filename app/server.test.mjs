// Regression checks for the hosted server (server.mjs). Zero dependencies:
//   node --test app/server.test.mjs
// Needs a built app in app/dist (npm run build).
//
// Vitest's default include also matches this file, so `npm test` runs it too:
// the runner is picked at load time (vitest sets VITEST). Under vitest the
// server suite is skipped when dist/ hasn't been built yet.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = process.env.VITEST ? await import('vitest') : await import('node:test');
const { test, describe } = runner;
const before = runner.before ?? runner.beforeAll;
const after = runner.after ?? runner.afterAll;

const APP = dirname(fileURLToPath(import.meta.url));
const PASSWORD = 'correct-horse-battery-staple';
const AUTH = `Basic ${Buffer.from(`anyone:${PASSWORD}`).toString('base64')}`;
const BAD_AUTH = `Basic ${Buffer.from('anyone:wrong-password-here').toString('base64')}`;

const HAVE_DIST = existsSync(join(APP, 'dist', 'index.html'));
if (!HAVE_DIST && !process.env.VITEST) {
  throw new Error('app/dist is missing — run `npm run build` in app/ first');
}
const describeServer = HAVE_DIST ? describe : describe.skip;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// Starts server.mjs; resolves once it logs that it's listening.
async function startServer(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: APP,
    env: { PATH: process.env.PATH, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = { out: '', err: '' };
  child.stdout.on('data', (d) => { logs.out += d; });
  child.stderr.on('data', (d) => { logs.err += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server did not start:\n${logs.out}\n${logs.err}`)), 10_000);
    const check = () => { if (logs.out.includes('Shared snapshot store') || logs.err.includes('not writable')) { clearTimeout(t); resolve(); } };
    child.stdout.on('data', check);
    child.stderr.on('data', check);
    child.once('exit', (code) => { clearTimeout(t); reject(new Error(`server exited (${code}):\n${logs.err}`)); });
  });
  return { child, port, logs };
}

// Runs server.mjs expecting it to refuse to start.
function runToExit(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['server.mjs'], { cwd: APP, env: { PATH: process.env.PATH, PORT: '0', ...env } });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => child.kill(), 5000);
    child.once('exit', (code) => { clearTimeout(t); resolve({ code, err }); });
  });
}

let srv;
let dir;

function request(method, path, { headers = {}, body, auth = true } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...(auth ? { Authorization: AUTH } : {}), ...headers };
    if (body !== undefined && h['Content-Length'] === undefined && h['Transfer-Encoding'] === undefined) h['Content-Length'] = Buffer.byteLength(body);
    const req = http.request({ host: '127.0.0.1', port: srv.port, method, path, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const snapshot = (tag, extra = {}) => ({
  products: [], pipeline: [], channels: [], orders: [{ id: tag }], campaigns: [], days: [],
  meta: { notes: [`upload ${tag}`] },
  ...extra,
});
const putJson = (value, headers = {}) =>
  request('PUT', '/api/snapshot', { headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });

const archives = async () => (await readdir(dir)).filter((f) => /^snapshot-\d+(-\d+)?\.json$/.test(f));

describe('startup', () => {
  test('refuses to start without a password', async () => {
    const { code, err } = await runToExit({});
    assert.equal(code, 1);
    assert.match(err, /set DASHBOARD_PASSWORD/);
  });
  test('refuses a short password', async () => {
    const { code, err } = await runToExit({ DASHBOARD_PASSWORD: 'short' });
    assert.equal(code, 1);
    assert.match(err, /at least 12 characters/);
  });
});

describeServer('server', () => {
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tfi-server-test-'));
    // An archive in the pre-fix naming scheme (snapshot-<13 digits>.json), as
    // already on the production volume, plus one that doesn't parse.
    await writeFile(join(dir, 'snapshot-1700000000000.json'), JSON.stringify({ savedAt: '2023-11-14T22:13:20.000Z', payload: snapshot('legacy') }));
    await writeFile(join(dir, 'snapshot-1600000000000.json'), '{"savedAt": SECRET-ORDER-DATA');
    srv = await startServer({ DASHBOARD_PASSWORD: PASSWORD, SNAPSHOT_DIR: dir });
  });
  after(async () => {
    if (srv?.child && srv.child.exitCode === null) {
      srv.child.kill();
      await new Promise((r) => srv.child.once('exit', r));
    }
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('/healthz answers without auth', async () => {
    const r = await request('GET', '/healthz', { auth: false });
    assert.equal(r.status, 200);
    assert.equal(r.text, 'ok');
  });

  test('401 without auth and with malformed Authorization', async () => {
    const xff = { 'X-Forwarded-For': '198.51.100.1' };
    for (const headers of [xff, { ...xff, Authorization: 'Bearer abc' }, { ...xff, Authorization: 'Basic !!!notbase64' }, { ...xff, Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` }]) {
      const page = await request('GET', '/', { auth: false, headers });
      assert.equal(page.status, 401);
      assert.match(page.headers['www-authenticate'], /^Basic /);
      const api = await request('GET', '/api/snapshot', { auth: false, headers });
      assert.equal(api.status, 401);
    }
  });

  test('correct auth serves the app', async () => {
    const r = await request('GET', '/');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.text, /<div id="root">/);
    assert.equal(r.headers['cache-control'], 'no-cache');
  });

  test('path traversal never escapes dist/', async () => {
    for (const p of ['/..%2f..%2f..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/..%5c..%5cetc/passwd', '/assets/..%2f..%2fserver.mjs', '/%2e%2e%2fserver.mjs']) {
      const r = await request('GET', p);
      assert.ok([302, 400, 404].includes(r.status), `${p} → ${r.status}`);
      assert.doesNotMatch(r.text, /root:|DASHBOARD_PASSWORD/);
    }
  });

  test('bad percent-encoding → 400', async () => {
    const r = await request('GET', '/%E0%A4%A');
    assert.equal(r.status, 400);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  });

  test('malformed request line → 400 without a stack trace', async () => {
    const before = srv.logs.err.length;
    const reply = await new Promise((resolve, reject) => {
      const sock = net.connect(srv.port, '127.0.0.1', () => sock.write('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let data = '';
      sock.on('data', (d) => { data += d; });
      sock.on('end', () => resolve(data));
      sock.on('error', reject);
    });
    assert.match(reply, /^HTTP\/1\.1 400 /);
    await new Promise((r) => setTimeout(r, 50));
    assert.doesNotMatch(srv.logs.err.slice(before), /TypeError|Invalid URL|\n\s+at /);
  });

  test('upload checks: origin, content type, size, JSON, shape', async () => {
    const body = JSON.stringify(snapshot('x'));
    const json = { 'Content-Type': 'application/json' };
    const host = `127.0.0.1:${srv.port}`;
    assert.equal((await request('PUT', '/api/snapshot', { headers: { ...json, Origin: 'https://evil.example' }, body })).status, 403);
    assert.equal((await request('PUT', '/api/snapshot', { headers: { ...json, Origin: 'null' }, body })).status, 403);
    assert.equal((await request('PUT', '/api/snapshot', { headers: { ...json, Origin: 'not a url' }, body })).status, 403);
    assert.equal((await request('PUT', '/api/snapshot', { headers: { 'Content-Type': 'text/plain' }, body })).status, 415);
    const big = '{"x":"' + 'a'.repeat(5 * 1024 * 1024 + 10) + '"}';
    const tooBig = await request('PUT', '/api/snapshot', { headers: json, body: big });
    assert.equal(tooBig.status, 413);
    const tooBigChunked = await request('PUT', '/api/snapshot', { headers: { ...json, 'Transfer-Encoding': 'chunked' }, body: big });
    assert.equal(tooBigChunked.status, 413);
    const invalid = await request('PUT', '/api/snapshot', { headers: json, body: '{"products": [' });
    assert.equal(invalid.status, 400);
    const missing = await request('PUT', '/api/snapshot', { headers: json, body: JSON.stringify({ products: [] }) });
    assert.equal(missing.status, 422);
    assert.match(missing.json.error, /missing array "pipeline"/);
    // nothing stored by any of the refused uploads
    assert.deepEqual((await request('GET', '/api/snapshot')).json, { snapshot: null });
    // a same-origin browser upload is accepted
    const ok = await request('PUT', '/api/snapshot', { headers: { ...json, Origin: `http://${host}` }, body });
    assert.equal(ok.status, 200);
  });

  test('PUT then GET roundtrip, and history mixes old and new archive names', async () => {
    const value = snapshot('roundtrip');
    const put = await putJson(value);
    assert.equal(put.status, 200);
    const got = await request('GET', '/api/snapshot');
    assert.equal(got.status, 200);
    assert.equal(got.headers['cache-control'], 'no-store');
    assert.deepEqual(got.json, { savedAt: put.json.savedAt, payload: value });

    const errBefore = srv.logs.err.length;
    const h = await request('GET', '/api/snapshot/history');
    assert.equal(h.status, 200);
    const { entries } = h.json;
    // current (roundtrip), archive of the upload-checks snapshot, legacy archive
    assert.equal(entries.length, 3);
    assert.equal(entries[0].current, true);
    assert.equal(entries[0].savedAt, put.json.savedAt);
    assert.deepEqual(entries[0].meta.notes, ['upload roundtrip']);
    assert.deepEqual(entries[1].meta.notes, ['upload x']);
    assert.equal(entries[2].savedAt, '2023-11-14T22:13:20.000Z');
    assert.equal(entries[2].current, false);
    assert.ok(!('orders' in entries[0]) && !JSON.stringify(entries).includes('"id"'), 'no records in the feed');
    // the unparsable archive is skipped and logged by name only
    await new Promise((r) => setTimeout(r, 50));
    const log = srv.logs.err.slice(errBefore);
    assert.match(log, /skipped snapshot-1600000000000\.json/);
    assert.doesNotMatch(log, /SECRET-ORDER-DATA/);
    // a second read comes from the cache and is identical
    assert.deepEqual((await request('GET', '/api/snapshot/history')).json, h.json);
  });

  test('25 sequential PUTs keep exactly 20 archives; history newest first', async () => {
    const saved = [];
    for (let i = 0; i < 25; i++) {
      const r = await putJson(snapshot(`seq-${i}`));
      assert.equal(r.status, 200);
      saved.push(r.json.savedAt);
    }
    const files = await archives();
    assert.equal(files.length, 20);
    // the legacy and the unparsable archives were the oldest, so they're pruned
    assert.ok(!files.includes('snapshot-1700000000000.json'));
    assert.ok(!files.includes('snapshot-1600000000000.json'));
    const { entries } = (await request('GET', '/api/snapshot/history')).json;
    assert.equal(entries.length, 21);
    assert.equal(entries[0].current, true);
    assert.equal(entries.filter((e) => e.current).length, 1);
    assert.deepEqual(entries.map((e) => e.meta.notes[0]), Array.from({ length: 21 }, (_, k) => `upload seq-${24 - k}`));
    const times = entries.map((e) => e.savedAt);
    assert.deepEqual(times, [...times].sort().reverse());
    assert.equal(times[0], saved[24]);
  });

  test('12 concurrent PUTs all succeed; readers never see an empty store', async () => {
    let stop = false;
    const readerResults = [];
    const readers = Array.from({ length: 4 }, async () => {
      while (!stop) {
        const r = await request('GET', '/api/snapshot');
        readerResults.push(r);
      }
    });
    const values = Array.from({ length: 12 }, (_, i) => snapshot(`concurrent-${i}`));
    const puts = await Promise.all(values.map((v) => putJson(v)));
    stop = true;
    await Promise.all(readers);

    for (const p of puts) assert.equal(p.status, 200, p.text);
    assert.ok(readerResults.length > 0);
    for (const r of readerResults) {
      assert.equal(r.status, 200);
      assert.ok(r.json && r.json.payload, `reader saw ${r.text.slice(0, 80)}`);
    }
    const final = (await request('GET', '/api/snapshot')).json;
    const match = values.findIndex((v) => JSON.stringify(v) === JSON.stringify(final.payload));
    assert.ok(match >= 0, 'final snapshot is one of the uploads');
    // writes are serialized, so the last savedAt is the one that stuck
    const latest = puts.map((p) => p.json.savedAt).sort().at(-1);
    assert.equal(final.savedAt, latest);

    assert.equal((await archives()).length, 20);
    const { entries } = (await request('GET', '/api/snapshot/history')).json;
    assert.equal(entries.length, 21);
    assert.equal(entries[0].savedAt, final.savedAt);
    const times = entries.map((e) => e.savedAt);
    assert.deepEqual(times, [...times].sort().reverse());
    assert.equal(new Set(times).size, 21, 'no version lost or duplicated');
    // the 12 concurrent uploads are all present (current + 11 newest archives)
    const notes = new Set(entries.slice(0, 12).map((e) => e.meta.notes[0]));
    assert.equal(notes.size, 12);
    for (let i = 0; i < 12; i++) assert.ok(notes.has(`upload concurrent-${i}`));
    // no stray temp files
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
  });

  test('manual records: durable, versioned, and a stale device gets 409 instead of overwriting', async () => {
    const putManual = (body, headers = {}) =>
      request('PUT', '/api/manual', { headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.deepEqual((await request('GET', '/api/manual')).json, { manual: null });
    assert.equal((await request('GET', '/api/manual', { auth: false })).status, 401);

    const first = await putManual({ baseRevision: null, payload: { costs: [{ id: 'c1', amount: 10 }] } });
    assert.equal(first.status, 200);
    assert.equal(first.json.revision, 1);
    const second = await putManual({ baseRevision: 1, payload: { costs: [], monthlySalesGoal: 2000 } });
    assert.equal(second.json.revision, 2);

    // a device still on revision 1 must not overwrite revision 2
    const stale = await putManual({ baseRevision: 1, payload: { costs: [{ id: 'old' }] } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.current.revision, 2);
    assert.deepEqual(stale.json.current.payload, { costs: [], monthlySalesGoal: 2000 });

    const got = await request('GET', '/api/manual');
    assert.equal(got.json.revision, 2);
    assert.equal(got.headers['cache-control'], 'no-store');
    assert.ok((await readdir(dir)).some((f) => /^manual-\d+-000001\.json$/.test(f)), 'previous revision kept');

    assert.equal((await putManual({ baseRevision: 2, payload: [] })).status, 422);
    assert.equal((await putManual({ payload: {} })).status, 422);
    assert.equal((await putManual({ baseRevision: 2, payload: {} }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('PUT', '/api/manual', { headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  });

  test('security headers and asset caching', async () => {
    const index = await request('GET', '/');
    const asset = /\.\/(assets\/[^"]+\.js)"/.exec(index.text)?.[1];
    assert.ok(asset, 'index.html references a built JS asset');
    const responses = {
      page: index,
      asset: await request('GET', `/${asset}`),
      api: await request('GET', '/api/snapshot'),
      unauth: await request('GET', '/', { auth: false }),
      unauthApi: await request('GET', '/api/snapshot', { auth: false }),
      methodNotAllowed: await request('POST', '/'),
      apiMethodNotAllowed: await request('DELETE', '/api/snapshot'),
      redirect: await request('GET', '/nowhere'),
    };
    assert.equal(responses.methodNotAllowed.status, 405);
    assert.equal(responses.apiMethodNotAllowed.status, 405);
    for (const [name, r] of Object.entries(responses)) {
      assert.match(r.headers['content-security-policy'] ?? '', /default-src 'self'/, `${name} CSP`);
      assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/, `${name} CSP`);
      assert.equal(r.headers['strict-transport-security'], 'max-age=31536000', `${name} HSTS`);
      assert.equal(r.headers['x-content-type-options'], 'nosniff', `${name} nosniff`);
      assert.equal(r.headers['x-tfi-server'], '1', `${name} marker`);
    }
    assert.equal(responses.asset.status, 200);
    assert.equal(responses.asset.headers['cache-control'], 'private, max-age=31536000, immutable');
  });

  test('throttles an IP after 10 failed sign-ins; logs without credentials', async () => {
    // the proxy appends the real client IP last; anything before it is client-supplied
    const ip = { 'X-Forwarded-For': '10.0.0.1, 203.0.113.7' };
    for (let i = 0; i < 10; i++) {
      const r = await request('GET', i % 2 ? '/' : '/api/snapshot', { auth: false, headers: { ...ip, Authorization: BAD_AUTH } });
      assert.equal(r.status, 401, `attempt ${i + 1}`);
    }
    // blocked now, even with the right password
    const blocked = await request('GET', '/', { headers: ip });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal(blocked.headers['x-content-type-options'], 'nosniff');
    const blockedApi = await request('GET', '/api/snapshot', { headers: ip });
    assert.equal(blockedApi.status, 429);
    // a forged leading entry doesn't dodge the block
    const forged = await request('GET', '/', { headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.7' } });
    assert.equal(forged.status, 429);
    // health checks and other IPs are unaffected
    assert.equal((await request('GET', '/healthz', { auth: false, headers: ip })).status, 200);
    assert.equal((await request('GET', '/', { headers: { 'X-Forwarded-For': '203.0.113.8' } })).status, 200);
    // missing credentials (the browser's first request) don't count
    for (let i = 0; i < 12; i++) {
      assert.equal((await request('GET', '/', { auth: false, headers: { 'X-Forwarded-For': '203.0.113.9' } })).status, 401);
    }
    assert.equal((await request('GET', '/', { headers: { 'X-Forwarded-For': '203.0.113.9' } })).status, 200);

    await new Promise((r) => setTimeout(r, 50));
    const log = srv.logs.out + srv.logs.err;
    const lines = log.split('\n').filter((l) => l.includes('auth failed') && l.includes('203.0.113.7'));
    assert.equal(lines.length, 10);
    assert.match(lines[0], /^auth failed: \d{4}-\d\d-\d\dT[\d:.]+Z ip=203\.0\.113\.7 path=\/api\/snapshot$/);
    assert.ok(!log.includes('wrong-password-here') && !log.includes(BAD_AUTH.slice(6)) && !log.includes(PASSWORD));
  });
});
