# Tropical Futures Terminal — Claude Code Handoff Spec

> **Archived 13 October 2026.** Historical reference only. Use the [current implementation handoff](../../TFI-Terminal-Handoff.md); do not execute the sync prompt below. Unsupported access claims, incomplete validation guarantees and ambiguous commercial terms remain in this archive to document the old contract.

> **26 September 2026 — legacy prototype contract:** Read the [brand-aligned brief](../plans/2026-09-26-brand-aligned-dashboard.md) before using this handoff. The contract below documents the existing paste-import interface, not a verified live connection. Claims below about completed authentication, available sessions and generic stockist terms remain unverified; do not fabricate required numbers from brand notes to satisfy the schema. Validate actual source capabilities and resolve missing data explicitly before a production sync. The next model will separate wholesale, consignment settlements and payments; it is not implemented yet.

This document is the complete contract between the terminal (Kimi-built, static React app) and the data sync (Claude Code + your Shopify / Meta Ads MCP servers). Hand it to Claude Code along with the prompt in §5 and the sync is mechanical.

---

## 1. Architecture

```
Shopify MCP ─┐
             ├─► Claude Code sync (2–3×/week) ─► park-data.json ─► [IMPORT] ─► Terminal
Meta MCP ────┘                                          ▲
                                                        │ manual slices survive every import
                          bank balance · cost lines · growth target · wholesale cut · next drop
```

Three layers, one seam:

- **Acquisition** — Claude Code pulls Shopify + Meta via your existing MCP connections. Runs when you ask it (or on a local cron). No extra API spend: both APIs are free with your accounts, and the MCP auth is already done.
- **Contract** — one JSON file, `park-data.json`, in the `ParkData` shape defined below. This file is the entire interface. Anything that produces it can feed the terminal.
- **Presentation** — the terminal. It never fetches Shopify or Meta itself.

## 2. The sync ritual (2–3× per week)

This is a low-volume brand — a few orders a week — so a daily sync is overkill. Two to three imports a week keeps everything honest.

1. In Claude Code, run the sync prompt (§5).
2. Claude writes `park-data.json` and prints its contents.
3. In the terminal: click **⇪ IMPORT** (top bar), paste, hit IMPORT.
4. The status bar badge flips from `SAMPLE DATA` to `SYNCED Xm AGO`. Everything — rating, notices, forecast, top moves — recomputes on your real numbers. The **SINCE LAST SYNC** strip on the STATUS desk briefs you on what changed: new revenue/orders/ad spend, sold-outs, pipeline moves, new builds.
5. After **72 hours** without an import the badge turns amber: `SYNC NEEDED · 3d`. That's your nudge.

Your manual entries (bank balance, cost lines, growth target, wholesale cut, next drop date) live in the browser and are re-applied on top of every import. The sync never owns them. Stockist shelf counts go the other way: the **sync owns them** — tell Claude the counts when you get a stockist report and they arrive with the import. To go back to demo data: **IMPORT → CLEAR IMPORT**.

## 3. The contract — `park-data.json`

Top-level shape (all fields required unless marked optional):

```ts
interface ParkData {
  products: Product[];     // live + archived products = "rides on the floor"
  pipeline: PipelineItem[];// upcoming products = "rides under construction"
  channels: Channel[];     // online store + stockists + pop-ups
  orders: Order[];         // recent orders for the live tape (last ~20)
  campaigns: Campaign[];   // Meta campaigns, selected-period totals
  days: DayPoint[];        // daily series, oldest → newest, ≥ 60 days ideal
  quests: Quest[];         // active scenarios/goals
  costs: CostItem[];       // seed only — terminal edits win after first import
  bankBalance: number;     // seed only — manual in terminal afterwards
  repeatRate: number;      // 0..1, returning-customer share
  refundRate: number;      // 0..1, refunded orders / total orders
  guestsToday: number;     // online store sessions, latest full day (Shopify MCP)
  grossMargin: number;     // 0..1 blended margin (drives break-even ROAS)
  targetRoas: number;      // strategy constant, e.g. 2.5
  growthTargetPct: number; // strategy input, edited in terminal (GOALS desk)
  wholesalePct?: number;   // optional — stockist cut of retail, default 0.6, terminal-owned
  nextDrop?: { name: string; date: string } | null; // optional — terminal-owned, YYYY-MM-DD
  annualBudget?: number;   // optional — yearly burn budget, terminal-owned; 0 = unset
}

interface Product {
  id: string;              // stable! e.g. Shopify product id
  name: string;            // UPPERCASE reads best in the terminal
  drop: string;            // collection / drop name
  price: number;           // current retail
  unitCost: number;        // production cost per unit
  stock: number;           // total inventory across online locations
  startInventory: number;  // initial run size (stock + soldTotal is fine)
  sold7d: number;          // units sold, last 7 days
  soldPrev7d: number;      // units sold, the 7 days before that
  soldTotal: number;       // lifetime units sold
  published: boolean;      // active on the online store
}

interface PipelineItem {
  id: string; name: string; kind: string;      // kind: TEE / CAP / JERSEY…
  qty: number; unitCost: number; retail: number;
  status: 'DESIGN' | 'SAMPLES' | 'PRODUCTION' | 'READY';
  etaWeeks: number;              // weeks until stock arrives
  expectedSellThrough: number;   // 0..1, from comparable products
}

interface Channel {
  name: string; location: string;
  type: 'ONLINE' | 'STOCKIST' | 'POPUP';
  revenue: number; orders: number;             // trailing 30d is fine
  stock: { productId: string; allocated: number; sold: number }[];
  // ONLINE: keep stock: [] — the terminal derives it from products[].
  // STOCKIST/POPUP: sync-owned — Claude maintains these counts from your
  // stockist reports; each import replaces them. Terminal edits last only
  // until the next sync.
}

interface Order { id: string; time: string; label: string; value: number; returning: boolean; }

interface Campaign {
  id: string; name: string; status: 'ACTIVE' | 'PAUSED';
  spend: number; revenue: number;              // trailing 30d
  clicks: number; impressions: number; frequency: number;
  dailySpend: number[];                        // last 7 days
}

interface DayPoint { date: string; revenue: number; orders: number; spend: number; }
// date: YYYY-MM-DD · revenue/orders: Shopify · spend: Meta, same calendar day

interface Quest {
  id: string; scenario: string; goal: string; unit: string;
  target: number; current: number; daysLeft: number; reward: string;
}

interface CostItem {
  id: string; name: string;
  category: 'SUBSCRIPTION' | 'PAYROLL' | 'PRODUCTION' | 'OPS';
  amount: number;                              // per cadence
  cadence: 'MONTHLY' | 'WEEKLY' | 'ONE-OFF';
  active: boolean; note?: string;
}
```

### Field sources

| Field | Source |
|---|---|
| `products` | Shopify products + variants; `stock` from inventory levels; `unitCost` from variant cost (or your own table); sold counts bucketed from orders' line items by created date |
| `days[].revenue/orders` | Shopify orders, grouped by day (use shop timezone) |
| `days[].spend`, `campaigns` | Meta campaign insights, daily breakdown; `revenue` = purchase conversion value |
| `orders` | Shopify orders, most recent ~20 (`label` = line items summary) |
| `repeatRate` / `refundRate` | Shopify: returning vs first-time customers; refunds ÷ orders (trailing 30–90d) |
| `guestsToday` | Shopify online-store sessions via the Shopify MCP (confirmed available) |
| non-ONLINE `channel.stock` | You — tell Claude the stockist counts whenever you get a report ("TROPA sold 4 caps, 2 jerseys"); Claude carries them in the file |
| `pipeline`, `quests`, `costs`, `bankBalance`, `growthTargetPct`, `wholesalePct`, `nextDrop` | No API exists. On first run Claude seeds best-known values; afterwards **preserve them from the existing file** (see §4) |

## 4. Ownership rules (important)

| Data | Owner | On import |
|---|---|---|
| products, days, campaigns, orders, channel revenue/orders, guestsToday, stockist/pop-up `stock` | The sync | Replaced |
| pipeline, quests | You (sync preserves existing values) | Replaced only if sync outputs them |
| bankBalance, costs, growthTargetPct, wholesalePct, nextDrop, annualBudget | You, in the terminal | **Preserved** — terminal re-applies your manual entries over every import |

If a `park-data.json` already exists from a previous run, Claude must read it first and carry forward `pipeline`, `quests`, `costs`, `bankBalance`, `growthTargetPct`, `wholesalePct`, `nextDrop`, `annualBudget`, and non-ONLINE `channel.stock` — updating the stock counts only when you've reported new stockist numbers.

## 5. The sync prompt (paste into Claude Code)

```
Run my terminal data sync.

Using my Shopify MCP server and Meta Ads MCP server, build a file called
park-data.json matching the contract in TFI-Terminal-Handoff.md (attached /
in this repo). Rules:

1. If park-data.json already exists, read it first. Carry forward pipeline,
   quests, costs, bankBalance, growthTargetPct, wholesalePct, nextDrop,
   annualBudget, and non-ONLINE channel stock unchanged — update stock
   counts only when I give you new stockist numbers.
2. products: all my Shopify products. stock = total inventory; sold7d and
   soldPrev7d bucketed from order line items by day; soldTotal from lifetime
   units; unitCost from variant cost where set (ask me once for any missing
   and remember it in the existing file for next time).
3. days: last 60 days. revenue + orders from Shopify by day, spend from Meta
   insights by day, same calendar dates, my shop timezone.
4. campaigns: Meta insights trailing 30 days, purchase conversion value as
   revenue, plus 7-day daily spend array.
5. orders: my 20 most recent Shopify orders, label = "ITEM / SIZE · ITEM".
6. repeatRate and refundRate per the contract. guestsToday = online store
   sessions for the latest full day, from the Shopify MCP.
7. Write the file, validate it parses, and print the full JSON so I can
   paste it into the terminal's IMPORT box.
```

First run will take a few questions (missing unit costs, which stockists exist). After that it's one paste.

## 6. Validation behavior

The terminal validates imports before accepting: must parse as JSON and contain `products`, `pipeline`, `channels`, `campaigns`, `days`, `orders` arrays plus numeric `grossMargin` and `targetRoas`. Bad input is rejected with an error in the modal — nothing is overwritten. The import persists in the browser; the next open loads it automatically.

## 7. Conventions the engine assumes

- **One-off cost lines = committed production runs.** When a pipeline item enters PRODUCTION, add its run as a `ONE-OFF` cost (and keep the pipeline item). The forecast pays one-offs this month; DESIGN/SAMPLES runs are paid at their ETA month; sell-through revenue lands the month after ETA.
- **`etaWeeks`** is weeks until stock arrives at your door, not until production starts.
- **Ids must be stable across syncs** (Shopify product/campaign ids are perfect). The SINCE LAST SYNC briefing diffs snapshots by id — if ids change, it reports phantom "new" products and loses the thread.
- **Money is plain numbers in your store currency**, no cents-as-integers, no symbols.

## 8. Graduation paths (later, optional)

- **Local proxy server** — Claude Code builds a small Node server wrapping the same MCP calls as HTTP endpoints; the terminal fetches instead of paste-imports. Same contract, no ritual.
- **Platform backend** — the terminal gets a real database and the sync writes straight to it. Multi-device, no browser-local storage. Say when.
