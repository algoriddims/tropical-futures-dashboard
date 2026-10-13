# Deploying to Railway

Status, 13 October 2026: deploy files are in place and checked locally (server behavior, plus a by-hand replay of the Dockerfile steps). **No Railway deploy has been run yet**, and the Docker image itself has not been built: the preparing session had no Docker daemon or Railway access. Railway's UI labels below are from memory and may differ slightly.

## What gets deployed

- `app/Dockerfile` builds the Vite app and runs `app/server.mjs`, a zero-dependency Node server.
- The server **requires a password** (HTTP Basic auth). It refuses to start without `DASHBOARD_PASSWORD`, and rejects passwords shorter than 12 characters.
- Only the built app (`dist/`) is served. Docs, the brand reference and the PRD are not in the image.
- `GET /healthz` returns `ok` without auth, for health checks.

## What hosting does *not* change

- **Data stays in each browser.** Imports, bank balance, costs and shelf corrections live in that browser's localStorage. Your laptop and phone will not share data. Each browser needs its own import, and clearing site data erases them. Use EXPORT BACKUP. Moving data server-side is the "persistent storage" milestone.
- No accounts are connected. It is the same app as `npm run dev`, behind a password.

## Steps

1. In Railway: **New Project → Deploy from GitHub repo →** `algoriddims/tropical-futures-dashboard`. Railway may ask you to install or authorize its GitHub app for this repo.
2. Open the service **Settings**:
   - **Root Directory:** `app` — Railway then finds `app/Dockerfile` automatically.
   - **Branch:** whichever branch you want deployed, normally `main` once milestone work is merged.
   - Optional **Healthcheck Path:** `/healthz`.
3. Under **Variables**, add:
   - `DASHBOARD_PASSWORD` — at least 12 characters, ideally a generated passphrase. Store it in your password manager.
   - Optional `DASHBOARD_USER` — also require a specific username.
   - Do not set `PORT`; Railway provides it.
4. Under **Networking**, generate a domain. Railway serves it over HTTPS, which Basic auth needs.
5. Open the URL. The browser asks for a username/password: any username unless `DASHBOARD_USER` is set, plus your password.

If the deploy logs say `Refusing to start: set DASHBOARD_PASSWORD`, step 3 is missing. That's intended.

## Notes

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
