# Shopify sync

Status, 13 October 2026: first sync run and imported in a test browser. The connection is **read-only, through the Shopify MCP in a Claude session**; the dashboard itself holds no Shopify credentials. No store data was changed.

## What was verified

| Check | Result |
|---|---|
| Shop identity | Tropical Futures · tropicalfutures.shop (tropicalfutures.myshopify.com) · Basic plan |
| Currency / timezone | USD · EDT (America/New_York) — from Shopify, so the open currency/timezone question is answered |
| Products | 37 active, with per-variant stock and unit costs (Admin GraphQL) |
| Orders | Latest 25 with line items (Admin GraphQL). No customer names or contact details are extracted. |
| Daily sales | 60 days of orders and net sales (ShopifyQL) |
| Sessions | 60 days, daily (ShopifyQL) — so conversion is measured, not estimated |
| Units sold by product | 365 days, last 7 days, previous 7 days (ShopifyQL) |
| Sales channels | 12 months and 30 days (ShopifyQL) |
| Repeat customers | 90-day returning-customer rate (ShopifyQL) |

Not available from Shopify: ad spend (Meta), bank cash (ERA), stockist/consignment stock, invoices and statements, production pipeline. Those stay empty or "not connected", never zero-filled.

## How a sync works

1. **Extract (Claude session with the Shopify connector).** Run the queries below read-only and save the results as `data/private/shopify-extract-YYYY-MM-DD.json` in the `ShopifyExtract` shape (`app/src/game/shopify.ts`). `data/private/` is gitignored — real business data never goes into the repo.
2. **Build.** From `app/`:
   ```bash
   npx vite-node scripts/shopify-snapshot.ts ../data/private/shopify-extract-YYYY-MM-DD.json ../data/private/park-data-YYYY-MM-DD.json
   ```
   The converter (`buildShopifySnapshot`, tested in `src/game/__tests__/shopify.test.ts`) checks that each product's variant stock adds up to Shopify's own total (catches copying mistakes), refuses non-USD shops, validates the result against the full import schema, and prints its data notes.
3. **Import.** Open the dashboard → IMPORT → paste the file contents. Bank balance, costs and planning inputs you've entered are kept: the file deliberately omits them.

To repeat it, open a Claude Code session on this repo with the Shopify connector enabled and say: *"Run the Shopify sync in docs/data/shopify-sync.md."*

### Queries

ShopifyQL (`run-analytics-query`):

```
FROM sales SHOW orders, gross_sales, net_sales, sales_reversals TIMESERIES day SINCE -60d UNTIL today
FROM sessions SHOW sessions TIMESERIES day SINCE -60d UNTIL today
FROM sales SHOW net_items_sold, net_sales GROUP BY product_title SINCE -365d UNTIL today ORDER BY net_items_sold DESC
FROM sales SHOW net_items_sold GROUP BY product_title SINCE -7d UNTIL today
FROM sales SHOW net_items_sold GROUP BY product_title SINCE -14d UNTIL -8d
FROM sales SHOW orders, net_sales GROUP BY sales_channel SINCE -30d UNTIL today
FROM sales SHOW customers, returning_customers, returning_customer_rate SINCE -90d UNTIL today
```

Admin GraphQL (`graphql_query`, validated first):

```graphql
query Products($after: String) { products(first: 50, after: $after, query: "status:active") { pageInfo { hasNextPage endCursor } nodes { id title productType tracksInventory totalInventory variants(first: 20) { nodes { title inventoryQuantity price inventoryItem { tracked unitCost { amount currencyCode } } } } } } }

query Orders { orders(first: 25, sortKey: CREATED_AT, reverse: true) { nodes { name createdAt displayFinancialStatus cancelledAt currentTotalPriceSet { shopMoney { amount currencyCode } } customer { numberOfOrders } channelInformation { channelDefinition { channelName } } lineItems(first: 5) { nodes { title variantTitle quantity } } } } }
```

## Definitions

- **Revenue** = Shopify net sales: after discounts and returns, before shipping and tax.
- **Units sold** (product) = Shopify net items sold, last 365 days. "Start" stock = units sold + current stock.
- **Stock** = sum of variant quantities, with negative quantities counted as 0 (and listed in the data notes).
- **Unit cost** = Shopify inventory-item cost; if any variant lacks one, the product's cost is unknown and it's left out of cost totals.
- **Gross margin** = list-price estimate: (price − unit cost) weighted by 365-day units, over products with a known cost. Before discounts, fees and shipping.
- **Repeat rate** = Shopify returning-customer rate, last 90 days.

## Findings from the first sync (13 Oct 2026)

These are in the snapshot's data notes; repeated here for the record.

- 5 products show **negative stock** (sold while untracked or oversold).
- 5 products have **no unit cost**; two Goodfight tees have a **$75 cost on a $37.50 price** — likely an entry error.
- Order **#2025-2044**: 10 Hopecore Jerseys for $10.54 — looks like wholesale, consignment or a gift recorded in Shopify. It counts toward units sold until that channel has its own records (the brief's double-counting risk).
- One recent order came through a **"Shopify Claude Connector App"** channel ($95, 13 Oct). Nothing in this work created orders — all access here was read-only.
- Over the last 12 months: ~$9.1K gross / ~$5.3K net sales; the last 30 days: 9 orders, $518 net, 1,199 sessions (0.8% conversion).

## Next steps

- A live, scheduled sync needs a server-side Shopify Admin API token (a custom app with read-only scopes: `read_products`, `read_inventory`, `read_orders`, `read_reports`) stored as a Railway variable, plus server-side storage. Until then, syncs are run on demand in a Claude session.
- Set restock policies (LIMITED / REPLENISH) for products — Shopify has no such field; the 13 sold-out products currently ask "restock or retire?".
