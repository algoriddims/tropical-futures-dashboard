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

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !(probe404 && /404/.test(m.text()))) errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const body = async () => (await page.locator('body').innerText()).toUpperCase();
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
  check('S returns to status desk', (await body()).includes('THIS WEEK: LOOK INTO'));

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

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
