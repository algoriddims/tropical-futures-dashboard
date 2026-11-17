# Production runs

Status, 17 Nov 2026. Production runs are the owner's records, typed in on the production desk (P) or pasted in from a Claude session, and saved with the other manual entries on the server. A sync never adds or changes them. Code: `app/src/game/production.ts` (pure, tested in `src/game/__tests__/production.test.ts`); page: `app/src/desks/production/ProductionRuns.tsx`.

## What a run holds

- **Who and terms:** supplier, invoice number and date, payment terms, incoterm (EXW, FOB, DDP… — who pays freight and duties), where it ships to.
- **Supplier lead times:** days to make samples, days to make the bulk order, days in transit. Used only to estimate dates you haven't set.
- **Stages:** samples ordered → samples in hand → samples approved → bulk ordered → bulk finished → shipped → received. Each has a done date and a planned date. A later stage marked done counts the earlier ones as done.
- **Costs:** goods, samples, freight, duties and tax, other. Goods and samples are units × unit price; the rest is an amount. A blank amount is unknown, never $0. Each line is paid (with the date) or due (with the due date, if known). A goods line can be linked to a Shopify product and size.
- **Shipments:** mode, carrier, tracking or booking number, tracking page link, shipped / ETA / delivered dates. Tracking status isn't fetched: no carrier is connected.
- **Files and links** (http/https only) and **notes**.

## Definitions

- **Expected date** of a stage = done date, else planned date, else the stage before + the supplier's days (samples in hand = ordered + sample days; bulk finished = bulk ordered + bulk days; received = shipped + transit days; approval, bulk order and shipping follow the stage before with no gap). No transit time → no arrival estimate.
- **Arrival** = received date if done, else the latest ETA of an undelivered shipment, else the received stage's expected date.
- **Total cost** = the known lines; lines without an amount are counted and shown as "+ ?". **Cost per unit, all in** = total known cost (samples and freight included) ÷ goods units; partial while any line is unknown.
- **Still to pay** = unpaid lines with an amount.

## Where runs show up

- **Cash forecast (costs desk):** each unpaid, priced line goes out in its due month; an undated or overdue one goes out this month (conservative). Paid lines are already in the bank figures and aren't counted again.
- **Stock on the way:** goods lines linked to a Shopify product count from the run's arrival date, so the reorder alerts know about them. New designs (not linked) and received runs don't.
- **This week: look into:** a stage whose planned or estimated date has passed without being marked done, and unpaid lines due within 7 days or overdue.

## Pasting a run

"Paste a run" on the production desk takes a run as JSON (the shape of `runSchema` in `production.ts`). It's validated before it's added: dates must be YYYY-MM-DD, links must be http/https, cost line ids must be unique, and a run whose id is already present is refused. "Show as text" on a run gives the same JSON back, so a run can be checked or updated in a Claude session and pasted back. Prepared runs with real business data belong in `data/private/` (gitignored), never in the repo.
