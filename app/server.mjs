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
//
// GET /healthz answers without auth, for the host's health check. It reveals
// nothing but "ok".
//
// Note: business data still lives in each browser's localStorage. Hosting the
// app does not move data to the server or sync it between devices.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? '';
const USER = process.env.DASHBOARD_USER ?? '';
const PUBLIC = process.env.ALLOW_PUBLIC === 'true';

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
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

server.listen(PORT, () => {
  console.log(`Tropical Futures Terminal on :${PORT} (${PASSWORD ? 'password required' : 'PUBLIC — no password'})`);
});
