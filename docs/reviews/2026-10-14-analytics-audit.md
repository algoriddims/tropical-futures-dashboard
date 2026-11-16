# Analytics audit — 14 Oct 2026

Scope: revenue and margin, products and variants, sizes, DTC vs wholesale, and weekly actions, assessed against the brief of 14 Oct. "Verified" means checked against code, a test run or the live Shopify data (read-only). "Hypothesis" means inferred and not checked.

## Data correctness

| # | Finding | Basis |
|---|---|---|
| D1 | Revenue came from `days[].revenue`, total Shopify net sales per day over 60 days, with no discounts, returns or COGS split and no channel split. Period comparisons used `days.slice(-n)`, which counted today's partial day as a full day. | Verified: `src/game/shopify.ts`, `engine.ts computeMetrics` |
| D2 | Margin was a list-price estimate weighted by 365-day units. It was not gross profit and ignored discounts, returns and historical cost. | Verified: `shopify.ts` note "Gross margin 70% is a list-price estimate" |
| D3 | Product units were joined by product title and kept in 7-day and 365-day windows only, with no variant or size level. | Verified: `shopify.ts` (`unitsSold365d[p.title]`) |
| D4 | "Sell-through" was 365-day units ÷ (units + current stock). This rebuilds receipts from current stock, which the brief rules out under that name. | Verified: `engine.ts sellThrough` |
| D5 | Inventory was a single `inventoryQuantity` total per variant. The store has two locations (Qwik Pack & Ship, Business Address) and committed units (2), which were not shown. | Verified: live Admin GraphQL, 14 Oct |
| D6 | Money was JavaScript floats in dollars, with no currency guard. | Verified: `types.ts`, `engine.ts` |
| D7 | Shopify reports COGS from the cost recorded on each order line, cost coverage (`net_sales_with_cost_recorded`), purchase-time quantities and stable product/variant ids. None of this was used. | Verified: live ShopifyQL, 14 Oct |
| D8 | Draft Orders (13, 11 and 10 units at 100% discount: Mar, May, Aug) carry $164–$234 of cost each with $0 revenue. Earlier notes treated one as "possibly wholesale". It is unmapped: the owner has to say what draft orders are. | Verified data. Purpose is a hypothesis. |
| D9 | The returning-customer rate was a 90-day figure shown next to a 7-day range. | Verified: `StatusDesk` |

## Architecture

- **A1.** Calculations already lived in `src/game/engine.ts` as pure functions, which is good. But one module mixed cash, planning and product metrics, and there was no metric dictionary.
- **A2.** Typed-in records (costs, goal, shelf corrections) lived only in browser localStorage, which breaks "browser storage is not the sole durable store". Verified: `overrides.ts`.
- **A3.** The validated-snapshot workflow (extract → converter → full zod validation → shared server snapshot) is sound and was kept.

## Decision usefulness and UI

- **U1.** The overview's first screen showed cash and runway but no revenue-vs-prior-period with dates, no profit and no margin. Verified: screenshots of 13 Oct.
- **U2.** There was no size-level availability: you couldn't see which sizes are out. Verified.
- **U3.** There was no DTC vs wholesale view, and channels were reduced to an "Online Store" row. Verified.
- **U4.** Ranges included "today" (a partial day) and ran over different windows per panel. Verified.

## Accessibility

- **X1.** Earlier work fixed focus trapping, labels and 44 px touch targets (13 Oct). New panels need the same: tables with headers and a text alternative for the trend chart.

## What changed in response

See [docs/metrics.md](../metrics.md) and [docs/data/analytics-contract.md](../data/analytics-contract.md), and the implementation summary in the PR.

Found during browser verification (fixed):

- Size labels are free text and the store uses several spellings of one size (Small / S, X-Large / Extra Large / XL, 2X-Large / XXL / 2XL). The size matrix showed 12 columns for 5 sizes. `sizeKey` (`metrics.ts`) now groups them; unknown labels pass through.
- The matrix cell took the first variant of a size, so a product sold in several colours would show only one colour's stock. It now shows one row per colour and sums the variants in a cell. No current product has both size and colour, so today's numbers were not affected.
- A margin change that rounds to 0.0 points showed as a red "−0.0 PP"; it now reads "±0.0 PP".
- Long data-limitation chips ran off a 375px screen (`.badge` is `nowrap`); they wrap now.
- The analytics schema was built before zod's no-eval setting ran, so zod's eval probe tripped the page's CSP (console error, no functional effect). The setting now runs in `schema.ts` first.
