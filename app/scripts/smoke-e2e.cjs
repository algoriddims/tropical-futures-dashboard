// Browser smoke check for the reliability milestone.
//
//   npm run build && npx vite preview --port 4173      (in one terminal)
//   node scripts/smoke-e2e.cjs                          (in another)
//
// Needs Playwright (not a project dependency): `npm i -g playwright` and
// `npx playwright install chromium`, or set PLAYWRIGHT_MODULE to its path.
// Optional: SMOKE_URL, CHROMIUM_PATH. Uses a fresh browser profile, so it
// never touches your real localStorage data.
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.error('Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_MODULE.');
  process.exit(2);
}

const URL = process.env.SMOKE_URL || 'http://localhost:4173/';
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// Small, synthetic, valid snapshot. Coverage ends long ago on purpose.
const snapshot = (soldAtTropa) => ({
  meta: { coverageStart: '2026-09-01T00:00:00Z', coverageEnd: '2026-09-30T23:59:59Z', extractedAt: '2026-10-01T08:00:00Z', notes: ['Smoke note one'] },
  products: [
    { id: 'a', name: 'TEST TEE', drop: 'T', price: 50, unitCost: 20, stock: 5, startInventory: 20, sold7d: 3, soldPrev7d: 2, soldTotal: 15, published: true },
    { id: 'b', name: 'LIMITED ZINE', drop: 'Z', price: 20, unitCost: 5, stock: 0, startInventory: 10, sold7d: 2, soldPrev7d: 1, soldTotal: 10, published: true, restockPolicy: 'LIMITED' },
  ],
  pipeline: [],
  channels: [
    { name: 'ONLINE STORE', location: 'WORLDWIDE', type: 'ONLINE', revenue: 500, orders: 10, stock: [] },
    { name: 'TESTSHOP', location: 'NYC', type: 'STOCKIST', revenue: 100, orders: 2, stock: [{ productId: 'a', allocated: 10, sold: soldAtTropa }] },
  ],
  orders: [], campaigns: [],
  days: [{ date: '09-30', revenue: 100, orders: 2, spend: 0 }],
  grossMargin: 0.6, targetRoas: 3,
});

// A small analytics block dated relative to today in New York, so the
// "last 30 complete days" period always lands on it.
const nyToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const yesterday = shift(nyToday, -1);
const m = (o) => ({ grossSales: 0, discounts: 0, returns: 0, netSales: 0, cogs: null, netSalesWithCost: 0, qtyOrdered: 0, qtyReturned: 0, netItems: 0, ...o });
const analytics = {
  version: 1, source: 'shopify', shop: 'smoke.shop', currency: 'USD', timezone: 'America/New_York',
  extractedAt: new Date().toISOString(), inventoryAsOf: new Date().toISOString(),
  salesCoverage: { from: shift(yesterday, -59), to: yesterday, missing: [] },
  daily: [
    { date: shift(yesterday, -1), channel: 'Online Store', orders: 1, ...m({ grossSales: 5000, netSales: 5000, cogs: 2000, netSalesWithCost: 5000, qtyOrdered: 1, netItems: 1 }) },
    { date: shift(yesterday, -35), channel: 'Online Store', orders: 1, ...m({ grossSales: 4000, netSales: 4000, cogs: 1000, netSalesWithCost: 4000, qtyOrdered: 1, netItems: 1 }) },
  ],
  variantDaily: [
    { date: shift(yesterday, -1), channel: 'Online Store', productId: '1', variantId: '11', ...m({ grossSales: 5000, netSales: 5000, cogs: 2000, netSalesWithCost: 5000, qtyOrdered: 1, netItems: 1 }) },
    { date: shift(yesterday, -35), channel: 'Online Store', productId: '1', variantId: '12', ...m({ grossSales: 4000, netSales: 4000, cogs: 1000, netSalesWithCost: 4000, qtyOrdered: 1, netItems: 1 }) },
  ],
  variants: [
    { variantId: '11', productId: '1', productTitle: 'SMOKE TEE', productType: 'Tshirt', variantTitle: 'S', sku: null, options: [{ name: 'Size', value: 'S' }], price: 5000, unitCost: 2000, productCreatedAt: '2026-01-01T00:00:00Z', productPublishedAt: '2026-01-02T00:00:00Z', tracked: true, isBundle: false, inventory: [{ locationId: '1', locationName: 'WAREHOUSE', available: 0, onHand: 0, committed: 0, incoming: 0, reserved: 0, unavailable: 0 }] },
    { variantId: '12', productId: '1', productTitle: 'SMOKE TEE', productType: 'Tshirt', variantTitle: 'M', sku: null, options: [{ name: 'Size', value: 'M' }], price: 5000, unitCost: 2000, productCreatedAt: '2026-01-01T00:00:00Z', productPublishedAt: '2026-01-02T00:00:00Z', tracked: true, isBundle: false, inventory: [{ locationId: '1', locationName: 'WAREHOUSE', available: 3, onHand: 3, committed: 0, incoming: 0, reserved: 0, unavailable: 0 }] },
  ],
  customers: [],
  notes: [],
};

// A small bank layer dated relative to today: three complete months and the
// current one, one untagged deposit this month, one recurring vendor.
const ym = (d) => d.slice(0, 7);
const monthsBack = (n) => { const [y, mo] = ym(nyToday).split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 - n, 1)); return t.toISOString().slice(0, 7); };
const bank = {
  accounts: [{ id: 'chk', name: 'SMOKE CHECKING', mask: '0001', kind: 'CHECKING', balance: 1000, asOf: new Date().toISOString() }],
  cashflow: [
    ...[3, 2, 1].map((n) => ({ month: monthsBack(n), partial: false, cashIn: { SHOPIFY_PAYOUTS: 300 }, spend: { SOFTWARE: 40 } })),
    { month: ym(nyToday), partial: true, cashIn: { SHOPIFY_PAYOUTS: 200, OTHER_IN: 500 }, spend: { SOFTWARE: 40, SHIPPING: 60 } },
  ],
  deposits: [{ id: 'dep-1', date: `${ym(nyToday)}-01`, amount: 500, kind: 'OTHER_IN', label: 'Smoke invoice payment' }],
  vendorSpend: [{ vendor: 'SMOKE SUITE', kind: 'SOFTWARE', byMonth: Object.fromEntries([3, 2, 1, 0].map((n) => [monthsBack(n), 40])) }],
};

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !(probe404 && /404/.test(m.text()))) errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const body = async () => (await page.locator('body').innerText()).toUpperCase();
  const openFolds = async () => { await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); await page.waitForTimeout(150); };
  // The app probes /api/snapshot once to find a shared store; without the
  // hosting server (vite preview) that 404 is expected and means "local mode".
  const probe = (u) => /\/api\/snapshot$/.test(u);
  let probe404 = false;
  page.on('response', (r) => {
    if (r.status() === 404 && probe(r.url())) { probe404 = true; return; }
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(URL);
  await page.waitForSelector('text=BANK BALANCE');
  let t = await body();
  check('sample banner shown', t.includes('SAMPLE DATA — INVENTED NUMBERS'));
  check('status bar says sample / not live (no fake SHOPIFY 2m)', t.includes('NOT LIVE') && !/SHOPIFY 2m/.test(t));
  // plain business language on every desk (theme-park vocabulary retired)
  const parkWords = /\b(PARK|RIDES?|GUESTS?|QUESTS?|SCENARIOS?|MECHANIC|BROKEN|CONSTRUCTION|MACHINES)\b/;
  const hits = [];
  for (const k of ['s', 'p', 'g', 'i', 'l', 'c', 'o', 'a', 'n', 'f', '?']) {
    await page.keyboard.press(k); await page.waitForTimeout(120);
    const m = (await body()).match(parkWords);
    if (m) hits.push(`${k}:${m[0]}`);
    if (k === '?') await page.keyboard.press('Escape');
  }
  check('no theme-park vocabulary on any desk', hits.length === 0, hits.join(' '));
  await page.keyboard.press('s'); await page.waitForTimeout(120);

  // keyboard navigation
  await page.keyboard.press('l'); await page.waitForTimeout(150);
  check('L opens locations desk', (await body()).includes('STOCK OUT IN THE WORLD'));
  check('money-owed total replaced by not-tracked note', (await body()).includes('NOT TRACKED YET') && !(await body()).includes('TOTAL OWED'));
  await page.keyboard.press('o'); await page.waitForTimeout(150);
  t = await body();
  check('O opens orders desk with honest tape label', t.includes('ORDER TAPE · SAMPLE') && !/\bLIVE\b/.test(t.split('ORDER TAPE')[1]?.slice(0, 40) ?? ''));
  await page.keyboard.press('3'); await page.waitForTimeout(100);
  await page.keyboard.press('s'); await page.waitForTimeout(150);
  check('S returns to the overview, actions first', (await body()).includes('2 · DO THIS WEEK') && (await body()).includes('1 · WHERE YOU STAND'));

  // invalid import is rejected and changes nothing
  await page.click('button[title="IMPORT SYNC DATA"]');
  const bad = snapshot(1); delete bad.products[0].stock;
  await page.fill('textarea', JSON.stringify(bad));
  await page.click('button:text-is("IMPORT")');
  await page.waitForTimeout(200);
  t = await body();
  check('invalid import shows field-level error', t.includes('NOT IMPORTED') && t.includes('PRODUCTS[0].STOCK: MISSING'));
  // a paste that got cut off says so
  await page.fill('textarea', JSON.stringify(snapshot(1)).slice(0, 200));
  await page.click('button:text-is("IMPORT")');
  await page.waitForTimeout(200);
  check('cut-off paste is explained', (await body()).includes('THE PASTE LOOKS CUT OFF'));
  await page.keyboard.press('Escape'); await page.click('button[title="IMPORT SYNC DATA"]');
  await page.keyboard.press('l'); await page.waitForTimeout(120);
  check('desk keys are ignored while a dialog is open', !(await body()).includes('STOCK OUT IN THE WORLD') && (await page.locator('[aria-modal="true"]').count()) === 1);
  await page.click('button:has-text("CANCEL")');
  check('invalid import left sample data in place', (await body()).includes('SAMPLE DATA — INVENTED NUMBERS'));

  // valid import, by choosing the file rather than pasting
  await page.click('button[title="IMPORT SYNC DATA"]');
  await page.setInputFiles('input[type="file"]', { name: 'park-data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot(4))) });
  await page.waitForSelector('text=LOADED park-data.json');
  await page.click('button:text-is("IMPORT")');
  await page.waitForSelector('text=LAST SYNC');
  // desk keys are ignored while a dialog is open; the import dialog closes itself after success
  await page.waitForSelector('[aria-modal="true"]', { state: 'detached' });
  t = await body();
  check('overview detail starts folded', !t.includes('NEEDS SESSIONS') && t.includes('4 · DETAIL'));
  await openFolds();
  t = await body();
  check('valid import renders snapshot', t.includes('LAST SYNC'));
  check('old coverage flagged even though just imported', t.includes('SYNC NEEDED') && /COVERAGE \d+D AGO/.test(t) && /IMPORTED \d+M AGO/.test(t));
  check('missing sessions/rates shown as unavailable', t.includes('NEEDS SESSIONS') && t.includes('NOT IN DATA'));
  check('data notes stay off the overview (pointer to the feed only)', t.includes('1 DATA NOTE FROM THIS SYNC') && !t.includes('SMOKE NOTE ONE'));
  await page.keyboard.press('f'); await page.waitForTimeout(150);
  t = await body();
  check('F opens the import feed with the sync notes', t.includes('IMPORT FEED') && t.includes('SMOKE NOTE ONE') && t.includes('CURRENT'));
  await page.keyboard.press('s'); await page.waitForTimeout(150);

  await page.keyboard.press('i'); await page.waitForTimeout(150);
  t = await body();
  check('limited sellout shown as SOLD OUT ✓, not BROKEN', t.includes('SOLD OUT ✓') && !t.includes('BROKEN'));

  // shelf correction persists across reload
  await page.keyboard.press('l'); await page.waitForTimeout(150);
  await page.click('button[title="CORRECT UNITS SOLD"]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForSelector('text=BANK BALANCE');
  await page.keyboard.press('l'); await page.waitForTimeout(150);
  const soldCell = await page.locator('button[title="CORRECT UNITS SOLD"]').first().innerText();
  check('shelf correction survives reload', soldCell.trim() === '7', `cell=${soldCell}`);

  // re-import where the sync moved → conflict exposed, correction kept
  await page.click('button[title="IMPORT SYNC DATA"]');
  await page.fill('textarea', JSON.stringify(snapshot(5)));
  await page.click('button:text-is("IMPORT")');
  await page.waitForSelector('[aria-modal="true"]', { state: 'detached' });
  await page.keyboard.press('l'); await page.waitForTimeout(150);
  t = await body();
  check('moved sync value raises a conflict', t.includes('SHELF COUNT CONFLICTS · 1') && t.includes('LATEST SYNC SAYS 5'));
  check('correction still displayed during conflict', (await page.locator('button[title="CORRECT UNITS SOLD"]').first().innerText()).trim() === '7');
  await page.click('button:has-text("USE SYNC")');
  await page.waitForTimeout(150);
  check('USE SYNC resolves to the sync value', !(await body()).includes('SHELF COUNT CONFLICTS') && (await page.locator('button[title="CORRECT UNITS SOLD"]').first().innerText()).trim() === '5');


  // variant-level analytics: performance vs prior, exceptions, size matrix, definitions
  await page.click('button[title="IMPORT SYNC DATA"]');
  await page.fill('textarea', JSON.stringify({ ...snapshot(5), analytics }));
  await page.click('button:text-is("IMPORT")');
  await page.waitForSelector('[aria-modal="true"]', { state: 'detached' });
  await page.keyboard.press('s'); await page.waitForTimeout(200);
  t = await body();
  check('top tiles: Shopify sales with daily bars, and no bank sync means Shopify-only goal', t.includes('SHOPIFY SALES · LAST 30 DAYS') && t.includes('$50') && t.includes('SHOPIFY ONLY'));
  await openFolds();
  t = await body();
  check('performance shows net revenue vs the prior period with dates', t.includes('NET PRODUCT REVENUE') && t.includes('$50') && t.includes('+$10 (+25.0%)') && t.includes(' VS '));
  check('margin change in percentage points', t.includes('60.0%') && t.includes('−15.0 PP'));
  check('selling size that is out of stock is an exception with its rule', t.includes('SMOKE TEE: S UNAVAILABLE') && t.includes('RULE:'));
  check('wholesale and drop sell-through say unavailable', t.includes('WHOLESALE NOT CONNECTED') && t.includes('DROP SELL-THROUGH UNAVAILABLE'));
  await page.click('button:has-text("DEFINITIONS")');
  await page.waitForSelector('[aria-modal="true"]');
  check('definitions dialog lists the metric dictionary', (await body()).includes('CUMULATIVE DROP SELL-THROUGH') || (await page.locator('[aria-modal="true"]').innerText()).includes('Cumulative drop sell-through'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('[aria-modal="true"]', { state: 'detached' });
  await page.keyboard.press('i'); await page.waitForTimeout(200);
  await page.click('button:has-text("SIZE AVAILABILITY")');
  await page.waitForTimeout(150);
  t = await body();
  check('size matrix shows OUT and counts as text', /SMOKE TEE\s+OUT ★\s+3/.test(t));

  // bank layer: all-channel money in vs out, deposit tagging, recurring charges, stock on the way
  await page.click('button[title="IMPORT SYNC DATA"]');
  await page.fill('textarea', JSON.stringify({ ...snapshot(5), analytics, ...bank }));
  await page.click('button:text-is("IMPORT")');
  await page.waitForSelector('[aria-modal="true"]', { state: 'detached' });
  await page.keyboard.press('s'); await page.waitForTimeout(200);
  t = await body();
  check('money-in tile counts payouts and says the rest is untagged', /MONEY IN · [A-Z]+\s+COSTS →\s+\$200\s+AT LEAST/.test(t) && t.includes('+$500 NOT TAGGED'));
  check('tagging the deposit is an action this week', t.includes('TAG 1 DEPOSIT ($500)'));
  await openFolds();
  const moneyPanel = async () => (await page.locator('section[aria-labelledby="mio-h"]').innerText()).toUpperCase();
  t = await moneyPanel();
  check('money in counts payouts and leaves an untagged deposit out', t.includes('MONEY IN VS OUT') && /RECEIVED SO FAR\s+AT LEAST\s+\$200/.test(t) && t.includes('$500 IN 1 DEPOSIT NOT TAGGED YET'));
  await page.click('button:has-text("TAG THEM")'); await page.waitForTimeout(200);
  await page.click('section[aria-labelledby="dep-h"] button:text-is("CLIENT")'); await page.waitForTimeout(150);
  t = (await page.locator('section[aria-labelledby="rec-h"]').innerText()).toUpperCase();
  check('recurring charge listed with its monthly total', t.includes('SMOKE SUITE') && t.includes('$40.00') && t.includes('$40/MO'));
  await page.click('section[aria-labelledby="rec-h"] button:text-is("CUT")'); await page.waitForTimeout(150);
  check('marking a charge to cut shows in the total', (await page.locator('section[aria-labelledby="rec-h"]').innerText()).toUpperCase().includes('$40/MO MARKED TO CUT'));
  await page.keyboard.press('s'); await page.waitForTimeout(200);
  t = await moneyPanel();
  check('a tagged deposit counts toward money received', /RECEIVED SO FAR\s+\$700/.test(t) && !t.includes('NOT TAGGED YET') && t.includes('+$600'));
  t = await body();
  check('exceptions show the sales at risk', t.includes('OF SALES AT RISK IN THE NEXT 4 WEEKS') && t.includes('S: OUT OF STOCK NOW'));
  await page.keyboard.press('i'); await page.waitForTimeout(200);
  const plan = page.locator('section[aria-labelledby="sp-h"]');
  await plan.locator('select').first().selectOption({ label: 'SMOKE TEE' });
  await plan.locator('select').nth(1).selectOption({ label: 'S' });
  await plan.locator('input[type="number"]').fill('12');
  await plan.locator('input[type="date"]').fill(shift(nyToday, 5));
  await plan.locator('button:text-is("ADD")').click(); await page.waitForTimeout(150);
  check('stock on the way is recorded and counted', (await plan.innerText()).toUpperCase().includes('12 UNITS') && (await plan.innerText()).toUpperCase().includes('COUNTED IN THE STOCK CHECKS'));
  await page.keyboard.press('s'); await page.waitForTimeout(200); await openFolds();
  check('the exception names the stock on the way', (await body()).includes('S: 12 UNITS EXPECTED'));
  await page.reload(); await page.waitForSelector('text=1 · WHERE YOU STAND'); await openFolds();
  t = await moneyPanel();
  check('tags and stock on the way survive a reload', /RECEIVED SO FAR\s+\$700/.test(t) && (await body()).includes('S: 12 UNITS EXPECTED'));

  // production runs: paste one, see it priced and dated, and see it reach the look-into list
  const stagesOf = (done) => Object.fromEntries(['SAMPLES_ORDERED', 'SAMPLES_RECEIVED', 'SAMPLES_APPROVED', 'BULK_ORDERED', 'BULK_FINISHED', 'SHIPPED', 'RECEIVED'].map((k) => [k, { planned: null, done: k === 'SAMPLES_ORDERED' ? done : null }]));
  const run = {
    id: 'run-smoke', name: 'SMOKE CAP RUN', supplier: '', invoiceRef: '', invoiceDate: shift(nyToday, -2), terms: 'Pay upfront', incoterm: 'DDP', destination: 'Philippines',
    leadTimes: { sampleDays: 20, bulkDays: 25, transitDays: null }, stages: stagesOf(shift(nyToday, -2)),
    costs: [
      { id: 'c1', kind: 'GOODS', description: 'Grey caps', units: 100, unitPrice: 4.12, amount: null, paid: false, date: shift(nyToday, 3), productId: null, variantId: null },
      { id: 'c2', kind: 'SAMPLES', description: 'Samples', units: 5, unitPrice: 80, amount: null, paid: true, date: null, productId: null, variantId: null },
      { id: 'c3', kind: 'FREIGHT', description: 'DDP freight', units: null, unitPrice: null, amount: null, paid: true, date: null, productId: null, variantId: null },
    ],
    shipments: [], links: [], notes: '', createdAt: new Date().toISOString(),
  };
  await page.keyboard.press('p'); await page.waitForTimeout(200);
  await page.click('button:has-text("PASTE A RUN")');
  await page.fill('textarea[aria-label="Run to paste"]', '{ broken');
  await page.click('button:has-text("ADD THIS RUN")');
  check('a broken pasted run is refused with a reason', (await body()).includes('NOT VALID JSON'));
  await page.fill('textarea[aria-label="Run to paste"]', JSON.stringify(run));
  await page.click('button:has-text("ADD THIS RUN")'); await page.waitForTimeout(150);
  const card = page.locator('section[aria-label="Production run SMOKE CAP RUN"]');
  t = (await card.innerText()).toUpperCase();
  check('pasted run shows totals: paid, still to pay, unknown freight', t.includes('$812') && /PAID\s+\$400/.test(t) && /STILL TO PAY\s+\$412/.test(t) && t.includes('1 LINE WITH NO AMOUNT YET'));
  check('run card starts folded: next stage and money, no form', t.includes('NEXT: SAMPLES IN HAND') && t.includes('ARRIVAL UNKNOWN') && !t.includes('PAYMENT TERMS'));
  const tl = (await page.locator('svg[aria-label^="Timeline of 1 production run"]').innerHTML());
  check('timeline draws the run: phase bars, payment marker, today line', tl.includes('Sampling:') && tl.includes('$400 + ? paid') && tl.includes('TODAY') && tl.includes('arrival not known'));
  await page.locator('g[aria-label="Open SMOKE CAP RUN"]').click(); await page.waitForTimeout(250);
  check('clicking a run in the timeline opens its card for editing', (await card.innerText()).toUpperCase().includes('PAYMENT TERMS'));
  await card.locator('button[aria-label="Mark Samples in hand done today"]').click(); await page.waitForTimeout(150);
  check('marking a stage done moves the run on', (await card.innerText()).toUpperCase().includes('NEXT: SAMPLES APPROVED'));
  await page.keyboard.press('s'); await page.waitForTimeout(200);
  check('a payment due this week is in the look-into list', (await body()).includes('SMOKE CAP RUN: A PAYMENT IS DUE'));
  await page.keyboard.press('c'); await page.waitForTimeout(200);
  check('the unpaid cost is in the cash forecast', (await body()).includes('SMOKE CAP RUN: GREY CAPS DUE'));
  await page.reload(); await page.waitForSelector('text=1 · WHERE YOU STAND'); await openFolds();
  await page.keyboard.press('p'); await page.waitForTimeout(200);
  check('runs survive a reload', (await page.locator('section[aria-label="Production run SMOKE CAP RUN"]').innerText()).toUpperCase().includes('NEXT: SAMPLES APPROVED'));

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
