# ERA (bank + card) sync

Status, 13 October 2026: first sync run and imported in a test browser, merged with the Shopify snapshot. Read-only, through the ERA MCP in a Claude session; the dashboard holds no bank credentials. Nothing in ERA was changed (no categories, tags, rules or visibility).

## Scope — owner-approved accounts only

The owner chose these on 13 Oct 2026; the converter refuses anything else (`allowedAccounts`):

| Account | Use |
|---|---|
| TROPICAL CHECKING ••9318 | business cash |
| TROPICAL SAVINGS ••2216 | business cash |
| Business card ••2670 (listed in ERA under the owner's name) | business spending |

ERA also shows personal checking, personal cards and brokerage accounts. They are never extracted, stored or shown. (Listing accounts to choose from is the only time they were seen.)

## How a sync works

1. **Extract (Claude session with ERA):** `accounts__check_account_balance` for each approved account, `transactions__list_transactions` per account (all pages), and `insights__get_cash_flow` per account by month for the checksum. Save as `data/private/era-extract-YYYY-MM-DD.json` in the `EraExtract` shape (`app/src/game/era.ts`). `data/private/` is gitignored.
2. **Build together with Shopify** (from `app/`):
   ```bash
   npx vite-node scripts/shopify-snapshot.ts ../data/private/shopify-extract-DATE.json ../data/private/park-data-DATE.json ../data/private/era-extract-DATE.json
   ```
   The converter checks every account-month of copied spending against ERA's own monthly totals (to the cent) and refuses unapproved accounts.
3. **Upload** the resulting file in the dashboard (IMPORT → UPLOAD on the hosted site, shared with every device).

To repeat it, say in a Claude session on this repo with ERA and Shopify connected: *"Run the Shopify and ERA syncs in docs/data/."*

## Definitions

- **Bank balance** = checking + savings, as reported by the bank via ERA (with its as-of time). When accounts are synced this replaces the manual bank entry. The card balance is shown separately as **owed**, never netted silently.
- **Cash flow** is our own classification, not ERA's categories (ERA files Shopify payouts as "Shopping and gear", so its cash-flow tool reports $0 income):
  - *In:* Shopify payouts, PayPal transfers, transfers from the owner, other.
  - *Spending:* production & suppliers (Peachy Print, Alipay, supplier wires), shipping & customs (Qwik Pack and Ship, UPS/DelBros), ads (Meta/Facebook billing), software & subscriptions, Zelle payments, bank fees, other.
  - Moves between the approved accounts (card payments, savings sweeps) are excluded, so card spending counts once — when charged.
  - Rules live in `RULES` in `era.ts`; anything unmatched is listed in the data notes as Other.
- **Monthly burn** = your cost lines if you've entered any; otherwise the average actual spending of the last 3 complete months (labelled as such). Never zero by default.
- **Runway** is 0 ("OVERDRAWN") when synced cash is negative.

## Findings from the first sync (1 May – 13 Oct 2026)

- Checking ••9318 is **overdrawn (−$136.27)**; savings $41.00; the card owes **$1,431.18** (of $15,000). Cash on hand: **−$95.27**.
- **$102 of overdraft fees** in Sept–Oct (three × $34), plus a $95 card annual fee in May.
- Spending by month: May $1,564 · Jun $2,670 · Jul $2,160 · Aug $2,594 · Sep $1,158 · Oct (to 13th) $522. 3-month average (Jul–Sep): **$1,971**.
- Cash in by month: May $1,155 · Jun $910 · Jul $3,214 · Aug $819 · Sep $247 · Oct $344.
- **Transfers from the owner** with partner/design memos — "eastern margins design" $672.87, "dsm sales" $871.62, "shrub june sales" $74.83, "phase space" $163.90, "magenta house 1h sales" $914.55. These look like wholesale/consignment/design income routed through a personal account. They're shown as *from owner*, not as sales, until those partners have their own records.
- Largest spend lines: Peachy Print (production) $1,888 in June; Meta/Facebook billing $203–$890 a month; Qwik Pack and Ship most months; ~$300–$800/month of software and subscriptions.
- Unclassified (shown as Other): Sikand Media, Renato Aramburu, Ren Stocks.

## Limits

- Snapshot, not live: balances are as of the bank's last report to ERA.
- Classification is rule-based; check the Other line and tell Claude about new vendors.
- Card spending is counted when charged, so a month's spending is not the same as the cash that left checking that month.
