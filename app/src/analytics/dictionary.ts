// ── Metric dictionary ─────────────────────────────────────────────────────
// One entry per metric the dashboard shows. docs/metrics.md is generated from
// this (scripts/metrics-doc.ts) and a test keeps the two in sync.

export interface MetricDef {
  id: string;
  name: string;
  formula: string;
  requires: string;
  eligible: string;
  timeBasis: string;
  refunds: string;
  currency: string;
  exclusions: string;
  limitations: string;
  status: 'implemented' | 'unavailable';
}

const SHOPIFY_CURRENCY = 'Shop reporting currency (USD) from Shopify, in integer cents. Never summed across currencies without a dated rate.';

export const METRICS: MetricDef[] = [
  {
    id: 'net-product-revenue', name: 'Net product revenue', status: 'implemented',
    formula: 'gross merchandise sales − allocated discounts − merchandise returns (Shopify net_sales, summed per day and channel).',
    requires: 'ShopifyQL sales: gross_sales, discounts, returns, net_sales by day and sales_channel.',
    eligible: 'All orders on all channels (filterable by channel group); $0 free-gift orders count with $0.',
    timeBasis: 'Sale on the order date; a return on the date it was recorded (business timezone). Complete days only.',
    refunds: 'Returns are subtracted on their own date, so a refund of an older order lowers the period it happens in (kept, not dropped). Shopify values are already net — nothing is subtracted twice.',
    currency: SHOPIFY_CURRENCY,
    exclusions: 'Shipping charges, taxes, duties, tips and gift-card sales.',
    limitations: 'A day with no row inside the extract\'s coverage had no sales; days outside coverage are unknown and make the metric partial.',
  },
  {
    id: 'gross-profit', name: 'Gross profit', status: 'implemented',
    formula: 'net revenue on lines with a recorded cost − cost of goods sold of those lines (Shopify net_sales_with_cost_recorded − cost_of_goods_sold).',
    requires: 'ShopifyQL: cost_of_goods_sold, net_sales_with_cost_recorded.',
    eligible: 'Same records as net product revenue.',
    timeBasis: 'As net product revenue. COGS uses the unit cost recorded on the order line (historical), not today\'s cost.',
    refunds: 'Shopify reverses cost on returned lines on the return date (negative COGS). Whether a refund restored stock is not checked per refund.',
    currency: SHOPIFY_CURRENCY,
    exclusions: 'Revenue from lines without a recorded cost is excluded; the metric is then labelled partial with its cost coverage.',
    limitations: 'Gross, not net, profit: no fees, shipping, payroll or ads. Fully discounted orders (e.g. draft orders at 100% off) carry cost with $0 revenue and lower profit.',
  },
  {
    id: 'gross-margin', name: 'Gross margin', status: 'implemented',
    formula: 'gross profit ÷ net revenue with recorded cost × 100, from summed values (never an average of product percentages).',
    requires: 'Gross profit and net_sales_with_cost_recorded.',
    eligible: 'Lines with a recorded cost.',
    timeBasis: 'As gross profit. Comparisons are in percentage points.',
    refunds: 'As gross profit.',
    currency: 'Ratio; inputs in one currency.',
    exclusions: 'Revenue without recorded cost (shown as cost coverage).',
    limitations: 'Unavailable when that revenue is zero or negative.',
  },
  {
    id: 'aov', name: 'AOV at purchase', status: 'implemented',
    formula: '(gross merchandise sales + discounts) on orders placed in the period ÷ orders placed in the period.',
    requires: 'ShopifyQL: gross_sales, discounts, orders.',
    eligible: 'Every order Shopify counts, including $0 free-gift orders (daily aggregates can\'t exclude them per order).',
    timeBasis: 'Order date.',
    refunds: 'Later refunds are excluded — this is the basket at checkout.',
    currency: SHOPIFY_CURRENCY,
    exclusions: 'Shipping, tax, gift cards.',
    limitations: '$0 gift orders pull the average down; noted on screen.',
  },
  {
    id: 'units-per-order', name: 'Units per order at purchase', status: 'implemented',
    formula: 'merchandise units ordered ÷ orders placed (same orders as AOV).',
    requires: 'ShopifyQL: quantity_ordered, orders.',
    eligible: 'As AOV.', timeBasis: 'Order date.', refunds: 'Excluded.', currency: '—',
    exclusions: 'Returned units (they belong to the return date).',
    limitations: 'No bundles exist in the catalog today; a bundle line would count as one unit as Shopify reports it.',
  },
  {
    id: 'units-sold', name: 'Net units sold', status: 'implemented',
    formula: 'units ordered + units returned (returns negative), per variant, from ShopifyQL net_items_sold.',
    requires: 'ShopifyQL by day × channel × product_id × product_variant_id.',
    eligible: 'All channels; joined to the catalog by stable variant id, never by name or SKU.',
    timeBasis: 'Order date for units sold; return date for units returned.',
    refunds: 'Returned units subtract on the return date.', currency: '—',
    exclusions: 'None. Variants sold but no longer in the active catalog stay visible as "not in active catalog".',
    limitations: 'Fulfilment is not checked: an order counts when placed, not when shipped.',
  },
  {
    id: 'inventory', name: 'Inventory position', status: 'implemented',
    formula: 'per variant, summed across locations: available, on hand, committed, incoming, unavailable (damaged + safety stock + QC).',
    requires: 'Admin GraphQL inventoryLevels.quantities for every location.',
    eligible: 'Active products; bundle parents are excluded from stock totals (their stock lives in components).',
    timeBasis: 'A single snapshot at the stated read time — not historical stock for past periods.',
    refunds: '—', currency: '—',
    exclusions: 'Incoming stock is shown separately and never added to available. Committed is already excluded from available and is not subtracted again.',
    limitations: 'Negative available means oversold; shown as 0 sellable plus "oversold by N".',
  },
  {
    id: 'weeks-of-cover', name: 'Weeks of cover (estimate)', status: 'implemented',
    formula: 'sellable units ÷ (net units sold in the last 28 complete days before the inventory read ÷ 4).',
    requires: 'Inventory snapshot and variant-day sales for the 28-day window.',
    eligible: 'Tracked variants with sellable stock; demand from all channels, because all channels share the same stock pool.',
    timeBasis: '28 complete days ending the day before the inventory read (business timezone). Configurable in code.',
    refunds: 'Net of returns in the window.', currency: '—',
    exclusions: 'Zero velocity → "No recent sales", never infinity. Out of stock → "Out of stock".',
    limitations: 'Observed sales, not unconstrained demand. Flags: short history (published within the window) and stock-outs that cap sales. No lead times or safety stock are supplied, so low-cover alerts use a heuristic threshold (4 weeks).',
  },
  {
    id: 'returning-share', name: 'Returning-customer share (DTC)', status: 'implemented',
    formula: 'Online Store customers ordering in the period who ordered before it began ÷ Online Store customers ordering in the period.',
    requires: 'ShopifyQL customers and returning_customers for exactly that period (unique counts can\'t be summed across days).',
    eligible: 'Identified Shopify customers on the Online Store channel.',
    timeBasis: 'Order date; "before" uses the store\'s full Shopify history.',
    refunds: 'Not affected.', currency: '—',
    exclusions: 'Wholesale accounts and unmapped channels.',
    limitations: 'Always partial: Shopify doesn\'t report identity coverage, and purchases from before the store\'s Shopify records are unknown. Only extracted periods are available.',
  },
  {
    id: 'returns-value', name: 'Returns (refund value)', status: 'implemented',
    formula: 'Shopify returns for the period (merchandise refunded, dated on the return).',
    requires: 'ShopifyQL returns.', eligible: 'All channels.', timeBasis: 'Return date.',
    refunds: 'This is the refund value itself.', currency: SHOPIFY_CURRENCY, exclusions: 'Shipping and tax refunds.',
    limitations: 'A value measure — not a return rate.',
  },
  {
    id: 'drop-sell-through', name: 'Cumulative drop sell-through', status: 'unavailable',
    formula: 'net fulfilled units attributable to the drop ÷ externally received units attributable to the drop, through the same cutoff.',
    requires: 'A drop → product mapping, received units per drop (receipt records), and fulfilled units per product since launch.',
    eligible: '—', timeBasis: 'Cumulative from the drop\'s launch date to a stated cutoff.',
    refunds: 'Returned units would reduce net fulfilled units.', currency: '—',
    exclusions: 'Transfers, return restocks and unfulfilled preorders are not receipts or sales.',
    limitations: 'Unavailable: no drop mapping or receipt history exists in any connected source, and it is not reconstructed from current stock. "Published" dates are shown instead of launch dates and are not drop launches.',
  },
  {
    id: 'return-rate', name: 'Return rate', status: 'unavailable',
    formula: 'physically returned units linked to an eligible fulfilled-sales cohort ÷ fulfilled units in that cohort.',
    requires: 'Returns linked to the orders/fulfilments they came from, with return dates.',
    eligible: '—', timeBasis: 'Sales cohort with an observation cutoff.', refunds: '—', currency: '—', exclusions: '—',
    limitations: 'Unavailable: Shopify analytics reports returns by return date only. "Returns (refund value)" is shown as a separate, differently named metric.',
  },
  {
    id: 'wholesale', name: 'Wholesale (ordered / invoiced / fulfilled / paid)', status: 'unavailable',
    formula: 'Separate measures per stage; combined with DTC only on a documented, comparable basis.',
    requires: 'Wholesale orders/invoices/payments with stable ids (and the Shopify order name when also entered in Shopify, for de-duplication).',
    eligible: '—', timeBasis: 'Per stage date.', refunds: '—', currency: 'Per record; no FX assumed.',
    exclusions: 'Rows already counted in Shopify are excluded (see dedupeWholesale).',
    limitations: 'Unavailable: no wholesale records are connected. Shopify draft orders stay unmapped rather than assumed wholesale.',
  },
];

export const CHANNEL_NOTE = 'Channel groups: Online Store and Facebook & Instagram → DTC. Every other Shopify channel (today: Draft Orders, Shopify Claude Connector App) is UNMAPPED and stays visible in totals until the owner maps it.';

export function metricsMarkdown(): string {
  const lines = [
    '# Metric dictionary',
    '',
    'Generated from `app/src/analytics/dictionary.ts` by `npx vite-node scripts/metrics-doc.ts` — edit the source, not this file. A unit test fails if they drift.',
    '',
    `${CHANNEL_NOTE}`,
    '',
    'Comparisons: absolute change for money and units; percentage-point change for percentages; standard growth % only when the prior value is positive.',
    '',
  ];
  for (const m of METRICS) {
    lines.push(`## ${m.name}${m.status === 'unavailable' ? ' — unavailable' : ''}`, '');
    for (const [k, v] of [
      ['Formula', m.formula], ['Requires', m.requires], ['Eligible records', m.eligible], ['Time basis', m.timeBasis],
      ['Refunds', m.refunds], ['Currency', m.currency], ['Exclusions', m.exclusions], ['Limitations', m.limitations],
    ] as const) lines.push(`- **${k}:** ${v}`);
    lines.push('');
  }
  return lines.join('\n');
}
