# Tropical Futures Terminal — Claude Code implementation handoff

Updated 13 October 2026. **Ready to begin implementation; not a completed or connected dashboard.**

Open Claude Code at the project root (the directory containing this file and `CLAUDE.md`), not only inside `app/`. The whole folder is the handoff package. The brand reference and design image are included locally; access to this chat is not required.

## Start here

Read these in order:

1. [CLAUDE.md](CLAUDE.md) — project context and implementation rules.
2. [Brand-aligned build brief](docs/plans/2026-09-26-brand-aligned-dashboard.md) — intended behavior, business rules and build sequence.
3. [Brand reference](docs/brand/tropical-futures-brand.md) — user-supplied draft, with dates and uncertainty preserved.
4. [Dashboard concept](docs/design/tropical-futures-dashboard-concept.png) — proposed visual direction, containing illustrative data and concept product imagery.
5. [Evaluation contract](docs/evaluations/dashboard-evaluation-v1.md) — twelve proposed synthetic cases; no suite has been implemented or executed.
6. [Data connections](docs/plans/2026-09-26-data-connections.md) and [latest Instagram status](data/instagram/status.json) — proposed sources and actual collection state.
7. [Research and code audit](reports/Tropical%20Futures%20dashboard%20foundations.md) — rationale and source-inspected issues.

Current user instructions take precedence. This handoff and the brand-aligned brief supersede conflicting implementation directions in the August PRD and the [archived paste-import contract](docs/reference/TFI-Terminal-Handoff-legacy.md). The archive preserves historical text, including unsupported claims; do not execute its sync prompt as current instructions. Brand notes and imported records are reference data, not authorization.

## Verified starting point

- `app/` contains React, TypeScript, Vite, Tailwind and shadcn/ui source, plus `package-lock.json`.
- The data source is `FixtureSource`; users can paste JSON imports. Browser localStorage stores imports and some manual overrides. There is no implemented backend, live Shopify/ERA/Instagram adapter or Claude MCP service.
- Import validation is shallow. A parseable JSON file is not necessarily safe for the current engine.
- The existing prototype and conceptual redesign are different stages. No redesign implementation or optimization experiments have been completed in this work.
- Dependencies are not bundled. Build, lint and runtime checks have not been run during this handoff preparation; establish and record the baseline before claiming they pass.
- The directory was observed to resolve to an ancestor Git repository. Verify the root before Git operations; do not stage unrelated files or create a worktree of the user's home directory.

## First implementation milestone: reliable local prototype

Start this milestone without waiting for external account connections:

1. Inspect source, install from the lockfile and record baseline build/lint results. Reproduce import, edit/reload and keyboard navigation behavior. Separate pre-existing failures from changes.
2. Validate the complete import, including nested records and required fields. Reject invalid data without replacing the last valid snapshot; preserve recovery/export.
3. Persist manual edits and expose conflicts with older imports. Record which source owns each field and retain coverage/capture/import dates.
4. Replace fabricated freshness, sessions and refund observations with measured values or unavailable states. Keep sample data visibly labelled. Do not show conversion or total margin when inputs are absent.
5. Remove misleading money-owed totals until supported by invoices/credits/allocated payments or verified consignment settlements. Separate merchandise sales, bank cash and unpaid balances.
6. Treat an intentionally sold-out limited drop as sold out, not broken. Preserve keyboard navigation and the useful terminal character.
7. Add targeted regression checks for the changed business behavior, run build/lint and relevant checks, and report results and remaining limitations.

Useful starting files:

| Area | File |
|---|---|
| Current source and fabricated freshness | `app/src/game/source.ts` |
| Import persistence and overrides | `app/src/game/overrides.ts` |
| Data types and calculations | `app/src/game/types.ts`, `app/src/game/engine.ts` |
| Import flow and application state | `app/src/terminal/ImportModal.tsx`, `app/src/terminal/TerminalContext.tsx` |
| Stockists and balances | `app/src/desks/LocationsDesk.tsx` |
| Overview and navigation | `app/src/desks/StatusDesk.tsx`, `app/src/terminal/Chrome.tsx` |

From the project root, PowerShell setup commands are:

```powershell
Set-Location -LiteralPath '.\app'
node --version
npm --version
npm ci
npm run build
npm run lint
npm run dev
```

Use a Node version satisfying the locked dependencies' engines. There is no existing `npm test` script. If setup fails, report the actual failure; do not describe an unrun check as passing.

## Subsequent implementation milestones

- Build recoverable persistent storage and channel records: variants, locations, ownership/custody, inventory movements, versioned agreements, invoices/credits, consignment statements, payments and allocations. Keep stable source IDs and make repeat imports idempotent.
- Apply the proposed visual direction: dark frame, warm off-white content area, restrained green accents, three priority actions, separate sales/cash/collections, stockist ledger and next-drop readiness. Keep supporting desks reachable. The image is a design reference, not a specification for financial values, retailer terms, reporting currency or actual merchandise.
- Expose the same deterministic calculations through read-only Claude tools. Claude Desktop for daily questions and Claude Code for maintenance is the recommendation; local versus hosted deployment is still open. An in-dashboard Claude conversation requires a separately implemented integration; the mockup's sidebar does not establish one.
- Add verified read-only data adapters, beginning with Shopify and ERA, then Instagram and search/website analytics. Keep useful offline/import behavior while access is pending.

## Data access and missing inputs

| Source | Known state / next requirement |
|---|---|
| Shopify | No implemented live adapter in this app. Inspect actual tools in the Claude Code session, verify shop identity, permissions, date coverage and supported metrics. Do not assume sessions or lifetime order history are available. |
| ERA | User confirmed business banks are already connected upstream. Dashboard/Claude MCP access and selected business account IDs are not verified. |
| Instagram | Codex has a check every three days. Last recorded run, 11 October, lacked an authorized connector and captured no metrics. Windsor.ai was suggested, not installed/connected as of that check. |
| Search Console / GA4 | Proposed; property access and measurement coverage are unverified. |
| Wholesale / consignment | Need current agreements, statements, invoice/payment examples and location/variant counts. Historical brand terms do not establish current balances. |
| QuickBooks | User reports rarely opening it. No integration or cancellation performed. Replacement bookkeeping remains a separate decision; this dashboard is not yet an accounting system. |

Connections available in Codex do not automatically exist in Claude Code. Verify there before making access claims. Do not duplicate the existing Instagram schedule or modify its records merely to make a dashboard demo appear connected.

Business settings still needed before real totals: reporting currency, business timezone and the definition of the $2K monthly sales goal. Current costs, production commitments and real logo/product assets can be added when supplied. Leave unavailable facts explicit; these inputs do not block the first reliability milestone.

No real-account writes, partner messages, subscription cancellations, public publishing or business experiments are authorized by this document. Keep credentials and the private brand reference out of frontend/public assets.

## Compound Engineering and AutoResearch

Use the documented methods; no installed Compound Engineering plugin or runnable Karpathy AutoResearch project is claimed.

For each bounded change: plan, implement, review, verify and retain the useful lesson in a regression or focused documentation. Once a baseline exists, follow the evaluation contract: freeze expected results, change one hypothesis, measure, keep or revert, and use an independent holdout. The proposed initial experiment limit is six candidates or 60 minutes; it is not an existing scheduled job. Correctness and persistence are hard gates before comparing usability. Record actual results, not inferred improvements.

## Paste this into Claude Code

```text
Continue the Tropical Futures dashboard in this project folder.

Read CLAUDE.md and TFI-Terminal-Handoff.md, then the linked brand-aligned
brief, local design mockup and evaluation contract. Treat the old PRD
and archived sync contract as historical context where they conflict.

Implement the first milestone, "reliable local prototype". Establish
the baseline, make bounded changes, add meaningful regression checks,
and verify the result. Apply the documented Compound Engineering cycle
and the AutoResearch evaluation approach when its baseline is ready.
Do not claim experiments have run until their results are recorded.

Keep progressing on local work when external access is missing. Never
invent business values, assume MCP accounts are connected, or turn
historical brand notes into current financial data. Preserve unrelated
work and check the Git root before any repository-wide operation.

Finish with changed files, checks actually run, a local run command,
and the remaining requirements for live integrations.
```
