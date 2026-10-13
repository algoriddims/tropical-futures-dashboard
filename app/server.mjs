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
// Every response carries X-TFI-Server: 1 so the app can tell it's talking to
// this server (and not, say, a dev server that answers any path with HTML).
// The app validates the full schema before uploading and again on load; the
// server only checks the basics. The last 20 versions are kept for recovery.
// Manual entries (cost lines, planning inputs, shelf corrections) still live
// in each browser.

import { createServer } from 'node:http';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
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

const SECURITY_HEADERS = {
  'X-TFI-Server': '1',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

// Compare digests so the comparison is constant-time regardless of length.
const digest = (s) => createHash('sha256').update(s).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

function authorized(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = USER ? same(decoded.slice(0, i), USER) : true;
  return same(decoded.slice(i + 1), PASSWORD) && userOk;
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

// ── shared snapshot store ─────────────────────────────────────────────────

function sendJson(res, status, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Basic shape only — the app runs the full schema before upload and on load.
function basicCheck(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'body must be a JSON object';
  for (const k of ['products', 'pipeline', 'channels', 'orders', 'campaigns', 'days']) {
    if (!Array.isArray(v[k])) return `missing array "${k}"`;
  }
  return null;
}

async function handleSnapshot(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const raw = await readFile(SNAPSHOT_FILE, 'utf8');
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : raw);
    } catch (e) {
      if (e.code === 'ENOENT') sendJson(res, 200, { snapshot: null }); // empty is a normal state, not an error
      else { console.error(e); sendJson(res, 500, { error: 'could not read the stored snapshot' }); }
    }
    return;
  }
  if (req.method !== 'PUT') {
    res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD, PUT' });
    res.end();
    return;
  }
  // A cross-site page can't send a JSON PUT without a preflight this server
  // never approves, but check the origin too when the browser sends one.
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    sendJson(res, 403, { error: 'cross-origin upload refused' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    sendJson(res, 415, { error: 'send Content-Type: application/json' });
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req, MAX_SNAPSHOT_BYTES));
  } catch (e) {
    sendJson(res, e.status ?? 400, { error: e.status === 413 ? 'snapshot larger than 5 MB' : 'body is not valid JSON' });
    return;
  }
  const problem = basicCheck(payload);
  if (problem) { sendJson(res, 422, { error: problem }); return; }
  const savedAt = new Date().toISOString();
  try {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
    const body = JSON.stringify({ savedAt, payload });
    // keep the previous version, then swap the new one in atomically
    try { await rename(SNAPSHOT_FILE, join(SNAPSHOT_DIR, `snapshot-${Date.now()}.json`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const tmp = `${SNAPSHOT_FILE}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, SNAPSHOT_FILE);
    const old = (await readdir(SNAPSHOT_DIR)).filter((f) => /^snapshot-\d+\.json$/.test(f)).sort().reverse();
    for (const f of old.slice(KEEP_VERSIONS)) await unlink(join(SNAPSHOT_DIR, f));
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: `could not save the snapshot (${e.code ?? 'write failed'}) — check that SNAPSHOT_DIR is a writable volume` });
    return;
  }
  sendJson(res, 200, { savedAt });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (url.pathname === '/api/snapshot') {
      if (!authorized(req)) {
        sendJson(res, 401, { error: 'authentication required' });
        return;
      }
      await handleSnapshot(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401, { ...SECURITY_HEADERS, 'WWW-Authenticate': 'Basic realm="Tropical Futures Terminal", charset="UTF-8"' });
      res.end('Authentication required');
      return;
    }
    // Resolve inside dist/ only — no path traversal.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const path = join(ROOT, rel);
    if (path !== ROOT && !path.startsWith(ROOT + sep)) {
      res.writeHead(400);
      res.end();
      return;
    }
    const s = await stat(path).catch(() => null);
    if (s?.isFile()) {
      // Vite fingerprints assets, so they can be cached hard; HTML must not be.
      const immutable = rel.startsWith('assets/');
      await sendFile(res, path, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      return;
    }
    // Single-screen app with relative asset URLs (vite base './'): serving the
    // shell at a sub-path would request /sub/assets/… and break, so send
    // unknown paths home instead.
    if (rel === '' || rel === '.') {
      await sendFile(res, join(ROOT, 'index.html'), 'no-cache');
      return;
    }
    res.writeHead(302, { ...SECURITY_HEADERS, Location: '/' });
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
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
    const probe = join(SNAPSHOT_DIR, '.write-test');
    await writeFile(probe, 'ok');
    await unlink(probe);
    console.log(`Shared snapshot store: ${SNAPSHOT_DIR}`);
  } catch (e) {
    console.error(`Shared snapshot store ${SNAPSHOT_DIR} is not writable (${e.code}). Uploads will fail until it is.`);
  }
});
