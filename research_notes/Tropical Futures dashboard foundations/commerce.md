# Tropical Futures commerce and data foundations

Research observed 2026-09-26. Scope: operational dashboard design for Shopify DTC, wholesale, and consignment, operated through Claude. No private account was accessed; installed connectors, Shopify plan, access scopes, account currency, reporting timezone, actual stockists, contract terms, costs, and sales volumes are unverified. Recommendations below are proposed design choices, not claims about the brand's actual operations or accounting policy.

## What commerce model would make the dashboard trustworthy across three channels?

### Takeaway

The highest-priority change is to separate **sales, inventory custody, invoices/settlements, and cash received**, and to model stock at variant/location level. Consignment delivery is an inventory movement; a wholesale PO is a commitment; a Shopify order is not automatically cash in the bank. The founder's useful daily question is therefore: **what is due, where is my stock, what can I sell, and which action has evidence behind it?**

### Cited Findings

- Shopify inventory levels connect an inventory item to a location and expose distinct quantity states. A product-level total cannot express whether a particular size is available at the shipping location. [InventoryLevel](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryLevel)
- Shopify distinguishes physical on-hand quantity from available, committed, reserved, damaged, safety-stock, and quality-control quantities; incoming stock is separate. On-hand equals the sum of the six stocked states, so adding on-hand and available double-counts units. [Inventory states](https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/manage-quantities-states)
- Inventory items have stable IDs, SKU data, tracking flags, and nullable unit cost; duplicate SKUs are explicitly represented. Reading unit cost can also depend on the user's product-cost permission. [InventoryItem](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem)
- Shopify describes consignment as the supplier retaining ownership until the consignee sells the stock. Regular stocktakes include off-site locations and discrepancies warrant investigation. [Inventory management](https://help.shopify.com/en/manual/products/inventory/fundamentals/understanding-inventory-management)
- Shopify separates order, fulfillment, financial status, returns, refunds, payment terms, PO number, transactions, outstanding amount, and shop/presentment currencies in its order model. [Order API](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)
- Shopify sales reporting separates net merchandise sales from taxes, shipping, duties, and fees. Its net-sales definition subtracts discounts and sales reversals from gross sales; reversals can arise from cancellations and edits as well as returns/refunds. Sales reporting is therefore not a bank ledger. [Sales reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report)
- Shopify Payments has its own transactions, fees, payouts, timing, and possible payout currency. A payment received for an order and a bank deposit are different milestones. [Shopify Payments payouts](https://help.shopify.com/en/manual/payments/shopify-payments/payouts)

### Inferences

All items in this subsection are **proposed requirements**, informed by the facts above.

**Priority P0: an auditable commerce ledger before extra gamification.** A practical minimal model has stable entities for product, variant, inventory item, location, channel, counterparty, agreement, order/line, inventory movement, invoice/credit, statement, payment/allocation, cost record, and source import. A location can host multiple channels; the same retailer can have wholesale and consignment agreements. Do not treat `STOCKIST` as the commercial agreement type.

| Area | Minimum fields and workflow | Founder decision enabled |
|---|---|---|
| Product and drop | Product ID, variant ID, size/color, SKU alias, collection/drop, retail price, currency, release date, published status | What is ready for a drop? Which sizes are missing? |
| Physical inventory | Item/variant, custodian location, owner, quantity state, movement type, event date, source, receipt/transfer/return references | What is online-sellable versus stored with a stockist? |
| Wholesale | Buyer PO and internal ID, accepted quantities/prices by variant, currency, allocations, shipment dates/quantities, invoiced amounts, credits, due dates, partial payment allocations | Can I fulfill this PO, and what is overdue? |
| Consignment | Agreement version, stock delivered/received, period opening/closing counts, statement ID and covered dates, sold/returned/damaged/missing units, commission basis/rate, authorized deductions, settlement due date, actual payments | Which shop needs a statement, replenishment, collection, or stock return? |
| Cash | Manually confirmed balance or bank source with as-of date; payment and payout IDs; currency; fees; allocation to invoices/statements | How much cash is available, and what receipts are still pending? |
| Cost | Lot or effective date, production/landed unit cost, currency, evidence, estimate flag, optional packaging/shipping/payment fees | Can margin be calculated, and what costs remain unknown? |

**Wholesale lifecycle:** inquiry/quote → accepted PO → reserved stock → partial/full shipment → invoice(s) → partial/full collection → return/credit if applicable. Preserve these milestones separately. Operational order intake uses accepted orders; invoiced sales uses approved invoices/credits; cash uses recorded payments. Exact income recognition and tax treatment require the founder's chosen accounting policy and are outside this operational proposal. Do not compute the wholesale invoice from current retail price times one global discount after the contract has been agreed; preserve the agreed line price.

**Consignment lifecycle:** agreed allocation → dispatched → acknowledged receipt → periodic stockist statement → verified settlement due → received payment. Preserve delivery and statement references. A decrease in a shelf count is a discrepancy until a statement or other sale evidence explains it; it could be sale, return, loss, damage, or transfer. Track units still owned at stockists, age since delivery, last statement coverage, and payment aging separately. An agreement-specific commission is different from a wholesale discount.

**Commercial totals:** show three distinct columns per channel: merchandise activity, amount due to the brand, and cash received. For consignment, retain consumer sales, commission, other deductions, and brand settlement proceeds separately. Do not silently combine consumer retail sales at a consignee with the brand's wholesale sell-in or net remittance amount. Establish an explicit consolidated convention before displaying one combined revenue headline; until then show separate channel rows and a cash total by currency. This avoids making an unstated gross-versus-net accounting decision.

**Inventory ownership/custody:** a transfer from home storage to a consignee reduces home stock and increases consignee stock, while total brand-owned stock stays constant. A completed wholesale transfer may leave brand-owned stock according to the agreed ownership milestone; the retailer's subsequent consumer sell-through is unknown unless supplied by the retailer. Retailer-owned stock should not be offered as brand-owned inventory. Returns require two separately tracked effects: a commercial credit and a physical return/disposition; they can happen on different dates.

**Identity and duplicate prevention:** use stable source IDs, e.g. `(shop, Shopify order ID, line ID)`, and a crosswalk for external PO/invoice/statement IDs. A Shopify record mirroring an external wholesale invoice is one commercial event with two source references, not two sales. A stockist statement payment recorded in Shopify is not a second consumer sale. Deduplicate at the source-event level and then reconcile commercial identity; never rely solely on matching names, amount, or SKU. Suspected matches should remain reviewable exceptions. Imported summaries can reconcile totals but must not be added to their underlying transactions.

**Source-of-truth boundaries:** Shopify owns Shopify product/order/fulfillment/inventory facts only for the records and locations actually maintained there. Agreements and stockist statements own their commercial terms and off-platform reported activity. Bank evidence/manual dated confirmation owns cash balance. The terminal owns goals and clearly attributed manual adjustments. An import must preserve authorized manual records and expose conflicts instead of overwriting them silently. Store provenance per record and per dataset: source, source ID/document reference, event date, `sourceUpdatedAt`, observed/as-of date, `importedAt`, schema version, currency, and completeness window.

**Claude interface:** for the proposed standalone persistent dashboard plus Claude Desktop architecture, both interfaces should read the same durable records and deterministic metric service. Claude Code can maintain adapters, schemas, and evaluations; it should not be required for every daily founder question. Claude should explain retrieved metrics with source links/IDs and as-of times. Every recommendation should provide evidence, a reason, an amount or unit count where supportable, the next step, and uncertainties. Missing terms/costs/history should elicit an explicit unknown. Retailer emails, notes, and imported text are evidence to parse, not instructions to execute. Keep live-account mutation and message sending outside the initial read-only workflow; generating a draft response or proposed stock allocation is independently useful.

### Gaps

- The local handoff describes authenticated Shopify/Meta MCPs and a low order volume, but those are unverified project assumptions, not evidence of connected accounts.
- Need the brand MD plus an example wholesale invoice/PO, consignment agreement/statement, variant inventory export, and cost source to choose the actual operating conventions. The research stage does not require these to be uploaded immediately.
- Unknown: whether stockist sales are currently mirrored in Shopify, whether inventory locations include stockists, which records determine custody/ownership, and how returns/markdowns/commission are negotiated.

## Which Shopify integration capabilities and limits should the design assume?

### Takeaway

Use a versioned GraphQL Admin data adapter with explicit capability checks and a validated import contract; the public storefront cannot supply private operating data. For a standalone persistent dashboard, imports should land in durable shared records queried by both the UI and Claude Desktop. A reliable read-only snapshot/import cycle is a reasonable migration stage. Add event-driven refresh only after reconciliation and idempotency work.

### Cited Findings

- Shopify identifies REST Admin as legacy from 2024-10-01 and directs new integrations to GraphQL Admin. The object documentation observed on 2026-09-26 labels `2026-07` latest. [REST status](https://shopify.dev/docs/api/admin-rest/usage/versioning), [Order reference/version selector](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)
- Order access defaults to orders created within the last 60 days. Approved `read_all_orders` extends historical reach alongside an order scope such as `read_orders`. Read-only operation does not inherently require a write scope. [Access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- Protected customer data access depends on app/distribution type and fields; redaction or GraphQL errors can occur even with HTTP 200. Custom-app rules differ from public-app review rules. [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- GraphQL Admin uses cost-based throttling by app/store and plan. Current published rates are 100 points/second Standard, 200 Advanced, 1,000 Plus, and 2,000 enterprise. Responses expose cost/throttle information. [GraphQL limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits)
- Bulk queries retrieve large datasets asynchronously and offer downloadable results; the submitted operation/status requests consume normal API cost while the executed bulk query is treated separately. [Bulk queries](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/queries)
- Shopify webhooks can be duplicated, arrive out of order, and be missed. Shopify recommends signature verification, delivery-ID deduplication, timestamps for ordering, and periodic reconciliation (including queries filtered by update time). [Webhooks](https://shopify.dev/docs/apps/build/webhooks)
- Analytics via `shopifyqlQuery` requires `read_reports`, Level 2 protected customer data access, and GraphQL Admin version 2025-10 or later. Analytics results are a separate capability from reading individual order records. [ShopifyQL integration requirements](https://shopify.dev/docs/apps/build/shopifyql/graphql-admin-api), [ShopifyQL query reference](https://shopify.dev/docs/api/admin-graphql/latest/queries/shopifyqlquery)
- **Time-sensitive documentation observation, checked 2026-09-26:** B2B is documented for Basic, Grow, Advanced, and Plus. The relevant published plan matrix is summarized below. Actual Tropical Futures account activation/rollout is not verified. [Official B2B plan matrix](https://help.shopify.com/en/manual/b2b/getting-started/plan-features)

| Documented feature group (adapted labels) | Basic | Grow | Advanced | Plus |
|---|---|---|---|---|
| Company records and sites; location permissions | Yes | Yes | Yes | Yes |
| Active catalogs across B2B markets | 3 | 3 | 3 | Unlimited |
| Assign catalog to individual company/site | No | No | No | Yes |
| Purchase quantity constraints and volume pricing | Yes | Yes | Yes | Yes |
| Payment terms, reminders, US ACH, saved cards | Yes | Yes | Yes | Yes |
| Required deposits; installment receipts; collection by shipment | No | No | No | Yes |
| Draft invoicing/checkout, repeat orders, buyer PO reference | Yes | Yes | Yes | Yes |
| Markets-customized checkout/storefront | No | No | Yes | Yes |
| Sales staff access, Trade theme, fast ordering, Flow | Yes | Yes | Yes | Yes |

The same official matrix says non-Plus B2B catalogs require new Shopify Markets. The requirements page additionally describes company setup, current customer accounts, and B2B-with-Markets activation. [B2B prerequisites](https://help.shopify.com/en/manual/b2b/getting-started/considerations)

### Inferences

Proposed implementation order:

1. **Capability manifest:** record verified shop identity, currency/timezone, adapter/tool version, actual scopes, B2B feature availability, returned fields, oldest available order date, and reporting windows. Do not assume a connector exposing orders also exposes sessions, payouts, inventory histories, or B2B.
2. **Read-only snapshot:** pull the exact required objects/fields through the available authorized adapter; cursor-paginate completely; use bulk queries when justified by dataset size. Keep API credentials outside browser localStorage and import files. Run deterministic validation/reconciliation before publishing a new snapshot. Preserve the previous valid snapshot on failure.
3. **Durable local history:** retain raw imports or normalized immutable revisions, import manifest, and operator corrections. A latest-20-orders tape is a presentation view, not sufficient data for 30/90-day metrics or lifetime customer claims. Historical access gaps must remain visible.
4. **Incremental reconciliation:** save an update watermark only after successful completion; overlap the next interval to avoid boundary loss; upsert source IDs; query changed orders/returns rather than only newly created orders. Run periodic full/comparative checks. Re-importing the same snapshot produces no extra sales, inventory, or payments.
5. **Optional webhooks:** if a backend is introduced, validate HMAC, enqueue durably, deduplicate delivery IDs, fetch current resource state where needed, reject stale overwrites, and reconcile independently. A pure frontend does not need a webhook service merely to support a low-frequency manual sync.
6. **Off-platform support:** support evidence-backed CSV/manual wholesale and consignment ledgers even if Shopify B2B is unavailable or unused. A plan-dependent inability to record a partial payment inside Shopify should not prevent the operational dashboard from tracking a documented off-platform partial settlement.

For each feed show `data through`, `last successful sync`, and errors separately. A newly imported month-old statement is newly imported but remains month-old evidence. Different feed cadences deserve different freshness rules: Shopify orders, stockist monthly statements, bank confirmation, and production ETAs are not equally fresh at 72 hours.

### Gaps

- No live API capability probe was authorized or performed in this research assignment. B2B plan documentation can change; recheck during integration and verify account behavior directly.
- Full historical order access, historical inventory evidence, analytics/session access, payment-provider coverage, and Meta attribution are unverified. Missing sessions must display unavailable; if a game animation uses orders as a proxy, label it as orders.
- Reading `unitCost` today does not establish historical landed cost; import dated cost records/lot assignments before presenting historical margin as actual.

## Which metrics, daily actions, and acceptance scenarios should guide improvement experiments?

### Takeaway

Use a small metric dictionary with deterministic formulas and explicit coverage. Optimize founder task success and numerical correctness first; the game score should explain the business, and must not become the quantity the engineering loop learns to inflate.

### Cited Findings

- Shopify's product analytics uses sold units divided by sold units plus ending inventory for its period sell-through measure, and ending inventory divided by average daily sold units for inventory days. Its displayed sell-through window can lag by roughly two days. These definitions are not interchangeable with a drop's lifetime run depletion. [Product analytics](https://help.shopify.com/en/manual/products/analytics)
- Shopify's report convention can include unpaid, pending, and canceled orders in gross sales while recording reversals separately; returns affect their event date. Matching Shopify therefore needs explicit treatment of reversals and date windows. [Sales-report definitions](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report)
- The underlying platform explicitly supports returns, refunds, payment/fulfillment statuses, and outstanding amounts separately. [Order fields](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)

### Inferences

The following metric dictionary is a **proposal**, to validate against brand records. Use one configured brand reporting timezone for daily boundaries (never infer it from this computer's Europe/Berlin setting), store original UTC timestamps, and state whether today is partial. Windows should be half-open `[start, end)` and prior comparisons should use equal completed windows. Preserve decimal monetary precision and currency code; report original and converted amounts separately with FX source/date. Do not add USD and PHP nominal amounts. Transactions, invoices, payments, and statement coverage have distinct dates.

| Metric | Proposed operational definition and limits |
|---|---|
| Net merchandise sales | Sum line sales less discounts and sales reversals, excluding tax, shipping, duties, and fees; apply the agreed channel convention. Keep order intake, invoicing, and actual cash as separate views. |
| Cash received | Successful recorded receipts less actual refunds, by payment date/provider/currency. Bank cash is separately confirmed balance; provider payout is a transfer milestone, not extra sales. |
| Wholesale open balance | Invoice amount due minus approved credits minus allocated payments. Deposits reduce the applicable balance or remain unapplied credit; overpayments are visible, not clamped into revenue. |
| Consignment settlement open | Verified settlement due to brand minus allocated payments. Due includes agreed net sales basis, commission, approved deductions, and documented adjustments; show reported-but-unverified separately. |
| Days overdue | `max(0, asOfLocalDate - dueDate)` for a positive open amount; no due date means unknown, not current. Age balances into current/1–30/31–60/61–90/90+ days. |
| Free stock to promise | Canonical available units at eligible locations less external allocations not already represented in that canonical state. Never subtract committed quantities a second time from Shopify available. |
| Variant velocity | Net sold units / completed days in a declared window and channel. Display raw sold/returned counts and days with stock when available; stockout-suppressed demand is a limitation. |
| Estimated inventory days | Available eligible units / positive daily velocity, labelled estimated. Zero/negative velocity gives insufficient evidence/no recent sales; no fabricated infinity or urgency. Do not treat a one-off wholesale batch as DTC daily demand. |
| Drop unit sell-through | Net completed unit sales from an identified drop/batch / actual received sellable units for that batch. Report transfers, gifts, write-offs, returns and incomplete batch history alongside it; do not reconstruct the run as current stock + lifetime sales. |
| Stockist observed sell-through | Net retailer-reported consumer units sold / opening sellable units plus period receipts for the exact statement scope. Show numerator, denominator, transfers/returns/adjustments, period end, and report completeness. Wholesale sell-in is not retailer sell-through. |
| Stock discrepancy | Observed closing quantity minus expected closing quantity; expected = opening + receipts + customer restocks - reported sales - returns to brand - transfers out - documented write-offs. A mismatch is an exception, not inferred revenue. |
| Merchandise gross margin | `(net merchandise sales - corresponding known COGS) / net merchandise sales` when both are complete and denominator positive. Unknown cost is null. Estimated cost gives estimated margin. State how returned COGS is reversed. |
| Contribution | Net merchandise sales less matching COGS, fees, shipping subsidy, commission and other chosen variable costs. Avoid subtracting consignment commission twice if the chosen top-line is already net proceeds. Label included/excluded costs. |
| Cost coverage | Units with usable dated costs / relevant sold units, plus revenue share covered; show `margin unavailable` for incomplete total scope, or a clearly labelled known-cost subset. |
| DTC AOV | Merchandise value at purchase after discounts / distinct eligible DTC purchase orders in the same cohort. Show post-return cohort value separately; do not divide today's reversal-heavy net sales by today's unrelated orders. Keep wholesale PO size separate. |
| Cash outlook | Opening confirmed cash plus dated expected collections/payouts minus committed and assumed dated outflows. Base/downside/upside scenarios expose assumptions. No forecast receipt becomes actual cash until verified. |

**Priority P1: daily founder view.** Lead with confirmed cash/as-of, open wholesale/consignment balances, stock available by key size, and drop/production commitments. Then show at most three evidence-backed actions. Rank by deterministic urgency class and due date, with verified amount at stake as a secondary sort rather than a fabricated ROI estimate. Suggested classes: overdue money; order/PO fulfillment risk; missing stockist report/count; critical-size allocation conflict; upcoming committed production payment; a reviewed merchandising experiment. Keep stale-data repair as an action if it prevents a decision. Each action has evidence, owner, due date, next step, and a drill-through; completing an action doesn't alter commercial facts.

Example prompts supported by this model: “What needs my attention today?”, “Which stockists owe me money?”, “Can I accept this size run without compromising online stock?”, “What evidence supports reprinting this tee?”, “What changed since the last valid sync?”, and “What can we confidently say about this drop after returns?” Claude should be able to answer from the same metric outputs visible in the dashboard.

**Priority P2: improvement/experiment loop.** Use versioned, frozen synthetic scenarios plus a holdout set. Score exact amount/quantity correctness, relevant action selection, provenance coverage, missing-data honesty, and time to answer representative founder questions. Apply correctness gates before UX scores; a faster screen with wrong receivables fails. Log hypothesis, changed files/settings, dataset version, result, regression, and keep/revert decision. Keep evaluator formulas separate from proposed UI changes. Business experiments (creative, stock placement, reorder) require budget/time caps and success criteria; low volumes should not produce claims of causal lift or reliable significance. Operational experiments can start with locating overdue balances faster or reducing inventory discrepancies, which are measurable without large traffic samples.

**Eight proposed acceptance scenarios (synthetic, no claim about real Tropical Futures data):**

1. **Duplicate source/import:** a $600 wholesale invoice is also represented by a Shopify order. The crosswalk identifies one commercial sale. Import the same files twice and replay the same webhook; sales remain $600, one invoice exists, and payments are counted once. An ambiguous match is flagged rather than silently merged.
2. **Consignment custody:** ship 20 medium tees from home to Shop A. Brand-owned total remains 20; home availability falls by 20; Shop A custody rises by 20. Neither sales nor receivables nor cash increases because of the delivery alone.
3. **Statement and partial settlement:** those 20 tees generate 8 documented sales and 1 sale return restocked at Shop A, each at $50 before tax. Closing stock is 13 and net consumer sales $350. Under a 30% commission with no other deductions, commission is $105, brand settlement due $245; receipt of $100 leaves $145 open. Dashboard identifies $350 consumer sales and $245 brand proceeds distinctly. Missing or late statement flags coverage instead of inventing sales.
4. **Wholesale partial fulfillment/payment:** accepted PO for 24 tees at $30 totals $720 before tax. $180 deposit is received; only 18 units are shipped/invoiced at $540 and deposit is allocated to that invoice. Invoice open amount is $360; six units/$180 remain unshipped order commitment. Cash is $180. Invoice balance plus unshipped commitment is not labelled one overdue invoice.
5. **Late refund and separate physical return:** a $100 purchase last month has a $40 documented merchandise reversal/refund this month. Event-date sales reports show the $40 reversal this month; purchase-cohort reporting adjusts last month's order lifetime value. Only a separate accepted/restock event increases sellable stock. No double-subtraction from current order totals plus an already-applied refund event.
6. **Critical size hidden by total:** a tee has 40 units overall but zero medium available online, eight medium units at a consignee, and wholesale reservations elsewhere. The dashboard surfaces medium availability risk and a reviewable relocation option; it does not label all 40 as available to fulfill the online order or automatically move stock.
7. **Currency and unknown costs:** a USD order and PHP statement remain separate until an explicit FX convention is supplied. A missing cost stays null, keeps total margin unavailable, and lowers cost coverage; it never becomes zero COGS or 100% profit. An entered estimate is visibly estimated and cannot pass an actual-margin assertion.
8. **Freshness/order of updates/missingness:** a refund arrives before an older order-update webhook; the older update cannot resurrect revenue. A failed/truncated sync retains the prior valid snapshot with an error. Importing a month-old stockist report today leaves its coverage date old. A store with no analytics permission displays sessions as unavailable; estimated traffic cannot be called synced sessions. A file import only updates the import timestamp, never invents a completed API sync. “What should I do today?” prioritizes overdue evidence-backed tasks and data repair, and cites the records behind both. Claude Desktop and the dashboard must give the same totals and status for the same record version.

### Gaps

- Thresholds for slow-moving stock, key sizes, stale stockist reports, minimum cash, action urgency, and reorder desirability need founder preferences and actual lead times. No generic industry benchmark is asserted here.
- The current PRD's composite rating and single gross-margin/wholesale-cut assumptions may be useful placeholders but should not become the evaluator's objective before the ledger is correct. This recommendation is conceptual; a separate agent is auditing code.
- Unknown actual traffic/transaction volume means no defensible A/B-test sample size, growth projection, paid-media profitability estimate, or reorder quantity can be set from public brand research alone.
