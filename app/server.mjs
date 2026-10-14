// Production server for hosted deploys (e.g. Railway). Zero dependencies.
//
// Serves the built app (dist/) behind HTTP Basic auth. This is a private
// business tool, so it FAILS CLOSED: without DASHBOARD_PASSWORD it refuses to
// start, unless ALLOW_PUBLIC=true is set deliberately.
//
//   DASHBOARD_PASSWORD  required — the shared password (any username works)
//   DASHBOARD_USER      optional — require this username too
//   PORT                set by the host; defaults to 3000
//   ALLOW_PUBLIC=true   serve without a password (not recommended)
//   SNAPSHOT_DIR        where the shared snapshot is kept — point it at a
//                       persistent volume (Railway: mount a volume, e.g. /data)
//
// GET /healthz answers without auth, for the host's health check. It reveals
// nothing but "ok".
//
// Shared snapshot (behind the same password):
//   GET /api/snapshot   → { savedAt, payload }, or { snapshot: null } before the first upload
//   PUT /api/snapshot   ← a park-data.json body; becomes the shared snapshot
//   GET /api/snapshot/history → { entries: [{ savedAt, current, meta, counts }] },
//                       newest first: the import feed (data notes per upload,
//                       no business records)
// Every response carries X-TFI-Server: 1 so the app can tell it's talking to
// this server (and not, say, a dev server that answers any path with HTML).
// The app validates the full schema before uploading and again on load; the
// server only checks the basics. The last 20 versions are kept for recovery.
// Uploads are written one at a time (an in-process queue), so concurrent PUTs
// never lose a version or leave readers without a snapshot.
// Manual entries (cost lines, planning inputs, shelf corrections) still live
// in each browser.
//
// Failed sign-ins (a wrong or malformed Authorization header — a request with
// none is just the browser asking for the prompt) are logged as one line with
// time, client IP and path, never the credentials. After 10 failures within
// 10 minutes an IP gets 429 until that window ends. The IP is the LAST
// X-Forwarded-For entry — the one the hosting proxy appends; earlier entries
// come from the client and can be forged to dodge the throttle — else the
// socket address.

import { createServer } from 'node:http';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';
const USER = process.env.DASHBOARD_USER ?? '';
const PUBLIC = process.env.ALLOW_PUBLIC === 'true';
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || join(fileURLToPath(new URL('.', import.meta.url)), 'snapshots');
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, 'snapshot.json');
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const KEEP_VERSIONS = 20;
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;

if (!PASSWORD && !PUBLIC) {
  console.error('Refusing to start: set DASHBOARD_PASSWORD (or ALLOW_PUBLIC=true to serve without one).');
  process.exit(1);
}
if (PASSWORD && PASSWORD.length < 12) {
  console.error('Refusing to start: DASHBOARD_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The Terminal look's VT323 font comes from Google Fonts (an @import in
// src/index.css), so the stylesheet and font hosts are allowed explicitly.
// Everything else is same-origin; the favicon is a data: URI.
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'X-TFI-Server': '1',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': CSP,
};

// Compare digests so the comparison is constant-time regardless of length.
const digest = (s) => createHash('sha256').update(s).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

// 'ok' | 'missing' (no header: the browser hasn't prompted yet) | 'bad'
function authState(req) {
  if (!PASSWORD) return 'ok';
  const h = req.headers.authorization;
  if (h === undefined) return 'missing';
  if (!h.startsWith('Basic ')) return 'bad';
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return 'bad';
  const userOk = USER ? same(decoded.slice(0, i), USER) : true;
  return same(decoded.slice(i + 1), PASSWORD) && userOk ? 'ok' : 'bad';
}

// ── failed-auth throttle ─────────────────────────────────────────────────

const failures = new Map(); // ip → { start, count }
const printable = (s, max) => String(s).slice(0, max).replace(/[^\x21-\x7e]/g, '?');

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const last = typeof xff === 'string' ? (xff.split(',').pop() ?? '').trim() : '';
  return printable(last || req.socket.remoteAddress || 'unknown', 64);
}

function pruneFailures(now = Date.now()) {
  for (const [ip, e] of failures) if (now - e.start >= FAIL_WINDOW_MS) failures.delete(ip);
}
setInterval(pruneFailures, 60_000).unref();

function throttled(ip, now = Date.now()) {
  const e = failures.get(ip);
  if (!e) return false;
  if (now - e.start >= FAIL_WINDOW_MS) { failures.delete(ip); return false; }
  return e.count >= FAIL_LIMIT;
}

function recordFailure(ip, path, now = Date.now()) {
  let e = failures.get(ip);
  if (!e || now - e.start >= FAIL_WINDOW_MS) {
    failures.delete(ip);
    if (failures.size >= MAX_TRACKED_IPS) {
      pruneFailures(now);
      // still full: drop the oldest entry (Map keeps insertion order)
      if (failures.size >= MAX_TRACKED_IPS) failures.delete(failures.keys().next().value);
    }
    e = { start: now, count: 0 };
    failures.set(ip, e);
  }
  e.count += 1;
  const blocked = e.count >= FAIL_LIMIT ? ` — blocking for ${Math.ceil((e.start + FAIL_WINDOW_MS - now) / 60000)} min` : '';
  console.warn(`auth failed: ${new Date(now).toISOString()} ip=${ip} path=${printable(path, 200)}${blocked}`);
}

async function sendFile(res, path, cache) {
  const body = await readFile(path);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': cache,
  });
  res.end(body);
}

function sendEmpty(res, status, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...extra });
  res.end();
}

// ── shared snapshot store ─────────────────────────────────────────────────

function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

// Rejects with status 413 past `limit` without destroying the request, so the
// 413 answer can still reach the client (see refuseTooLarge).
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        settled = true;
        req.off('data', onData);
        req.pause();
        reject(Object.assign(new Error('too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
  });
}

// Answer 413 once the rest of the body has been read and discarded: answering
// while the client is still sending makes Node close the socket under it, and
// the client sees a reset instead of the 413. Only signed-in clients get here;
// past a cap, answer straight away and close.
function refuseTooLarge(req, res, cap = 4 * MAX_SNAPSHOT_BYTES) {
  const body = { error: 'snapshot larger than 5 MB' };
  if (Number(req.headers['content-length']) > cap) {
    sendJson(res, 413, body, { Connection: 'close' });
    return;
  }
  let seen = 0;
  const onData = (c) => {
    seen += c.length;
    if (seen > cap) {
      req.off('data', onData);
      req.off('end', onEnd);
      sendJson(res, 413, body, { Connection: 'close' });
    }
  };
  const onEnd = () => sendJson(res, 413, body);
  req.on('data', onData);
  req.once('end', onEnd);
  req.resume();
}

// Basic shape only — the app runs the full schema before upload and on load.
function basicCheck(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'body must be a JSON object';
  for (const k of ['products', 'pipeline', 'channels', 'orders', 'campaigns', 'days']) {
    if (!Array.isArray(v[k])) return `missing array "${k}"`;
  }
  return null;
}

// Archives: snapshot-<ms>-<seq>.json (seq zero-padded). Older deploys wrote
// snapshot-<ms>.json; both are kept, pruned and listed, ordered by (ms, seq).
const ARCHIVE_RE = /^snapshot-(\d+)(?:-(\d+))?\.json$/;
const archiveKey = (f) => {
  const m = ARCHIVE_RE.exec(f);
  return [Number(m[1]), m[2] === undefined ? -1 : Number(m[2])];
};
const newestFirst = (a, b) => {
  const [am, as] = archiveKey(a);
  const [bm, bs] = archiveKey(b);
  return bm - am || bs - as;
};
async function listArchives() {
  return (await readdir(SNAPSHOT_DIR)).filter((f) => ARCHIVE_RE.test(f)).sort(newestFirst);
}

let lastArchiveMs = 0;
let archiveSeq = 0;
function nextArchiveName() {
  const ms = Math.max(Date.now(), lastArchiveMs); // never go backwards if the clock does
  archiveSeq = ms === lastArchiveMs ? archiveSeq + 1 : 0;
  lastArchiveMs = ms;
  return `snapshot-${ms}-${String(archiveSeq).padStart(6, '0')}.json`;
}

// One write at a time: each save runs after the previous one settles.
let writeQueue = Promise.resolve();
function serialized(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function saveSnapshot(payload) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const savedAt = new Date().toISOString();
  const tmp = join(SNAPSHOT_DIR, `snapshot.json.${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, JSON.stringify({ savedAt, payload }));
    // Keep the previous version as a copy, then atomically replace the
    // current file — readers always see either the old or the new snapshot.
    for (let attempt = 0; ; attempt++) {
      try {
        await copyFile(SNAPSHOT_FILE, join(SNAPSHOT_DIR, nextArchiveName()), fsConstants.COPYFILE_EXCL);
        break;
      } catch (e) {
        if (e.code === 'ENOENT') break; // first upload: nothing to keep
        if (e.code !== 'EEXIST' || attempt >= 5) throw e;
      }
    }
    await rename(tmp, SNAPSHOT_FILE);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  for (const f of (await listArchives()).slice(KEEP_VERSIONS)) await unlink(join(SNAPSHOT_DIR, f)).catch(() => {});
  return savedAt;
}

// A same-origin check that refuses anything it can't positively match,
// including `Origin: null` (sandboxed frames, file: pages).
function sameOrigin(origin, host) {
  if (origin === undefined) return true; // non-browser client (curl)
  try {
    const u = new URL(origin);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.host === host;
  } catch {
    return false;
  }
}

async function handleSnapshot(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const raw = await readFile(SNAPSHOT_FILE, 'utf8');
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : raw);
    } catch (e) {
      if (e.code === 'ENOENT') sendJson(res, 200, { snapshot: null }); // empty is a normal state, not an error
      else { console.error(`snapshot read failed (${e.code ?? 'error'})`); sendJson(res, 500, { error: 'could not read the stored snapshot' }); }
    }
    return;
  }
  if (req.method !== 'PUT') {
    sendEmpty(res, 405, { Allow: 'GET, HEAD, PUT' });
    return;
  }
  // A cross-site page can't send a JSON PUT without a preflight this server
  // never approves, but check the origin too when the browser sends one.
  if (!sameOrigin(req.headers.origin, req.headers.host)) {
    sendJson(res, 403, { error: 'cross-origin upload refused' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    sendJson(res, 415, { error: 'send Content-Type: application/json' });
    return;
  }
  let payload;
  try {
    if (Number(req.headers['content-length']) > MAX_SNAPSHOT_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
    payload = JSON.parse(await readBody(req, MAX_SNAPSHOT_BYTES));
  } catch (e) {
    if (e.status === 413) { refuseTooLarge(req, res); return; }
    sendJson(res, 400, { error: 'body is not valid JSON' });
    return;
  }
  const problem = basicCheck(payload);
  if (problem) { sendJson(res, 422, { error: problem }); return; }
  let savedAt;
  try {
    savedAt = await serialized(() => saveSnapshot(payload));
  } catch (e) {
    console.error(`snapshot save failed (${e.code ?? 'error'}): ${e.message}`);
    sendJson(res, 500, { error: `could not save the snapshot (${e.code ?? 'write failed'}) — check that SNAPSHOT_DIR is a writable volume` });
    return;
  }
  sendJson(res, 200, { savedAt });
}

// Import feed: one entry per kept version, newest first. Only the snapshot's
// own meta (coverage, sources, data notes) and record counts — never the
// records themselves. Strings are capped; anything malformed is skipped.
const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined);
function summarize(raw) {
  const { savedAt, payload } = JSON.parse(raw);
  if (typeof savedAt !== 'string' || !payload || typeof payload !== 'object') return null;
  const m = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
  const len = (k) => (Array.isArray(payload[k]) ? payload[k].length : 0);
  return {
    savedAt,
    meta: {
      coverageStart: str(m.coverageStart, 40),
      coverageEnd: str(m.coverageEnd, 40),
      extractedAt: str(m.extractedAt, 40),
      sources: Array.isArray(m.sources)
        ? m.sources.slice(0, 20).filter((x) => x && typeof x.label === 'string')
            .map((x) => ({ label: str(x.label, 80), extractedAt: str(x.extractedAt, 40), coverageEnd: str(x.coverageEnd, 40) }))
        : [],
      notes: Array.isArray(m.notes) ? m.notes.slice(0, 100).filter((n) => typeof n === 'string').map((n) => str(n)) : [],
    },
    counts: { products: len('products'), orders: len('orders'), days: len('days'), accounts: len('accounts') },
  };
}

// Parsed summaries by file name, reused while the file is unchanged.
// null = the file didn't parse (cached too, so it's logged once).
const summaryCache = new Map(); // name → { ino, size, mtimeMs, summary }

async function cachedSummary(name) {
  let fh;
  try {
    fh = await open(join(SNAPSHOT_DIR, name), 'r');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`import feed: skipped ${name} (${e.code ?? 'open failed'})`);
    summaryCache.delete(name);
    return null;
  }
  try {
    const st = await fh.stat();
    const hit = summaryCache.get(name);
    if (hit && hit.ino === st.ino && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.summary;
    let summary = null;
    try {
      summary = summarize(await fh.readFile('utf8'));
    } catch {
      // JSON.parse messages quote the input, so log only the file name.
      console.error(`import feed: skipped ${name} (not a valid snapshot)`);
    }
    summaryCache.set(name, { ino: st.ino, size: st.size, mtimeMs: st.mtimeMs, summary });
    return summary;
  } finally {
    await fh.close();
  }
}

async function handleHistory(req, res) {
  if (req.method !== 'GET') {
    sendEmpty(res, 405, { Allow: 'GET' });
    return;
  }
  let files = [];
  try {
    files = await listArchives();
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error(`import feed: could not list the store (${e.code ?? 'error'})`); sendJson(res, 500, { error: 'could not read the snapshot store' }); return; }
  }
  const names = ['snapshot.json', ...files];
  const entries = [];
  for (const [i, f] of names.entries()) {
    const s = await cachedSummary(f);
    if (s) entries.push({ savedAt: s.savedAt, current: i === 0, meta: s.meta, counts: s.counts });
  }
  const keep = new Set(names);
  for (const k of summaryCache.keys()) if (!keep.has(k)) summaryCache.delete(k);
  sendJson(res, 200, { entries });
}

const server = createServer(async (req, res) => {
  try {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://local');
    } catch {
      sendEmpty(res, 400, { Connection: 'close' });
      return;
    }
    if (url.pathname === '/healthz') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    const isApi = url.pathname === '/api/snapshot' || url.pathname === '/api/snapshot/history';
    if (!isApi && req.method !== 'GET' && req.method !== 'HEAD') {
      sendEmpty(res, 405, { Allow: 'GET, HEAD' });
      return;
    }
    if (PASSWORD) {
      const ip = clientIp(req);
      if (throttled(ip)) {
        const retry = { 'Retry-After': String(Math.ceil((failures.get(ip).start + FAIL_WINDOW_MS - Date.now()) / 1000)) };
        if (isApi) sendJson(res, 429, { error: 'too many failed sign-in attempts; try again later' }, retry);
        else { res.writeHead(429, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...retry }); res.end('Too many failed sign-in attempts. Try again later.'); }
        return;
      }
      const auth = authState(req);
      if (auth !== 'ok') {
        if (auth === 'bad') recordFailure(ip, url.pathname);
        if (isApi) sendJson(res, 401, { error: 'authentication required' });
        else {
          res.writeHead(401, { ...SECURITY_HEADERS, 'WWW-Authenticate': 'Basic realm="Tropical Futures Terminal", charset="UTF-8"' });
          res.end('Authentication required');
        }
        return;
      }
    }
    if (isApi) {
      if (url.pathname === '/api/snapshot') await handleSnapshot(req, res);
      else await handleHistory(req, res);
      return;
    }
    // Resolve inside dist/ only — no path traversal.
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      sendEmpty(res, 400);
      return;
    }
    const rel = normalize(decoded).replace(/^([/\\])+/, '');
    const path = join(ROOT, rel);
    if (path !== ROOT && !path.startsWith(ROOT + sep)) {
      sendEmpty(res, 400);
      return;
    }
    const s = await stat(path).catch(() => null);
    if (s?.isFile()) {
      // Vite fingerprints assets, so they can be cached hard; HTML must not be.
      const immutable = rel.startsWith('assets/');
      await sendFile(res, path, immutable ? 'private, max-age=31536000, immutable' : 'no-cache');
      return;
    }
    // Single-screen app with relative asset URLs (vite base './'): serving the
    // shell at a sub-path would request /sub/assets/… and break, so send
    // unknown paths home instead.
    if (rel === '' || rel === '.') {
      await sendFile(res, join(ROOT, 'index.html'), 'no-cache');
      return;
    }
    sendEmpty(res, 302, { Location: '/' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, SECURITY_HEADERS);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`Tropical Futures Terminal on :${PORT} (${PASSWORD ? 'password required' : 'PUBLIC — no password'})`);
  if (!process.env.SNAPSHOT_DIR) {
    console.warn('SNAPSHOT_DIR not set: the shared snapshot is kept inside the container and is lost on every redeploy. Mount a volume and set SNAPSHOT_DIR.');
  }
  try {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
    const probe = join(SNAPSHOT_DIR, `.write-test-${randomUUID()}`);
    await writeFile(probe, 'ok');
    await unlink(probe);
    console.log(`Shared snapshot store: ${SNAPSHOT_DIR}`);
  } catch (e) {
    console.error(`Shared snapshot store ${SNAPSHOT_DIR} is not writable (${e.code}). Uploads will fail until it is.`);
  }
});
