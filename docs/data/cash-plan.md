# Cash plan (Money desk)

The one cash forecast, in `app/src/game/cashPlan.ts` (tests in `app/src/game/__tests__/cashPlan.test.ts`). It replaced two answers that disagreed:

- "Runway = net cash ÷ burn", which assumed no money comes in.
- A forecast that counted the last 30 days of Shopify sales as income. That figure was before fees and came from a one-product spike. The same forecast also counted production twice: once in the spending average and again as runs due.

## Basis

- **Start:** cash net of the card, on the day the bank balances were read. The first forecast month is the rest of that month, prorated.
- **Basis months:** the last 3 complete synced months.
- **Money in, three cases**, all counting money that reached the business accounts:
  - **Payouts only:** the average of Shopify + PayPal payouts in the basis months.
  - **Plus tagged money:** the same, plus deposits tagged as stockist or client money in the basis months, averaged.
  - **Recent sales pace:** the last 30 days of Shopify net sales, times the share of sales that reached the bank as payouts in the basis months, plus tagged money. If the analytics block is missing, the sales are used as they are and labelled "before fees".
  - Untagged deposits are never counted. They are shown as "not counted".
- **Money out:**
  - **Running costs:** the average bank + card spending in the basis months, without the PRODUCTION category. If the owner has entered any recurring cost lines, those are used instead.
  - **Production:** each unpaid production-run cost is taken out in its due month. Undated or overdue costs are taken out now. One-off cost lines are also taken out now.
  - Production the owner hasn't recorded as a run is not in the forecast.
- Arriving stock isn't turned into extra sales. The sales cases already say how much comes in.

## Verdict (`cashVerdict`)

The verdict always comes from the cautious case, payouts only. It never calls the business "self-funding" on the strength of a sales spike.

| Tone | When | Example title |
|---|---|---|
| Red | Cash is short now, or it runs out within 6 months | "At payouts only, cash runs out in <month>" |
| Amber | It falls each month, or its low point is under one month of running costs | "At payouts only, cash falls about $X a month" |
| Green | Otherwise | — |

The Money desk tiles, the Alerts page, the Planning insight, the Overview's cash box and the top moves all use this plan whenever synced bank months exist. Without them, for example with sample data or a hand-typed balance, the older cost-line forecast stays as the fallback.
