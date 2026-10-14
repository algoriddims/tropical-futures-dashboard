# Analytics data contract

Status, 14 Oct 2026. Source: Shopify only, read-only through the Shopify connector. Built by `app/scripts/shopify-snapshot.ts <raw-dir>` into the snapshot's `analytics` block (`app/src/analytics/types.ts`, validated by `app/src/analytics/schema.ts`). Definitions: [docs/metrics.md](../metrics.md).

## Layers

source extracts (`data/private/raw-*/`, gitignored) → `shopifyAdapter.ts` (parse, normalize, de-duplicate, coverage) → `schema.ts` (validation on import) → `metrics.ts` (pure functions) → desks (format only).

## Records

| Record | Grain | Stable key | Timestamps | Money | Source query |
|---|---|---|---|---|---|
| `daily` | day × sales channel | `date + channel` | day in business tz; sale on order date, return on return date | integer cents | ShopifyQL `FROM sales … GROUP BY sales_channel TIMESERIES day` (via Admin `shopifyqlQuery`) |
| `variantDaily` | day × channel × variant | `date + channel + variantId` | as above | integer cents | same, `GROUP BY sales_channel, product_id, product_variant_id` |
| `variants` | variant | `variantId` (numeric Shopify id); `productId` | product created/published ISO | price/cost in cents | Admin GraphQL `productVariants` (status active) |
| `variants[].inventory` | variant × location | `variantId + locationId` | one read, `inventoryAsOf` | — | `inventoryLevels.quantities` (available, on_hand, committed, incoming, reserved, damaged, safety_stock, quality_control) |
| `customers` | period × channel | `from + to + channel` | order date | — | ShopifyQL `customers, returning_customers` per exact period |

Joins use variant and product ids only. Titles and SKUs are labels: 50 of 136 variants have no SKU, and titles are not keys.

## Coverage and missing data

- `salesCoverage` is the requested range (12 months to the last complete day). ShopifyQL returns a row for every day; a day with no channel had no sales. Days it did not return are listed in `missing` and are unknown, not zero.
- Inventory is a single read. It is never shown as stock for a past period.
- A blank COGS means no cost was recorded, which is not the same as zero. `netSalesWithCost` gives cost coverage.

## Duplicates and repeated imports

- A snapshot replaces the previous one; it is never appended, so re-importing can't double count.
- Inside a snapshot, identical duplicate rows (for example, overlapping pages) are dropped with a note. Two different rows for the same key are refused.
- The validation schema rejects duplicate keys.
- Wholesale rows (none connected yet) would be de-duplicated against Shopify order names and their own ids (`dedupeWholesale`).

## Channels

`app/src/analytics/channels.ts`:

- **DTC:** Online Store, Facebook & Instagram.
- **Unmapped and visible:** everything else. So far that is Draft Orders and Shopify Claude Connector App.

## Currency and timezone

- **Currency:** USD, from the shop. The adapter refuses a unit cost in another currency, and money helpers refuse to add mixed currencies without a dated rate.
- **Timezone:** Shopify reports "EDT", which is mapped to `America/New_York`. An unmappable value becomes `timezone: null`, a configuration gap that makes periods unavailable.

## Known gaps

| Missing | Effect |
|---|---|
| Drop → product mapping; received units per drop | Cumulative drop sell-through is unavailable. |
| Returns linked to their sales cohort | Return rate is unavailable; refund value is shown instead. |
| Wholesale orders, invoices and payments | Wholesale side is unavailable. |
| Lead times, safety stock, restock policy for real products | Low-cover alerts are heuristic, and there are no reorder recommendations. |
| Identity coverage | Returning share is partial. |
| One day (20 Nov 2025) of variant rows not matching channel totals | Probably a custom line item. Totals use channel figures, and this is noted. |
