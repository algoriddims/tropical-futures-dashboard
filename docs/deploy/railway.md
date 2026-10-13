# Deploying to Railway

Status, 13 October 2026: deploy files are in place and checked locally (server behavior, plus a by-hand replay of the Dockerfile steps). **No Railway deploy has been run yet**, and the Docker image itself has not been built: the preparing session had no Docker daemon or Railway access. Railway's UI labels below are from memory and may differ slightly.

## What gets deployed

- `app/Dockerfile` builds the Vite app and runs `app/server.mjs`, a zero-dependency Node server.
- The server **requires a password** (HTTP Basic auth). It refuses to start without `DASHBOARD_PASSWORD`, and rejects passwords shorter than 12 characters.
- Only the built app (`dist/`) is served. Docs, the brand reference and the PRD are not in the image.
- `GET /healthz` returns `ok` without auth, for health checks.

## Shared data across devices

On Railway the server keeps **one shared snapshot** (the latest Shopify + bank sync) behind the same password. Every device that signs in loads it automatically — no per-browser import. Uploading from the IMPORT dialog (it says UPLOAD on the hosted site) replaces it for everyone; the previous 20 versions are kept on the server for recovery.

Still per browser: cost lines, planning inputs and shelf corrections you type in.

The snapshot must live on a **Railway volume** — container files are wiped on every redeploy.

## Steps

1. In Railway: **New Project → Deploy from GitHub repo →** `algoriddims/tropical-futures-dashboard`. Railway may ask you to install or authorize its GitHub app for this repo.
2. Open the service **Settings**:
   - **Root Directory:** `app` — Railway then finds `app/Dockerfile` automatically.
   - **Branch:** whichever branch you want deployed, normally `main` once milestone work is merged.
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

- The snapshot API is behind the same password; uploads from other websites are refused, bodies over 5 MB are rejected, and the app re-validates everything it loads.
- Basic auth is a single shared gate, enough for a solo private tool. It is not per-user accounts and has no lockout after failed attempts. Use a long password.
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
