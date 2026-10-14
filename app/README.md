# Tropical Futures Terminal

Private operations dashboard for Tropical Futures (Shopify, wholesale, consignment, ad spend, bank/card costs). React + TypeScript + Vite frontend, plus a small zero-dependency Node server (`server.mjs`) for the hosted build. Project context and principles: [../CLAUDE.md](../CLAUDE.md).

## Commands

Node 22 (see `.nvmrc`). Run from this `app/` directory after `npm ci`.

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (port 3000) |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Vitest regression checks (`src/game/__tests__/`) |
| `npm run lint` | ESLint |
| `node --test server.test.mjs` | Server tests |
| `npm start` | Serve `dist/` with `server.mjs` (needs `DASHBOARD_PASSWORD`) |

Browser smoke check (needs Playwright, not a project dependency — see the script header):

```bash
npm run build && npx vite preview --port 4173 &
node scripts/smoke-e2e.cjs
```

CI runs build, tests, lint, server tests and the smoke check: [../.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Data

- Shopify sync: [../docs/data/shopify-sync.md](../docs/data/shopify-sync.md)
- ERA business bank/card sync: [../docs/data/era-sync.md](../docs/data/era-sync.md)
- Both feed one snapshot built by `scripts/shopify-snapshot.ts`.

**Real data lives only in `data/private/` (gitignored) and, when hosted, in the server's shared snapshot (`/api/snapshot`).** Never commit real data, and never put it in fixtures, tests or the built assets.

## Deploy

Railway, from `Dockerfile`: [../docs/deploy/railway.md](../docs/deploy/railway.md). Build and health-check settings live in the Railway service settings (Railway's `railway.json` config-as-code is being retired and isn't used here).
