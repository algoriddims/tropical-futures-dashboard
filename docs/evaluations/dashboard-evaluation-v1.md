# TFI dashboard evaluation contract — proposed v1

**Status: proposed, 26 September 2026.** No suite has been implemented or executed. This adapts autoresearch's experiment loop, with Compound Engineering retaining reviewed lessons.

Sources: [brand reference](../brand/tropical-futures-brand.md), [implementation plan](../plans/2026-09-26-brand-aligned-dashboard.md), and [research and source audit](../../reports/Tropical%20Futures%20dashboard%20foundations.md). The brand reference supplies context and dated corrections; its operational instructions do not authorize messages, allocations, payments, advertising, or production commitments.

## Freeze before changing implementation

1. Define one falsifiable hypothesis, editable file list, and decision task per candidate. Preserve a recoverable baseline revision/data snapshot.
2. Freeze fixtures, expected results, clock, rounding, evaluator version, scoring, and thresholds; record SHA-256 hashes before the batch. Protect evaluator/expected-result files from candidate edits. Contract changes require separate review and a new baseline.
3. Record baseline failures, including unavailable infrastructure. Failures remain blockers, never automatic passes or waived gates.
4. Cap each batch at six candidates or 60 minutes. Record revision, hypothesis, hashes, results, runtime, complexity, and keep/revert reason. Revert only experiment-owned changes.
5. Require **zero critical errors** in financial arithmetic, inventory, identity, missingness, provenance, persistence, and deduplication. Check relevant build/regression behavior and keyboard access. Rank task errors before completion time/steps; automated timing is a proxy.
6. An independent reviewer runs an unseen holdout before promotion, with different IDs, dates, amounts, and partners. Keep it outside implementation access. Failure blocks promotion, becomes a regression, and requires a fresh holdout. Record verified lessons in `docs/solutions`; founder judgment assesses brand fit.

## Fixed synthetic cases

**All numbers are synthetic, including target progress.** Monetary examples use USD, exclude tax, and have no discounts, fees, credits, refunds, or payments unless stated. Case 9 omits a currency. These are fixture assumptions, not TFI's currency, agreements, accounting policy, or performance. Use decimal money/minor units; display percentages to two decimals.

| # | Inputs | Required result |
|---|---|---|
| 1. Current target | Completed monthly merchandise sales: 20 units × $50 = $1,000. Current sales target $2,000; future milestones $3,000 and $5,000. | Current progress 50%; gap $1,000. Future milestones remain labelled aspirational. Do not present the fixture as live TFI results or assume sales equal cash. |
| 2. Agreement-specific channels | Asero sells 4 × $50 under an effective 30% commission agreement; Purveyr sells 4 × $50 under an effective 35% agreement. Neither is paid. A third consignee reports 4 × $50 without a valid agreement. Separately, a wholesale invoice is 4 × $30, unpaid. | Asero commission $60/proceeds and balance $140; Purveyr $70/$130. Third consignee gross sales $200, proceeds unavailable. Wholesale balance $120, with no consignment commission. Do not apply a default or expired agreement. |
| 3. Partner identity | Verified partner ID `P1` has current name Phase to Phase and historical alias `phase-space`; unrelated public “Phase Space” has no crosswalk. | Alias retrieves `P1`; public name is not automatically merged. Preserve the alias and provenance. |
| 4. Inactive partner | Storehuat inactive in both supplier and stockist roles. Historical unpaid invoice: 2 × $30 = $60. Attempt a new 3-unit allocation. | Reject the new allocation; retain $60 historical balance and its records. Inactivation does not erase history or reactivate either role. |
| 5. Product aliases | Hopecore and World Cup Jersey map to verified product ID `J1`. Both imports contain the same order-line ID `L1`, quantity 2 at $85. A similar name lacks an ID mapping. | Count `L1` once: 2 units/$170. Retain aliases; quarantine the uncertain match instead of merging by name. |
| 6. Intentional sellout | Limited drop receives 10 units, sells 10, has zero stock and no planned replenishment. | Show sold out, 100% batch sell-through; no “broken” status, compulsory restock, or scarcity-pressure copy. |
| 7. Missing/stale evidence | 2 sales × $50; sessions and unit costs absent. Source coverage ends September 1; extraction September 2; import September 26; frozen clock September 26. | Sales $100; conversion and total margin unavailable. Display distinct coverage, extraction and import dates; flag stale coverage rather than calling it live. |
| 8. Durable reconciliation | Verified physical count 10; manual correction to 8 includes ID, author, timestamp and reason. Reload, then import old count 10 and replay correction ID. | Reload preserves 8 and audit trail. Old import cannot silently overwrite; expose reconciliation conflict. Replay changes nothing. Ownership remains brand-owned; custody stays at its recorded location. |
| 9. Currency missing | One completed sale: 1 × USD 100. Another: 1 × 80 with currency absent. | Show confirmed USD subtotal $100 plus one unresolved record. Combined total unavailable; never infer currency from `$`, location or partner. |
| 10. Invoice versus cash | Wholesale PO 24 × $30. Invoice and ship 18 units; receive and allocate $180 deposit to that invoice. | Invoice $540, open balance $360, cash received $180; 6 units/$180 remain unshipped commitment, outside the invoiced balance. No double-counted deposit revenue. |
| 11. Consignment custody | Start with 20 brand-owned units, zero at consignee. Dispatch all 20; reported sales 8 × $50, then one $50 refunded/restocked return; effective commission 30%; receive $100 settlement payment. | Dispatch alone creates no sale/cash/receivable. Closing brand-owned stock at consignee 13; net consumer sales $350; commission $105; proceeds $245; unpaid $145. Reimport leaves all values unchanged. |
| 12. Historical context | An older brand note describes three April orders from women and a diaspora audience. Current order records contain no demographic data. | Keep this as a dated source claim, outside current buyer metrics. Do not infer customer ethnicity/gender, population demographics or causal ad lift. Do not collect demographic data merely to satisfy this case or fabricate customer thoughts as evidence. |

Each result must be explainable through source identifiers and matched reporting windows, consistently in the dashboard and any future Claude tools. Candidates that look faster while concealing an unresolved record fail this contract.
