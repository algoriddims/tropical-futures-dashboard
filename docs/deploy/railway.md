# Deploying to Railway

Status, 13 October 2026: **deployed and in use.** The service builds from `app/Dockerfile` on Railway (region asia-southeast1, deployed from `main` since 14 Oct 2026; CI runs on every push and pull request). These were confirmed from Railway's deploy and HTTP logs:
- the server refused to start until `DASHBOARD_PASSWORD` was set;
- unauthenticated requests get 401;
- the volume at `/data` is writable with `RAILWAY_RUN_UID=0`;
- the first real snapshot upload (`PUT /api/snapshot`) returned 200, and a later page load served it back.

Railway's UI labels below are from memory and may differ slightly.

## What gets deployed

- `app/Dockerfile` builds the Vite app and runs `app/server.mjs`, a zero-dependency Node server.
- The server **requires a password** (HTTP Basic auth). It refuses to start without `DASHBOARD_PASSWORD`, and rejects passwords shorter than 12 characters.
- Only the built app (`dist/`) is served. Docs, the brand reference and the PRD are not in the image.
- `GET /healthz` returns `ok` without auth, for health checks.

## Shared data across devices

On Railway the server keeps **one shared snapshot** (the latest Shopify + bank sync) behind the same password. Every device that signs in loads it automatically — no per-browser import. Uploading from the IMPORT dialog (it says UPLOAD on the hosted site) replaces it for everyone; the previous 20 versions are kept on the server for recovery.

Still per browser: cost lines, planning inputs and shelf corrections you type in.

**Import feed (F):** each upload's coverage, sources and data notes are listed on the IMPORTS desk, newest first, for every version the server still keeps (the current one plus 20). The overview only shows a one-line count that links there. The feed endpoint (`GET /api/snapshot/history`, same password) returns that metadata and record counts only, never the records. Parsed summaries are cached per file until the file changes.

The snapshot must live on a **Railway volume** — container files are wiped on every redeploy.

## Steps

1. In Railway: **New Project → Deploy from GitHub repo →** `algoriddims/tropical-futures-dashboard`. Railway may ask you to install or authorize its GitHub app for this repo.
2. Open the service **Settings**:
   - **Root Directory:** `app` — Railway then finds `app/Dockerfile` automatically.
   - **Branch:** `main`. Turn on **Wait for CI** (service Settings → Source) so a push only deploys after the GitHub checks pass.
   - Optional **Healthcheck Path:** `/healthz`.
3. Under **Variables**, add:
   - `DASHBOARD_PASSWORD` — at least 12 characters, ideally a generated passphrase. Store it in your password manager.
   - `SNAPSHOT_DIR` = `/data`
   - Optional `DASHBOARD_USER` — also require a specific username.
   - Do not set `PORT`; Railway provides it.
4. **Add a volume** to the service (right-click the service or use the command palette → *Volume*) and mount it at **`/data`**.
   - The image runs as a non-root user. If the deploy log says `Shared snapshot store /data is not writable (EACCES)`, add the variable `RAILWAY_RUN_UID` = `0` (Railway's documented fix for volume permissions) and redeploy. *Not verified here — the log line tells you whether it's needed.*
5. Under **Networking**, generate a domain. Railway serves it over HTTPS, which Basic auth needs.
6. Open the URL. The browser asks for a username/password: any username unless `DASHBOARD_USER` is set, plus your password.

7. Open IMPORT → paste the latest `park-data.json` → **UPLOAD**. Every device now loads it.

If the deploy logs say `Refusing to start: set DASHBOARD_PASSWORD`, step 3 is missing. That's intended. If they warn `SNAPSHOT_DIR not set`, uploads work but vanish on the next deploy — do step 4.

### Uploading from the command line

```bash
curl -u any:YOUR_PASSWORD -X PUT -H 'Content-Type: application/json' \
  --data-binary @park-data.json https://YOUR-APP.up.railway.app/api/snapshot
```

## Notes

- The snapshot API is behind the same password; uploads from other websites (or with `Origin: null`) are refused, bodies over 5 MB are rejected, and the app re-validates everything it loads.
- Uploads are written one at a time. Each one is written to a uniquely named temporary file, the current snapshot is copied to an archive (`snapshot-<ms>-<seq>.json`), and the new file then atomically replaces it. Simultaneous uploads all succeed in order, and readers never see an empty store. Archives named `snapshot-<ms>.json` by earlier deploys are still listed and pruned.
- Basic auth is a single shared gate, enough for a solo private tool. It is not per-user accounts. Use a long password.
- Failed sign-ins are logged as one line (`auth failed: <time> ip=<ip> path=<path>`, never the credentials). After 10 failures in 10 minutes, that IP gets 429 for the rest of the window, even with the right password. Restarting the service clears the counter. A request with no credentials (the browser's first visit before the prompt) doesn't count. The IP is the last `X-Forwarded-For` entry, the one the hosting proxy appends; earlier entries come from the client and are ignored. This is not verified against Railway's proxy from here. It slows casual guessing but is not a lockout, and a restart resets it. A long random password (20+ characters) is still the real protection.
- Every response carries `Content-Security-Policy` (same-origin only, plus Google Fonts for the Terminal look's VT323 font), `Strict-Transport-Security`, `X-Frame-Options: DENY` and `nosniff`. Fingerprinted assets are cached `private, max-age=31536000, immutable`. HTML is `no-cache`.
- Malformed request lines and bad `%` escapes in the path get 400 with no stack trace in the logs. When an archived snapshot can't be parsed, the import feed logs only its file name.
- The browser remembers the credentials for the session. Log out by closing the browser or clearing site data.
- Cost: Railway bills by usage. A small static server like this should be cheap, but check current Railway pricing — not verified here.

## Local equivalent

```powershell
Set-Location app
npm ci
npm run build
$env:DASHBOARD_PASSWORD = 'a-long-local-test-password'
npm start   # http://localhost:3000
```

Server regression checks (no dependencies; needs `dist/` from `npm run build`): `node --test app/server.test.mjs` from the repo root.
