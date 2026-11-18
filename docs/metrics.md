# Metric dictionary

Generated from `app/src/analytics/dictionary.ts` by `npx vite-node scripts/metrics-doc.ts` — edit the source, not this file. A unit test fails if they drift.

Channel groups: Online Store and Facebook & Instagram → DTC. Every other Shopify channel (today: Draft Orders, Shopify Claude Connector App) is UNMAPPED and stays visible in totals until the owner maps it.

Comparisons: absolute change for money and units; percentage-point change for percentages; standard growth % only when the prior value is positive.

## Net product revenue

- **Formula:** gross merchandise sales − allocated discounts − merchandise returns (Shopify net_sales, summed per day and channel).
- **Requires:** ShopifyQL sales: gross_sales, discounts, returns, net_sales by day and sales_channel.
- **Eligible records:** All orders on all channels (filterable by channel group); $0 free-gift orders count with $0.
- **Time basis:** Sale on the order date; a return on the date it was recorded (business timezone). Complete days only.
- **Refunds:** Returns are subtracted on their own date, so a refund of an older order lowers the period it happens in (kept, not dropped). Shopify values are already net — nothing is subtracted twice.
- **Currency:** Shop reporting currency (USD) from Shopify, in integer cents. Never summed across currencies without a dated rate.
- **Exclusions:** Shipping charges, taxes, duties, tips and gift-card sales.
- **Limitations:** A day with no row inside the extract's coverage had no sales; days outside coverage are unknown and make the metric partial.

## Gross profit

- **Formula:** net revenue on lines with a recorded cost − cost of goods sold of those lines (Shopify net_sales_with_cost_recorded − cost_of_goods_sold).
- **Requires:** ShopifyQL: cost_of_goods_sold, net_sales_with_cost_recorded.
- **Eligible records:** Same records as net product revenue.
- **Time basis:** As net product revenue. COGS uses the unit cost recorded on the order line (historical), not today's cost.
- **Refunds:** Shopify reverses cost on returned lines on the return date (negative COGS). Whether a refund restored stock is not checked per refund.
- **Currency:** Shop reporting currency (USD) from Shopify, in integer cents. Never summed across currencies without a dated rate.
- **Exclusions:** Revenue from lines without a recorded cost is excluded; the metric is then labelled partial with its cost coverage.
- **Limitations:** Gross, not net, profit: no fees, shipping, payroll or ads. Fully discounted orders (e.g. draft orders at 100% off) carry cost with $0 revenue and lower profit.

## Gross margin

- **Formula:** gross profit ÷ net revenue with recorded cost × 100, from summed values (never an average of product percentages).
- **Requires:** Gross profit and net_sales_with_cost_recorded.
- **Eligible records:** Lines with a recorded cost.
- **Time basis:** As gross profit. Comparisons are in percentage points.
- **Refunds:** As gross profit.
- **Currency:** Ratio; inputs in one currency.
- **Exclusions:** Revenue without recorded cost (shown as cost coverage).
- **Limitations:** Unavailable when that revenue is zero or negative.

## AOV at purchase

- **Formula:** (gross merchandise sales + discounts) on orders placed in the period ÷ orders placed in the period.
- **Requires:** ShopifyQL: gross_sales, discounts, orders.
- **Eligible records:** Every order Shopify counts, including $0 free-gift orders (daily aggregates can't exclude them per order).
- **Time basis:** Order date.
- **Refunds:** Later refunds are excluded — this is the basket at checkout.
- **Currency:** Shop reporting currency (USD) from Shopify, in integer cents. Never summed across currencies without a dated rate.
- **Exclusions:** Shipping, tax, gift cards.
- **Limitations:** $0 gift orders pull the average down; noted on screen.

## Units per order at purchase

- **Formula:** merchandise units ordered ÷ orders placed (same orders as AOV).
- **Requires:** ShopifyQL: quantity_ordered, orders.
- **Eligible records:** As AOV.
- **Time basis:** Order date.
- **Refunds:** Excluded.
- **Currency:** —
- **Exclusions:** Returned units (they belong to the return date).
- **Limitations:** No bundles exist in the catalog today; a bundle line would count as one unit as Shopify reports it.

## Net units sold

- **Formula:** units ordered + units returned (returns negative), per variant, from ShopifyQL net_items_sold.
- **Requires:** ShopifyQL by day × channel × product_id × product_variant_id.
- **Eligible records:** All channels; joined to the catalog by stable variant id, never by name or SKU.
- **Time basis:** Order date for units sold; return date for units returned.
- **Refunds:** Returned units subtract on the return date.
- **Currency:** —
- **Exclusions:** None. Variants sold but no longer in the active catalog stay visible as "not in active catalog".
- **Limitations:** Fulfilment is not checked: an order counts when placed, not when shipped.

## Inventory position

- **Formula:** per variant, summed across locations: available, on hand, committed, incoming, unavailable (damaged + safety stock + QC).
- **Requires:** Admin GraphQL inventoryLevels.quantities for every location.
- **Eligible records:** Active products; bundle parents are excluded from stock totals (their stock lives in components).
- **Time basis:** A single snapshot at the stated read time — not historical stock for past periods.
- **Refunds:** —
- **Currency:** —
- **Exclusions:** Incoming stock is shown separately and never added to available. Committed is already excluded from available and is not subtracted again.
- **Limitations:** Negative available means oversold; shown as 0 sellable plus "oversold by N".

## Weeks of cover (estimate)

- **Formula:** sellable units ÷ (net units sold in the last 28 complete days before the inventory read ÷ 4).
- **Requires:** Inventory snapshot and variant-day sales for the 28-day window.
- **Eligible records:** Tracked variants with sellable stock; demand from all channels, because all channels share the same stock pool.
- **Time basis:** 28 complete days ending the day before the inventory read (business timezone). Configurable in code.
- **Refunds:** Net of returns in the window.
- **Currency:** —
- **Exclusions:** Zero velocity → "No recent sales", never infinity. Out of stock → "Out of stock".
- **Limitations:** Observed sales, not unconstrained demand. Flags: short history (published within the window) and stock-outs that cap sales. No lead times or safety stock are supplied, so low-cover alerts use a heuristic threshold (4 weeks).

## Sales at risk, next 4 weeks (estimate)

- **Formula:** units of demand the stock can't meet over the next 28 days × the variant's average net price in the cover window. Demand runs day by day at the 28-day pace; stock on the way is added on its expected date.
- **Requires:** Inventory snapshot, variant-day sales for the 28-day window, and (optional) stock-on-the-way entries typed in by the owner.
- **Eligible records:** Tracked, non-bundle variants with net sales in the window. Ranks the "look into" list: most at risk first.
- **Time basis:** Projects from the day of the inventory read (business timezone) over the following 28 days.
- **Refunds:** Pace and price are net of returns in the window.
- **Currency:** Shop reporting currency (USD) from Shopify, in integer cents. Never summed across currencies without a dated rate.
- **Exclusions:** Stock on the way dated on or before the inventory read (it may already be in the count), and entries with no size on a multi-size product, are not counted — and are listed as such.
- **Limitations:** Assumes the recent pace continues, which overstates a launch spike and understates a product held back by stock-outs. Average net price, not list price. An estimate for ranking, not a forecast.

## Reorder-by date

- **Formula:** run-out day − lead time, where run-out day = inventory-read day + ⌊sellable ÷ daily pace⌋ + 1. If that date has passed: "order now", with the days without stock = landing day − run-out day.
- **Requires:** The owner's lead time in weeks (typed in on the Stock page). Without it no date is shown.
- **Eligible records:** Variants raised in the "look into" list that have no dated stock on the way.
- **Time basis:** Calendar days from the inventory read, business timezone.
- **Refunds:** —
- **Currency:** —
- **Exclusions:** Not shown when dated stock is on the way; the gap before it arrives is shown instead.
- **Limitations:** One lead time for every product. No safety stock or minimum order. Uses observed pace, as weeks of cover does.

## Stock age band

- **Formula:** Days from the product's webstore publish date to the inventory-read day. Under 180 = New; 180–269 = Aged; 270–359 = Last call; 360 or more = Archive (sample sale). Products the owner marks Timeless never age. Shares are of sellable units, of units × recorded unit cost, and of net sales in the 90 complete days before the stock read.
- **Requires:** Shopify publishedAt for the online store; the owner's Timeless list (typed in on the Stock page).
- **Eligible records:** Tracked, non-bundle products with sellable stock (sales shares also count products sold out now).
- **Time basis:** Calendar days, business timezone.
- **Refunds:** Sales shares use net sales (returns deducted).
- **Currency:** Shop currency, minor units.
- **Exclusions:** Products never published to the online store are "not on the webstore", age unknown — not new. Units with no recorded cost are counted in units but not valued.
- **Limitations:** The age of the design on the webstore, not of the units on the shelf: a restock doesn't reset it, re-publishing in Shopify does. Shopify records no receipt dates.

## Returning-customer share (DTC)

- **Formula:** Online Store customers ordering in the period who ordered before it began ÷ Online Store customers ordering in the period.
- **Requires:** ShopifyQL customers and returning_customers for exactly that period (unique counts can't be summed across days).
- **Eligible records:** Identified Shopify customers on the Online Store channel.
- **Time basis:** Order date; "before" uses the store's full Shopify history.
- **Refunds:** Not affected.
- **Currency:** —
- **Exclusions:** Wholesale accounts and unmapped channels.
- **Limitations:** Always partial: Shopify doesn't report identity coverage, and purchases from before the store's Shopify records are unknown. Only extracted periods are available.

## Returns (refund value)

- **Formula:** Shopify returns for the period (merchandise refunded, dated on the return).
- **Requires:** ShopifyQL returns.
- **Eligible records:** All channels.
- **Time basis:** Return date.
- **Refunds:** This is the refund value itself.
- **Currency:** Shop reporting currency (USD) from Shopify, in integer cents. Never summed across currencies without a dated rate.
- **Exclusions:** Shipping and tax refunds.
- **Limitations:** A value measure — not a return rate.

## Cumulative drop sell-through — unavailable

- **Formula:** net fulfilled units attributable to the drop ÷ externally received units attributable to the drop, through the same cutoff.
- **Requires:** A drop → product mapping, received units per drop (receipt records), and fulfilled units per product since launch.
- **Eligible records:** —
- **Time basis:** Cumulative from the drop's launch date to a stated cutoff.
- **Refunds:** Returned units would reduce net fulfilled units.
- **Currency:** —
- **Exclusions:** Transfers, return restocks and unfulfilled preorders are not receipts or sales.
- **Limitations:** Unavailable: no drop mapping or receipt history exists in any connected source, and it is not reconstructed from current stock. "Published" dates are shown instead of launch dates and are not drop launches.

## Return rate — unavailable

- **Formula:** physically returned units linked to an eligible fulfilled-sales cohort ÷ fulfilled units in that cohort.
- **Requires:** Returns linked to the orders/fulfilments they came from, with return dates.
- **Eligible records:** —
- **Time basis:** Sales cohort with an observation cutoff.
- **Refunds:** —
- **Currency:** —
- **Exclusions:** —
- **Limitations:** Unavailable: Shopify analytics reports returns by return date only. "Returns (refund value)" is shown as a separate, differently named metric.

## Wholesale (ordered / invoiced / fulfilled / paid) — unavailable

- **Formula:** Separate measures per stage; combined with DTC only on a documented, comparable basis.
- **Requires:** Wholesale orders/invoices/payments with stable ids (and the Shopify order name when also entered in Shopify, for de-duplication).
- **Eligible records:** —
- **Time basis:** Per stage date.
- **Refunds:** —
- **Currency:** Per record; no FX assumed.
- **Exclusions:** Rows already counted in Shopify are excluded (see dedupeWholesale).
- **Limitations:** Unavailable: no wholesale records are connected. Shopify draft orders stay unmapped rather than assumed wholesale.
