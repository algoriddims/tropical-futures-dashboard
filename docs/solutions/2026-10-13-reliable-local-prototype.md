# Milestone 1 — reliable local prototype

Date: 13 October 2026. Scope: the first milestone in [TFI-Terminal-Handoff.md](../../TFI-Terminal-Handoff.md). Work was done in a Linux cloud container (Node 22.22.0, npm 10.9.4), not on the founder's Windows machine. No live accounts were connected or touched. All data used in checks was synthetic.

## Baseline (before any code change)

| Check | Result |
|---|---|
| `npm ci` | **Hung.** 125 of 532 lockfile entries pointed at `npm.mirrors.msh.team`, a private mirror that this network refused. They were re-pointed to `registry.npmjs.org`. Every entry keeps its `integrity` hash, so npm rejects any tarball that differs. After that, install succeeded (483 packages). |
| `npm run build` | Passed. |
| `npm run lint` | **Failed: 12 errors.** 8 in stock shadcn `components/ui/*`, 1 `no-useless-escape` in `InlineEdit.tsx`, 1 `set-state-in-effect` in `ImportModal.tsx`, 2 `only-export-components` in `TerminalContext.tsx`. |
| `npm test` | Did not exist. |
| Runtime | Not checked at baseline. The source-audit findings were confirmed by reading code, then by the regression tests below. |

## What changed

| Handoff step | Change | Where |
|---|---|---|
| 2. Validate the complete import | Full zod schema over every nested record and field the engine reads, plus cross-checks: duplicate ids, shelf rows pointing at unknown products, sold > allocated. Errors name the path ("`products[2].stock: missing (expected number)`"). An invalid import changes nothing. A failed storage write is reported and keeps the previous snapshot. Unknown extra fields are kept. | `app/src/game/validate.ts`, `TerminalContext.tsx` |
| 2. Preserve recovery/export | **EXPORT BACKUP** in the import dialog downloads everything stored in the browser, including a stored snapshot that no longer validates. Such a snapshot is reported on the Status desk and never rendered. Clearing an import now asks for confirmation. | `overrides.ts` (`exportBackup`), `ImportModal.tsx`, `StatusDesk.tsx` |
| 3. Persist manual edits; expose conflicts; field ownership | Stockist shelf corrections are stored as edits recording the sync value they replaced and when. They survive reload. A later import never silently overwrites one: if the sync value moved, a **SHELF COUNT CONFLICTS** panel offers **USE SYNC** or **KEEP MINE**. Re-entering the same value is a no-op. Setting a cell back to the sync value retires the edit. The field-ownership map is documented at the top of `overrides.ts`. | `overrides.ts`, `LocationsDesk.tsx`, `TerminalContext.tsx` |
| 4. Fabricated freshness/sessions/refunds | Hardcoded "SHOPIFY 2m / META 4m" removed. The status bar shows **coverage**, **extraction** and **import** ages from the snapshot, with "UNKNOWN" when absent. Staleness follows coverage, not import time. Visitors were `guestsToday × days × 0.82` and are now measured `sessions` only, or "—". Conversion requires sessions for every day in the window. The refund count derived from a rate was removed; reported rates are shown as "AS REPORTED" or "NOT IN DATA". The rating leaves out parts whose inputs are missing instead of scoring them. The revenue % change requires a full, non-zero previous window (it used to divide by $1 and could show +9900%). Sample mode is labelled throughout. Simulated orders are marked SIM and no longer inflate PARK CASH. The ticker is labelled "FICTIONAL GUEST VOICES". | `freshness.ts`, `engine.ts`, `Chrome.tsx`, `StatusDesk.tsx`, `OrdersDesk.tsx`, `Ticker.tsx` |
| 5. Remove misleading money-owed totals | "Money owed" (cumulative shelf sales × today's retail × one wholesale %) is removed from the Locations desk, the top moves and the cash forecast. It is replaced with an explicit "NOT TRACKED YET" note. | `engine.ts`, `LocationsDesk.tsx` |
| 6. Intentional sellout | `BROKEN` is replaced by `SOLD OUT`. An optional `restockPolicy` decides what a sellout means: `LIMITED` → green "limited run complete", with no restock prompt, move or scarcity copy, and no rating penalty. `REPLENISH` → red, with a restock move. Unset → amber "restock or retire?". | `types.ts`, `engine.ts`, `InventoryDesk.tsx`, `LocationsDesk.tsx` |
| 7. Regression checks | `npm test` (Vitest): 41 tests across validation, overrides/persistence, engine rules and freshness, mapped to evaluation-contract cases 6, 7 and 8 where they apply. Browser smoke script: `app/scripts/smoke-e2e.cjs` (18 checks). | `app/src/game/__tests__/`, `app/scripts/` |

Also fixed: `ImportModal` now mounts only while open, which removes one baseline lint error. The page has a blank favicon, which removes a 404.

### Import format additions (all optional, backwards compatible)

The Claude Code sync can now send these. Older `park-data.json` files still import.

```jsonc
{
  "meta": {
    "coverageStart": "2026-10-01T00:00:00Z", // first moment the records cover
    "coverageEnd":   "2026-10-12T23:59:59Z", // last moment — drives "stale"
    "extractedAt":   "2026-10-13T07:00:00Z", // when the sync pulled the data
    "sources": [{ "label": "Shopify", "extractedAt": "2026-10-13T07:00:00Z" }]
  },
  "days": [{ "date": "10-12", "revenue": 0, "orders": 0, "spend": 0, "sessions": 0 }], // sessions: measured only
  "products": [{ "...": "...", "restockPolicy": "LIMITED" }],                          // or "REPLENISH"
  "refundRate": 0.03, "repeatRate": 0.3                                                 // omit when not measured
}
```

`guestsToday` is no longer read. Terminal-owned fields (`bankBalance`, `costs`, `growthTargetPct`, `wholesalePct`, `nextDrop`, `annualBudget`) and `quests` may be omitted.

## Verification actually run

- `npm test`: 41/41 passed. Mutation check: reintroducing (a) a red alert for a limited sellout, (b) counting partially measured sessions and (c) silently resolving shelf conflicts to the sync each made at least one test fail. Restoring the code made all pass.
- `npm run build`: passed. The bundle grew from 354 kB to about 429 kB (gzip 102 → 124 kB), mostly from zod, which was already a dependency but previously unused.
- `npm run lint`: 11 errors, all present at baseline. None introduced.
- Browser smoke (`vite preview`, headless Chromium): 18/18. Covers sample labelling, keyboard desk switching, invalid import rejected with field path and data unchanged, valid import, old coverage flagged stale while import is recent, unavailable sessions/rates, limited sellout, shelf correction surviving reload, conflict raised on re-import with the correction still shown, USE SYNC resolution, and no console errors.
- Not run: the evaluation contract's frozen-batch/holdout procedure. No AutoResearch experiments were run. Nothing was tested on Windows.

## Known limitations (not fixed in this milestone)

- **Bank balance of $0 when unknown.** A snapshot without `bankBalance`, on a browser where it was never entered, shows `PARK CASH $0`, and runway and forecast use 0. Making it truly "unknown" touches runway, forecast and several desks. It is the next small fix.
- Shelf edits record time and the replaced value, but no author or reason (contract case 8 asks for both). There is one active edit per cell and no full history.
- Validation enforces types and identities, not business plausibility (e.g. `soldTotal` vs `startInventory`).
- Currency, business timezone and the definition of the $2K monthly sales goal are still unset. Money is shown without a currency code. Day buckets use whatever the sync sends.
- Wholesale/consignment records (agreements, invoices, statements, payments) don't exist yet, so partner balances are intentionally absent (milestone 2).
- `wholesalePct` remains in the data model as a planning input but no longer drives any total.
- The `restockPolicy` of real products must come from the sync or a future editor; there is no UI to set it yet.
- Remaining lint errors are mostly in vendored shadcn files; fixing them is unrelated churn.

## Lessons kept

1. **Lockfiles can pin unreachable registries.** Check `resolved` hosts before blaming the network. Re-point the hosts and let the integrity hashes guard correctness.
2. **Three clocks, never one.** Coverage, extraction and import times answer different questions. Staleness belongs to coverage. Encoded in `freshness.ts` and its tests.
3. **Manual corrections must name what they replaced.** Storing the base value is what makes "the sync moved" detectable instead of silently lost. Encoded in `ShelfEdit.base` and the overrides tests.
4. **No substitute denominators.** `|| 1` baselines and estimated visitors produce confident nonsense (+9900%). Return null and render "—". Encoded in `measuredSessions`, `revenueDeltaPct` and `combineRating`.
5. **CSS uppercasing changes `innerText`.** Browser checks against this UI must compare uppercased text. A broad `has-text("IMPORT")` selector also matched "CLEAR IMPORT" and cleared the data mid-test. Use exact-text selectors for destructive buttons.

## Later the same day

- **Plain language.** At the owner's request, the theme-park vocabulary was replaced with business terms throughout: Bank balance, Inventory, Production pipeline, Traffic, Goals, Alerts, and a Score banded Needs work → Strong. The fictional guest-voice ticker and quest rewards were removed. Internal type and file names (`ParkData`, `Quest`, `park-data.json`) are unchanged, so existing syncs import as before. Guarded by an engine test and a smoke check that sweeps every desk.
- **Looks.** Paper (default, Are.na-inspired), Dark, and the original Terminal, cycled with `T`. With no saved choice, the look follows the system light/dark setting.
- **Font.** ABC Areal (Dinamo, licensed) for body text — see `app/src/assets/fonts/README.md` for license limits.
- **Hosting.** Password-gated `app/server.mjs` + `app/Dockerfile` for Railway — see `docs/deploy/railway.md`. Not yet deployed.
