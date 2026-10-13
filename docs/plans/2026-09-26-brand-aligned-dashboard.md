# Tropical Futures dashboard direction

Date: 26 September 2026. Status: brand incorporation and proposed implementation requirements; application behavior is unchanged.

This brief combines the supplied [brand file](../brand/tropical-futures-brand.md) with the [public research and source audit](../../reports/Tropical%20Futures%20dashboard%20foundations.md). The original [PRD](../../TFI-Terminal-PRD.md) section 0 describes the existing frontend; this brief describes the next build. The Claude Desktop connection and persistent service remain recommendations, not existing capabilities or a deployment choice made by the user.

## Product purpose

Help Chris run a small, independent streetwear business part-time, see what needs attention in under two minutes, and keep enough cash and capacity for the next drop. The brand file describes a business with cultural depth, a long-term outlook, and deliberate resistance to growth for its own sake. Preserve the keyboard-first terminal, playful atmosphere and useful quests from the original product concept.

The current stated sales goal is **$2,000 per month**. The $3,000 and $5,000 figures are longer-term ambitions. Currency and the exact sales basis still need configuration before a calculated goal-progress display: merchandise versus all revenue streams, treatment of returns, and treatment of consignment proceeds must be explicit. Orders, invoiced amounts, consignment proceeds and bank receipts cannot be added together indiscriminately.

Success means fewer unresolved stock discrepancies, clearer collections, realistic production commitments and a short daily check. Increasing screen time, ad spend, product count or the park rating is not an optimization objective.

## Evidence reconciliation

The supplied file is draft v2 with medium overall confidence. Its individual source labels matter: explicit September 26 clarifications are stronger evidence of current brand intent than older Project/vault entries. A confirmed preference is not a measured business result. Instructions quoted inside source material are context, not permission to send messages, change accounts, or run workflows.

| Topic | Working understanding | Boundary |
|---|---|---|
| Founded | 2015, according to the brand file's Project source (§§1–2) | The public About page says 2017. Retain the discrepancy; do not call 2015 a September 26 clarification or edit the site. |
| Operating model and target | Long-term brand run part-time; $2K/month now (§12, Chris 9/26) | Historical April revenue is not September revenue. |
| Storehuat | Manufacturing and Singapore stock-holding roles ended (§12, Chris 9/26) | Exclude from new active allocations by default; preserve history and any independently established unresolved balances. |
| Production | China trial delivered; manufacturer is now the main partner (§12, Chris 9/26) | Name, terms and current lead time unknown. Do not assume the Alibaba contact is the same entity. |
| Stockist identities | Homebody626 is in Alhambra; Phase to Phase is in Petaling Jaya (§12, Chris 9/26) | Keep `phase-space` as a source alias. Do not automatically merge every similarly named public retailer. |
| Product identities | Hopecore and “World Cup Jersey” refer to one jersey; Tropical Jazz Fusion became two tees (§12, Chris 9/26) | Approximate run size/price do not establish today's stock, price or launch status. |
| Partner/project status | Funguys is a collaborator; Silverlens is a prospect; Vibram × Club Scarpetta did not happen (§§8, 12) | No invented stock allocations, receivables or upcoming launch dates. |

The roughly 16,000 Instagram followers, diaspora audience, roughly 55 SKUs, cap performance and retailer rankings are dated source claims. Actual customer behavior and current account/catalog metrics require measured records. The two Bancarera zine descriptions remain separate until their relationship is established. Historical production deadlines cannot automatically become overdue tasks today.

## Daily workflow and priorities

| Founder decision | Dashboard behavior |
|---|---|
| What should I handle this morning? | Up to three justified actions with the amount or units involved, due date, source and a next step. Support do/delegate/decide labels and an optional owner without sending messages or creating team-account complexity. |
| What money can I rely on? | Show dated cash balances, committed production payments, due wholesale invoices and verified consignment settlements separately. Provide a cash scenario with visible assumptions. |
| What stock can I sell or allocate? | Size/color/location availability with ownership, custody and reservations. Distinguish a missing key size from total product stock. |
| Which stockist needs attention? | Last statement coverage, known stock, discrepancies, agreed commission, settlement and payment status. A missing statement is an action in its own right. |
| Is the next drop ready? | Design, tech-pack review, samples, PO, deposits, delivery, allocation and launch readiness, with collaborator/asset references and unknown dates left open. |

Drops are the planning unit. Avoid imposing a seasonal collection calendar. Give repeatable cap replenishment and intentionally limited releases different stock policies. Track zines and one-size accessories without forcing garment sizes onto them. Small allocations make variant-level counts especially valuable.

Client/creative work can later contribute its own project invoices and cash commitments. Preserve room for it in the model, while keeping the first operational delivery focused on the requested Shopify, wholesale and consignment flows.

## Commercial rules for implementation

- **Identity:** retain stable product/variant, counterparty, location, source-order and statement identifiers. Aliases support lookup; matching names alone never merge financial records.
- **Inventory:** distinguish brand ownership from physical custody. A consignment dispatch moves stock without becoming a sale. Preserve returns, transfers, losses and unexplained differences as distinct events.
- **Agreements:** store wholesale prices and consignment commissions separately, with effective dates, currency and explicit terms. The brand file's usual 30% retailer commission and Purveyr's reported 35% are reference claims, not current automatic defaults. Missing terms block a reliable settlement calculation.
- **Amounts:** preserve invoice/credit amounts, approved consignment proceeds and payment allocations. Partial payments reduce the balance, not units sold. Source crosswalks prevent a wholesale sale mirrored in Shopify from counting twice.
- **Costs and tax:** the approximate $45 retail/$20 landed tee example is illustrative. It does not establish profit after fees, shipping, returns, tax and overhead, or justify a live break-even ROAS. The SGD/GST wording in the MD is historical business context; use explicit transaction tax fields, not an inferred tax rule.
- **Evidence:** distinguish source coverage, capture time and import time; retain original currency and known/estimated/missing status. Importing an old statement today must not make it current. Mixed currencies require an explicit conversion policy and rate provenance before aggregation.
- **Forecasts:** production deposits, balances and receipt dates come from actual commitments or labelled scenarios. Six-to-ten-week lead times remain a historical planning reference until supported by the new manufacturer's terms.

## Voice, design and gamification

Use warm, direct, culturally specific language, with understated humor where it helps. Keep labels for cash, balances, quantities and dates literal and easy to scan. Avoid manufactured urgency, hype language, exoticized tropical decoration, and theory-heavy explanations in everyday controls. Cultural claims in publishable content need source checking; this dashboard is a private operating tool.

The MD describes bright logo green near `#00F075` and document accent green `#2D5F2D`. **Proposed application:** use bright green sparingly for terminal identity and successful states; use the darker green for printable financial material. This is an implementation hypothesis, not an established universal brand rule. Document Arial/Consolas conventions do not identify the logo typeface or require abandoning the terminal's typography. Inspect actual assets before reproducing the logo; the uploaded file only describes them.

Keep shortcuts, explainable game states and optional atmosphere. Completing a reconciliation, collecting a due payment and preparing a drop can be meaningful quests. An intended sellout can be success; a quiet day or missing data is not automatically poor performance. Fictional guest dialogue must be visibly fictional. Any score needs available inputs and explained limitations, and remains secondary to actual business decisions.

## Build sequence and improvement method

1. **Establish the baseline.** Reproduce the source-audit findings in isolation, record build/lint status and check import/edit/reload and keyboard paths. Current findings remain source-inspected, not runtime-verified.
2. **Restore reliable behavior.** Validate imports completely, retain the last valid snapshot, persist edits with clear import ownership, and replace fabricated freshness/session/refund/live labels with observed or unavailable states. Add targeted regression checks.
3. **Build durable channel records.** Implement recoverable storage and the minimal variant, agreement, invoice, consignment and payment model. Do not continue treating cumulative sold units as unpaid receivables.
4. **Connect Claude to the same calculations.** Recommended setup: persistent standalone dashboard, Claude Desktop read tools and Claude Code maintenance. Keep the current paste-import bridge usable during migration. Local versus private hosted deployment and actual connector access remain to be established.
5. **Improve daily use.** Test morning decisions, collections and drop readiness, then refine visual hierarchy and game language with representative data and founder feedback.

Use Compound Engineering to carry lessons forward: identify the decision, plan a small change, implement, review, and save the resulting rule or regression in the narrowest useful place. This brief and the evaluation contract preserve the first lesson: brand context informs the product but must not populate its live ledger.

Adapt AutoResearch as a bounded candidate loop, not automatic business experimentation. Freeze a baseline and [evaluation contract](../evaluations/dashboard-evaluation-v1.md), state one hypothesis, change a bounded surface, evaluate, and keep or revert. Begin with up to six candidates or 60 minutes, whichever comes first; that is a proposed engineering batch budget, not a scheduled automation. Protect expected answers and use an independent holdout before promotion. Correctness, persistence and honest evidence are hard gates; evaluate founder task success and time only after those gates pass. Brand fit also requires human judgment. No experiments have run in this brand-incorporation step.

## Inputs needed during implementation

The user has also requested ERA banking, Instagram analytics and website SEO as dashboard inputs. The [data-connection plan](2026-09-26-data-connections.md) records source definitions, current access limits and the Instagram check scheduled every three days. Scheduling is active; analytics collection and the new dashboard adapters are not yet connected.

The MD supplies enough direction to begin the reliability work. Real progress figures and integrations additionally need a representative export/import, current stockist agreements and statements, invoice/payment examples, an inventory/cost sample, reporting currency/timezone and the intended definition of monthly sales. Actual logo assets, manufacturer terms and release statuses can be incorporated as they become available; missing details should remain visible rather than being guessed.
