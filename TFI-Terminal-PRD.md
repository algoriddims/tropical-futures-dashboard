# TROPICAL FUTURES TERMINAL — Product Requirements Document

> **13 October 2026 — implementation entry point:** Start with the current [Claude Code handoff](TFI-Terminal-Handoff.md). This PRD records the older prototype and design history; current handoff and brand-aligned requirements supersede conflicting directions here. The original paste-import contract is [archived separately](docs/reference/TFI-Terminal-Handoff-legacy.md). Its account-access claims are not verified.

> **26 September 2026 — brand incorporated:** The [brand-aligned implementation brief](docs/plans/2026-09-26-brand-aligned-dashboard.md) records the intended next build, current $2K monthly sales goal and evidence rules. Section 0 below remains the historical as-built description; the new brief does not claim those proposed changes have shipped. The [original supplied brand file](docs/brand/tropical-futures-brand.md) is preserved unchanged.

**Working title:** Tropical Futures Terminal (was: Hype Park Terminal)
**Version:** 0.2 (as-built update)
**Date:** 2026-08-29
**Owner:** Solo founder, streetwear brand (Tropical Futures Institute)
**Status:** v0.1 was the pre-build draft; §0 below records what actually shipped and where it diverges from the draft. Anything marked **[DECISION]** can still be vetoed.

---

## 0. As-built state (2026-08-29) — read this first

The draft below describes the plan; this section describes reality. Where they conflict, this section wins.

**Built:** React + TypeScript + Vite + Tailwind + shadcn/ui, static frontend. Sample fixture data today; real data can be supplied through a pasted `park-data.json` (historical contract: [archived import handoff](docs/reference/TFI-Terminal-Handoff-legacy.md); no live sync is verified). All user data (imports + manual entries) lives in the browser's localStorage — no backend yet.

**Shipped desk map** (differs from §6 — no literal park scene, no calendar/brief/settings desks):

| Key | Desk | Contents |
|---|---|---|
| `S` | STATUS | Park cash (editable), Shopify sales, ad machines, inventory, guests, **TOP MOVES** (top-3 actions ranked by $ at stake), pipeline, locations, scenarios, burn/runway strip, alerts; **SINCE LAST SYNC** delta briefing on imports; **drop countdown strip** |
| `P` | BUILDS | Rides under construction (pipeline) |
| `G` | GOALS | Growth-target calculator (next run vs current pipeline), funding check vs forecast low point, **NEXT DROP editor** (name + date), active scenarios, cross-data PARK INSIGHTS feed |
| `I` | RIDES | Inventory with ride states |
| `L` | SHOPS | Locations incl. **MONEY OWED TO THE PARK** (stockist receivables at an editable wholesale cut), per-location stock tables |
| `C` | COSTS | Editable cost lines by category, burn/runway, **6-month cash-flow forecast** (burn + committed runs + pipeline revenue + stockist payouts) |
| `O` | ORDERS | Orders / cash tape |
| `A` | ADS | Campaigns with verdicts vs break-even ROAS |
| `N` | NEWS | Triaged notices (red/amber/green) |

**Systems shipped:** park rating (0–1000, transparent parts); deterministic rules engines for notices, insights, and top moves (no AI-generated text); in-UI editing of bank balance, cost lines, growth target, wholesale cut, next drop; import with validation + previous-snapshot archiving; sync-delta diffing; staleness badge (amber after 72h — tuned for a low-volume brand syncing 2–3×/week, not daily).

**Ownership model (differs from §7):** the sync owns products, daily series, campaigns, orders, channel revenue, guestsToday, and stockist shelf counts. The terminal owns bank balance, cost lines, growth target, wholesale cut, and next drop — re-applied over every import.

**Correctness rules now enforced:** forecast baseline is always trailing-30d revenue (independent of viewing range); simulated live ticks never run on imported data; one-off cost lines = committed production runs paid this month; DESIGN/SAMPLES runs paid at ETA month; sell-through revenue lands the month after ETA.

**Backlog:** stockist payment-status tracking (partial payouts), calendar/drop-history desk, sound & juice (§8.5), local proxy server or platform backend ([archived handoff](docs/reference/TFI-Terminal-Handoff-legacy.md) §8).

---

## 1. Vision

A personal, keyboard-first business command center for a streetwear brand that presents real store and ad data through the fiction of a theme park management sim (RollerCoaster Tycoon). The founder opens it each morning and, in under two minutes, knows: how much money the park made, which rides are pulling guests, which marketing machines are burning cash, and what needs attention today — then goes deeper desk-by-desk with single-key navigation.

The gamification is not decoration layered on a dashboard; it is the **interface language** of the business. Real events in Shopify and Meta Ads animate the park and drive its game systems.

**Design north stars:**

1. **Fun to check, fast to leave.** The park should make the founder *want* to look at the numbers, but every desk answers its question in one glance.
2. **Real data, honest numbers.** Game metaphors never distort the underlying figures. Every pixel of the park is traceable to a real metric; hovering any game element shows the raw number and its source.
3. **Terminal soul.** Dense, monospace, keyboard-first, zero-click navigation — inspired by Gambit Terminal's desk model.

---

## 2. Background & Inspiration

### 2.1 Gambit Terminal (structural reference)

Gambit Terminal (terminal.gambit.zone) is a web-based, keyboard-first market terminal organized around ~15 "desks," each bound to a single key (`` ` `` search, `0` dashboard, `c` chart, `n` newsfeed, `b` daily brief, `k` calendar, `a` analyst, etc.). Key patterns to adopt:

- **Desk model**: one screen = one question. Desks share global context rather than nesting.
- **Single-key global navigation**: no mouse required, no routing through menus.
- **Triaged notifications**: every headline/event is graded (red = act now, amber = notable, green = context) before it reaches the user.
- **Daily brief**: a pre-digested summary generated on a schedule.
- **Density**: sparklines, percent chips, compact tape-style rows.

### 2.2 RollerCoaster Tycoon (experiential reference)

The RCT systems that map naturally onto an e-commerce brand:

- **Guests** with thoughts and moods → site visitors and customers with behavioral signals.
- **Rides/attractions** with popularity, uptime, queues → products and drops with sell-through, stockouts, demand.
- **Park cash + loan** → revenue, ad spend, margin.
- **Park rating** (a single composite number) → brand health score.
- **Scenario goals** ("1,500 guests by October, Year 3") → time-boxed business goals/quests.
- **Research & development** → experiments and unlocks.
- **Notifications ticker** ("Guest 1042 is lost") → triaged business events.
- **Staff** (handymen, mechanics, entertainers) → automations/AI agents.

---

## 3. Goals & Non-Goals

### 3.1 Goals (v1)

- Morning-check workflow: full business picture in < 2 minutes from the Park view.
- Live-ish data from **Shopify** (orders, products, inventory, customers) and **Meta Ads** (spend, ROAS, campaigns) via the founder's existing MCP services.
- A gamified park scene that *truthfully* reflects the business (guest flow = traffic/orders, ride state = product performance).
- Park Rating: one composite score (0–1000, RCT-style) computed from real KPIs with a fully transparent formula.
- Triaged notification feed with red/amber/green urgency.
- Quest system: time-boxed goals (e.g., "Sell out the drop in 72h") with rewards that are cosmetic but satisfying.
- Daily brief auto-generated each morning.
- Single-user, self-hosted. No multi-tenant anything.

### 3.2 Non-Goals (v1)

- **No write actions.** v1 is read-only: it will not pause campaigns, change budgets, or edit products. (v2 candidate — see §12.)
- No team/multi-user support, no roles, no permissions.
- No mobile app (responsive web is acceptable; desktop-first design).
- No additional data sources beyond Shopify + Meta Ads (Klaviyo, TikTok, GA4 are explicitly deferred; the data layer must make them easy to add).
- No real-money P&L accounting (no COGS reconciliation, tax, or bookkeeping — this is an operational dashboard, not accounting software).
- No public-facing anything. Private tool.

---

## 4. Users

**Single user**: the founder, running a streetwear brand (drops model, Shopify storefront, Meta Ads as primary paid channel). Comfortable with terminals, uses Claude Code daily, runs MCP servers locally. The dashboard runs where Claude Code runs (local dev server) or on a cheap private VPS; auth is a single shared secret/password — no OAuth needed for v1. **[DECISION]**

---

## 5. The Core Metaphor: RCT ↔ Business Mapping

This table is the heart of the PRD. Every game element must have a deterministic, documented data source.

| RCT concept | Business meaning | Data source |
|---|---|---|
| Park guests walking paths | Site visitors / active shoppers (sessions, or orders as proxy if sessions unavailable) | Shopify (analytics/orders) |
| Guest enters park | New session / new visitor | Shopify |
| Guest rides an attraction | Purchase of a product | Shopify orders |
| Ride popularity / queue length | Product sales velocity, sell-through rate | Shopify orders + inventory |
| Ride broken down | Product out of stock / variant unavailable | Shopify inventory |
| Guest thoughts ("I want to go home") | Customer signals: refunds, support tickets, reviews | Shopify refunds (reviews deferred) |
| Happy guest balloons / repeat rides | Repeat customers, AOV growth | Shopify customers/orders |
| Park cash | Net revenue (today / week / month) | Shopify |
| Loan / cash burn | Ad spend | Meta Ads |
| Ride ticket price | Product price / AOV | Shopify |
| Marketing campaign placard | Active Meta campaign/ad set | Meta Ads |
| Park rating (0–1000) | Composite brand health (see §8.1) | Derived |
| Scenario/quest goal | Time-boxed KPI target | User-defined |
| Research lab | Experiment tracker (creative tests, new channels) | User-defined + Meta |
| Staff (handyman, mechanic) | Automations / Claude-powered agents (v2) | — |
| Weather / rain | External context (payday weekends, seasonality) | Calendar heuristics (optional) |
| Park entrance gate | Storefront homepage | — |

**Truthfulness rule:** game states must be *computable* from real data via documented thresholds. E.g., "ride broken down" ⟺ inventory = 0 on all variants AND product is published. Thresholds live in one config file (`game_rules.ts`) so they can be tuned without touching logic.

---

## 6. Product Structure: The Desks

Global single-key navigation, Gambit-style. A persistent bottom status bar shows: `PARK CASH $X · RATING 742 · GUESTS TODAY 213 · [desk name] · time`. All desks share a global date-range selector (`1` = today, `2` = 7d, `3` = 30d, `4` = custom).

### Desk map (default keybinds)

| Key | Desk | Question it answers |
|---|---|---|
| `p` | **Park** (home) | How is the business doing overall, as a living scene? |
| `0` | **Dashboard** | All key numbers, one grid. |
| `o` | **Orders / Cash** | Money in: orders, revenue, AOV, trends. |
| `r` | **Rides** (Products) | Which products/drops are performing? |
| `a` | **Ads** | Is Meta spend efficient? What to scale/kill? |
| `g` | **Guests** (Customers) | Who is buying? New vs returning, cohorts. |
| `i` | **Inventory** | What's about to stock out or rot? |
| `n` | **Newsfeed** | What happened that I should know about? (triaged) |
| `q` | **Quests** | Am I on track against my goals? |
| `b` | **Daily Brief** | The morning summary. |
| `k` | **Calendar** | Drop schedule, campaign flights, key dates. |
| `,` | **Settings / Rules** | Thresholds, goal config, data connections. |

### 6.1 Park desk (`p`) — the centerpiece

An isometric pixel-art park scene, animated, where every element is data-driven:

- **Guest sprites** enter at the gate and wander paths. Population density ∝ real traffic/orders for the selected period (with a documented scale factor, e.g., 1 sprite = 5 orders, capped for performance; show the scale in the corner).
- **Rides** are placed on the map, one per active product/drop. Ride state machine:
  - `THRIVING` (animated, guests queuing): high velocity, healthy stock.
  - `NORMAL`: baseline.
  - `QUIET` (no queue): low velocity.
  - `BROKEN` (RCT breakdown animation): out of stock.
  - `CLOSED` (barriers up): product unpublished/draft.
- **Cash counter** (RCT-style, top of screen): net revenue for the period, ticking up live when new orders arrive.
- **Thought bubbles** above guests for notable events ("That hoodie sold out?!" on stockout; "Worth every penny" on repeat purchase).
- Clicking/hovering a ride opens a popover with the raw numbers (units sold, revenue, sell-through %, stock) and a `jump` link to the Rides desk.
- **Weather** (optional, v1.1): rain on low-traffic days vs. trailing average; sunshine on record days.

The park must degrade gracefully: if data is stale or a source is down, the park dims to grayscale and a banner states which feed is stale and when it last updated. Never fake liveliness.

### 6.2 Dashboard (`0`)

Gambit-style all-in-one grid. Tiles: Revenue (sparkline + % vs prior period), Orders, AOV, Meta Spend, blended ROAS, MER (revenue ÷ ad spend), Park Rating gauge, Active quests progress, Top 3 rides, Red alerts count. Each tile is keyboard-focusable; `Enter` jumps to the owning desk.

### 6.3 Orders / Cash (`o`)

Tape-style order feed (newest first, dense monospace rows: time, items, value, new/returning flag), revenue chart (today/7d/30d), AOV trend, refunds row, day-over-day and week-over-week comparisons.

### 6.4 Rides / Products (`r`)

Sortable table: product, units sold, revenue, sell-through %, stock remaining, days-of-stock-left estimate, velocity trend arrow, ride state badge. Sort keys: `u` units, `v` revenue, `s` stock-risk. Drop performance mode: group by drop/collection.

### 6.5 Ads (`a`)

Campaign table: name, status, spend, revenue attributed, ROAS, CTR, CPM, frequency, trend. Efficiency verdicts driven by configurable thresholds (e.g., ROAS < break-even → red "MONEY PIT" flag; ROAS > target & rising → green "SCALE ME"). Break-even ROAS is a user-configured rule (needs gross margin input in Settings).

### 6.6 Guests / Customers (`g`)

New vs returning split, repeat rate, top customers (anonymized handles fine), cohort-ish view (customers by first-order month, simple), refund rate. Keep it honest to what Shopify exposes — no fake segmentation.

### 6.7 Inventory (`i`)

Stockout risk list (days-of-stock < threshold → amber/red), dead stock list (no sales in N days, N configurable), "ride needs a mechanic" call-outs. Restock sizing hint (simple velocity × lead time) is v1.1.

### 6.8 Newsfeed (`n`)

All notable business events in one triaged tape, exactly Gambit's red/amber/green model:

- **Red (act now):** stockout on a live product, spend spike vs. budget pacing, ROAS below break-even for 3+ consecutive days, refund spike, data feed failure.
- **Amber (notable):** product velocity change >50% DoD, frequency > threshold, quest at risk.
- **Green (context):** milestones (100th order), quest progress, daily brief ready, new returning-customer record.

Filters: `r`/`a`/`g` toggle tiers; source toggles (shop/ads/system). Every notification links to its desk.

### 6.9 Quests (`q`)

Time-boxed scenario goals, RCT-style card: "FOREST HILLS SCENARIO — Sell 300 units of the autumn drop by Oct 31. Reward: golden park gate." Progress bars, days remaining, projected completion (linear pace), won/lost states, celebration animation on completion. User creates quests in Settings; v1 ships 3 templates: revenue target, sell-out-a-drop, ROAS floor.

### 6.10 Daily Brief (`b`)

Auto-generated each morning (schedule configurable, default 07:00 local): yesterday's numbers, week-to-date pacing vs. quests, top alerts, one suggested focus for the day. Deterministic template in v1; Claude-generated prose via the founder's local Claude Code/MCP setup is a v1.1 option (BYO key, never stored server-side).

### 6.11 Calendar (`k`)

Drop dates, campaign start/end, quest deadlines, and retail-context dates (paydays, holidays) in a month grid. Manual entry + derived from Shopify collections/Meta flight dates where available.

### 6.12 Settings / Rules (`,`)

- Connections: Shopify MCP + Meta Ads MCP status, last sync, manual re-sync.
- Game rules config: all thresholds from `game_rules.ts` editable via UI (writes back to config).
- Business inputs: gross margin % (for break-even ROAS), target ROAS, monthly revenue goal, timezone/currency.
- Quest editor.

---

## 7. Data & Integrations

### 7.1 Sources (v1)

1. **Shopify via MCP** — the founder already runs a Shopify MCP server through Claude Code. Required reads: orders (line items, prices, refunds, customer new/returning), products/variants (status, price, inventory levels), collections (drop grouping). Nice-to-have: shop analytics/sessions if exposed; otherwise traffic is proxied by orders + a documented scale factor.
2. **Meta Ads via MCP** — campaigns, ad sets, ads; insights (spend, impressions, clicks, CTR, CPM, frequency, purchase conversions, purchase conversion value) at campaign level minimum, ad-set level preferred.

**[DECISION]** Integration architecture: the app must NOT hard-depend on Claude Code at runtime. Claude Code + MCP is the *development and prototyping* environment. For the running app, wrap each source behind a `DataSource` interface with two implementations:

- `MCPDataSource` — talks to the MCP servers directly (used for dev/prototyping and if the founder runs the terminal alongside Claude Code).
- `DirectAPIDataSource` — talks to Shopify Admin API and Meta Marketing API with stored access tokens (recommended for the always-on app; MCP servers often run per-session, which breaks scheduled syncs).

This keeps the founder's MCP workflow for building and ad-hoc queries, while the terminal itself stays alive when Claude Code is closed.

### 7.2 Data model (minimum entities)

- `Order`, `OrderLineItem`, `Refund`
- `Product`, `Variant`, `Collection` (drop), `InventoryLevel`
- `Customer` (id, first_order_at, order_count, total_spent)
- `AdCampaign`, `AdSet`, `AdInsightDaily`
- `Quest`, `Notification`, `DailyBrief`, `ParkRatingSnapshot`

Storage: SQLite via a simple ORM (Drizzle/Prisma) is plenty for a single-user app. **[DECISION]**

### 7.3 Sync & freshness

- Incremental sync every 5 min for orders/insights (configurable), full re-sync nightly.
- Every desk displays a per-source freshness chip (`SHOPIFY 2m ago · META 4m ago`). Stale (>15 min) = amber banner; failed = red banner + park grayscale (§6.1).
- Store raw payloads for reproducibility; compute game state from stored data, never from live calls at render time (keeps the UI fast and the park deterministic).

### 7.4 Credentials

Tokens/keys in `.env` / local secret store only. Never commit, never send anywhere except the source APIs. Single shared password gate for the web UI (session cookie). **[DECISION]**

---

## 8. Game Systems

### 8.1 Park Rating (0–1000)

Composite brand-health score, recomputed on every sync, snapshotted daily for the trend line. Transparent weighted formula (weights in `game_rules.ts`, shown in UI on hover — RCT never hides its rating math, neither do we):

| Component | Weight | Signal |
|---|---|---|
| Sales momentum | 25% | Revenue vs. trailing 28-day baseline |
| Ride health | 20% | % of active products in stock and selling |
| Marketing efficiency | 20% | ROAS vs. break-even; trend |
| Guest happiness | 15% | Refund rate (inverse), repeat-customer rate |
| Quest progress | 10% | Pacing vs. active quest targets |
| Inventory discipline | 10% | Dead-stock % (inverse), stockout count (inverse) |

Rating bands map to RCT flavor: 0–200 "Derelict", 200–400 "Roadside Attraction", 400–600 "Local Favorite", 600–800 "Destination Park", 800–1000 "Hype Park".

### 8.2 Guest simulation rules

- Sprite count = f(real activity) with a published scale factor per desk time-range; capped at ~200 sprites for performance.
- Guest mood color (green/neutral/red) from aggregate signals (refund rate, sell-out frustration events).
- New orders trigger a coin-splash + cash tick (sound optional, mutable with `m`).
- Simulation must be *reproducible*: same data → same park. Seed the RNG from the date + data hash.

### 8.3 Notifications engine

Rule-based event detector runs post-sync: each rule = (condition over stored data, tier, message template, desk link). All rules in `game_rules.ts`. No ML in v1.

### 8.4 Quests

Entities: target metric, target value, deadline, reward (cosmetic unlock: park decorations, gate skins, soundtrack). Templates as in §6.9. Completion → celebration overlay + permanent unlock shown in the park.

### 8.5 Sound & juice (v1.1)

8-bit cash register on order, crowd murmur scaled to guest count, ride jingles on record days. All off by default; `m` toggles. **[DECISION]**

---

## 9. Metrics & Definitions (canonical)

| Metric | Definition |
|---|---|
| Net revenue | Σ order line totals − refunds (selected period) |
| AOV | Net revenue ÷ order count |
| ROAS | Meta-attributed purchase value ÷ Meta spend |
| MER (blended) | Total net revenue ÷ total Meta spend |
| Break-even ROAS | 1 ÷ gross margin % (margin entered in Settings) |
| Sell-through % | Units sold ÷ (units sold + current stock) per product |
| Days of stock | Current stock ÷ trailing 14-day daily unit velocity |
| Repeat rate | % of orders in period from customers with order_count > 1 |
| Sellout speed | Drop start → inventory zero (per drop) |

Currency/timezone: single store currency, founder's local TZ, set in Settings.

---

## 10. UX & Art Direction **[DECISION]**

- **Hybrid aesthetic**: the Park desk is chunky isometric pixel art (RCT1/2 palette); every other desk is a dense monospace terminal (dark background, phosphor-green/amber accents, IBM Plex Mono or similar).
- Persistent bottom status bar + top keybind hint strip. Full keyboard nav; mouse fully supported but never required.
- `?` opens the keybind cheat-sheet overlay on every screen.
- Desktop-first (1280px+); usable but not optimized below that.
- Performance budget: park scene ≥ 30fps with 200 sprites; desk switches < 100ms from cache.

---

## 11. Technical Stack (for Claude Code) **[DECISION]**

- **Next.js (App Router) + TypeScript + Tailwind** — fast for Claude Code to build and iterate.
- **Park rendering**: HTML5 Canvas with a small custom isometric renderer (no game engine dependency; keep the asset pipeline to sprite sheets). PixiJS acceptable if it speeds development.
- **DB**: SQLite + Drizzle ORM.
- **Sync**: node-cron style background jobs inside a small server module; per §7.1, `DataSource` interface with MCP and direct-API implementations.
- **State**: server components + lightweight client stores (zustand) for park sim state.
- **Auth**: single password → session cookie.
- **Testing**: unit tests for game_rules and rating math (these are the correctness core); snapshot test the notification rules.
- Repo layout suggestion: `/app` (desks), `/game` (sim, rules, sprites), `/data` (sources, sync, db), `/config/game_rules.ts`.

Build order hint for Claude Code: data layer + canonical metrics first (with fixtures/mocked API responses), then Dashboard + Orders + Ads desks, then the Park renderer, then quests/notifications, then polish. Fixtures let most of the app be built before real credentials are wired.

---

## 12. Roadmap

**MVP (v0):** Data layer + fixtures; Park desk (static-ish: rides + cash + guests, no weather); Dashboard; Orders; Rides; Ads; Newsfeed (core red rules only); Park Rating v1; password gate.

**v1:** Quests, Daily Brief (template), Calendar, Inventory desk, Guests desk, full notification rule set, sound off/on, freshness/staleness handling, Settings UI.

**v1.1:** Direct API data sources (if MVP ran on MCP), Claude-prose daily brief (BYO key), weather, restock hints, drop-performance mode.

**v2 (explicitly deferred):** Write actions from the terminal (pause campaign, adjust budget, create discount) via scoped API tokens with confirmation modals; additional sources (Klaviyo, TikTok/IG organic, GA4); staff-as-agents (a Claude-powered "mechanic" that proposes fixes on red alerts); multi-device sync.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| MCP sessions don't persist → terminal goes dark when Claude Code closes | `DirectAPIDataSource` path (§7.1); MCP for dev only |
| Meta attribution ≠ reality (iOS, modeled conversions) | Show MER (blended) next to ROAS everywhere; label attribution clearly |
| Gamification distorts decision-making (chasing the score) | Rating formula fully visible; raw numbers always one hover away |
| Scope creep (it's a game AND a dashboard) | MVP cut is strict; game systems are config-driven, not bespoke |
| No session/traffic data from Shopify → guest simulation weak | Order-proxy scale factor documented; GA4 as later source |

---

## 14. Open Questions (for the founder, non-blocking)

1. Gross margin % for break-even ROAS (needed for Ads desk verdicts + rating).
2. What counts as a "drop" in Shopify — collections, tags, or naming convention? (Drives ride grouping.)
3. Monthly revenue goal + typical drop cadence (seed values for quests/rating calibration).
4. Is approximate site traffic available anywhere (GA4, Shopify analytics export)? Upgrades the guest simulation.
5. Sound on or off by default preference; any pixel-art brand motifs to include (logo on the park gate?).

---

## 15. Acceptance Criteria (v1)

- [ ] Founder opens `p` and sees the park reflecting *yesterday's real data* within 5s of load.
- [ ] Every desk reachable by its single key; `?` overlay accurate.
- [ ] Every number on every desk traceable to Shopify/Meta source data with visible freshness.
- [ ] Park Rating matches the documented formula on a known fixture dataset (unit-tested).
- [ ] Stockout on a live product produces a red notification within one sync cycle and breaks the corresponding ride.
- [ ] A quest can be created in Settings and tracks to completion with correct pacing math.
- [ ] With both feeds disconnected, the app still loads from cache, park is grayscale, staleness banners accurate.
