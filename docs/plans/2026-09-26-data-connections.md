# Banking, Instagram and website inputs

Updated 26 September 2026. These extend the [dashboard direction](2026-09-26-brand-aligned-dashboard.md). Integration specifications below are proposed; no live bank, Instagram or website-analytics data has been collected in this task.

## Connection state

| Input | Intended source | Verified state |
|---|---|---|
| Business banking | Era Context MCP | User confirmed TFI business bank accounts are already connected in ERA on 26 September. No callable ERA MCP connection is available in this task; selected account IDs, scopes and returned coverage remain unverified. |
| Instagram | Authorized Insights for `@tropicalfutures` | Recurring check created; collection awaits authorized access. Windsor.ai was suggested, not installed or connected. |
| Search performance | Google Search Console for `tropicalfutures.shop` | Proposed source; ownership/property access not verified. |
| Website behavior | GA4 for the store, if configured | Proposed source; property and ecommerce-event coverage not verified. |

## ERA banking

Use Era Context's documented read operations for account balances, transactions, recurring charges, categories and cash-flow summaries. Its official Streamable HTTP endpoint is `https://context.era.app/mcp`, with OAuth authorization. The server also has write-capable tools; this dashboard needs read access, not account changes, transfers or transaction recategorization. Available tools depend on account, plan and granted scopes. [Era documentation](https://era.app/help/mcp-server-era-context/)

Scope the future adapter to explicitly selected TFI business accounts. Preserve account IDs, currency, balance type when supplied, balance-as-of time, transaction IDs, posted/pending status and source coverage. Do not combine personal finances merely because ERA exposes them. Internal transfers and owner contributions are not merchandise sales. Reconcile a Shopify payout or stockist payment against the existing commercial record; bank arrival supplies cash evidence, not a second sale. Distinguish pending from settled transactions and do not silently treat credit balances as spendable cash. No bank connection or permission changes were made here.

## Instagram check every three days

Created the active recurring task **Tropical Futures Instagram stats**, ID `tropical-futures-instagram-stats`, attached to this Codex task, every 72 hours. It is a scheduled return to this task; a subagent can assist with bounded analysis. It has not been installed in Claude. Local scheduled work needs the computer on and desktop app running. [Scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app)

The collector verifies account ID and `tropicalfutures` handle. It seeks follower-count snapshots plus available account/media reach, views, interactions, likes, comments, saves, shares, profile activity and website-link activity. These are desired fields, not a guarantee every metric is available. Full API Insights need an authorized professional account and appropriate connector permissions; exact coverage must be discovered from the connected source. Public counts, if directly accessible, are a separate limited dataset. [Meta's official Instagram collection](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00)

Each record preserves source/account/media IDs, metric name and definition, measurement window, timezone, capture time, organic/paid scope when known, and provisional/missing status. Store cumulative media snapshots separately from period totals. A difference between two snapshots is not necessarily activity within precisely three days. Do not sum overlapping unique reach or equate clicks/engagement with sales. Refresh recent windows when supported, retaining revision provenance.

Output location: `data/instagram/` in this workspace. The first successful collection establishes a baseline; later runs save timestamped snapshots and a latest summary. Failed or inaccessible runs record status without replacing the last good data. The initial state records that access is required; it contains no invented metrics. Notify on the first baseline, meaningful actionable changes, new failures or required user action; stay quiet for unchanged/non-actionable runs and repeated unchanged access blockers. The dashboard adapter that will consume these snapshots remains to be implemented.

The monitor reads analytics only. It does not post, send messages, follow accounts, change ads, collect bank data or start an SEO monitoring job.

## Website search and behavior

Search Console supplies search clicks, impressions, CTR and average position by supported dimensions such as query, page, country and device. Newest data may be preliminary. Track branded and non-branded query groups through an explicit maintained definition. Preserve property, search type, dimensions, dates and data state; do not promise complete query detail where the source omits it. [Search Console documentation](https://support.google.com/webmasters/answer/7576553?hl=en)

GA4 adds organic sessions, engagement, configured key events and tracked ecommerce revenue. Verify collection and purchase-event setup before using conversion figures. Search-result clicks and website sessions are different measurements, so do not force them to match. GA4-attributed revenue provides a marketing view; Shopify remains the commerce record used for order reconciliation. [Google's combined measurement guidance](https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console)

A public site crawl can later assess page titles, descriptions, canonical links, indexability signals, broken links and structured data. It cannot substitute for verified search performance or private traffic data. SEO has been added as a dashboard input; no separate recurring SEO schedule has been created.

## Remaining setup

TFI business accounts are already connected in ERA, as confirmed by the user; the remaining banking step is client authorization to ERA MCP and selection/verification of the business accounts for this dashboard. Install and authorize an analytics connector, such as Windsor.ai, for the correct Instagram account and optionally Search Console/GA4 properties. Prefer an existing suitable service if the user has one. Once access exists, perform a read-only collection, verify returned IDs/metric coverage, establish the baseline and then implement the dashboard adapters. Do not mark an MCP connection ready based only on an upstream bank connection, plugin availability or successful scheduler creation.
