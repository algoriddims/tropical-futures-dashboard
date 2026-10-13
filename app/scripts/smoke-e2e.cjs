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
  meta: { coverageStart: '2026-09-01T00:00:00Z', coverageEnd: '2026-09-30T23:59:59Z', extractedAt: '2026-10-01T08:00:00Z' },
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

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const body = async () => (await page.locator('body').innerText()).toUpperCase();
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

  await page.goto(URL);
  await page.waitForSelector('text=BANK BALANCE');
  let t = await body();
  check('sample banner shown', t.includes('SAMPLE DATA — INVENTED NUMBERS'));
  check('status bar says sample / not live (no fake SHOPIFY 2m)', t.includes('NOT LIVE') && !/SHOPIFY 2m/.test(t));
  // plain business language on every desk (theme-park vocabulary retired)
  const parkWords = /\b(PARK|RIDES?|GUESTS?|QUESTS?|SCENARIOS?|MECHANIC|BROKEN|CONSTRUCTION|MACHINES)\b/;
  const hits = [];
  for (const k of ['s', 'p', 'g', 'i', 'l', 'c', 'o', 'a', 'n', '?']) {
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
  check('S returns to status desk', (await body()).includes('TOP MOVES'));

  // invalid import is rejected and changes nothing
  await page.click('button[title="IMPORT SYNC DATA"]');
  const bad = snapshot(1); delete bad.products[0].stock;
  await page.fill('textarea', JSON.stringify(bad));
  await page.click('button:text-is("IMPORT")');
  await page.waitForTimeout(200);
  t = await body();
  check('invalid import shows field-level error', t.includes('NOT IMPORTED') && t.includes('PRODUCTS[0].STOCK: MISSING'));
  await page.click('button:has-text("CANCEL")');
  check('invalid import left sample data in place', (await body()).includes('SAMPLE DATA — INVENTED NUMBERS'));

  // valid import
  await page.click('button[title="IMPORT SYNC DATA"]');
  await page.fill('textarea', JSON.stringify(snapshot(4)));
  await page.click('button:text-is("IMPORT")');
  await page.waitForSelector('text=SINCE LAST SYNC');
  t = await body();
  check('valid import renders snapshot', t.includes('SINCE LAST SYNC'));
  check('old coverage flagged even though just imported', t.includes('SYNC NEEDED') && /COVERAGE \d+D AGO/.test(t) && /IMPORTED \d+M AGO/.test(t));
  check('missing sessions/rates shown as unavailable', t.includes('NEEDS SESSIONS') && t.includes('NOT IN DATA'));

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
  await page.waitForTimeout(900);
  await page.keyboard.press('l'); await page.waitForTimeout(150);
  t = await body();
  check('moved sync value raises a conflict', t.includes('SHELF COUNT CONFLICTS · 1') && t.includes('LATEST SYNC SAYS 5'));
  check('correction still displayed during conflict', (await page.locator('button[title="CORRECT UNITS SOLD"]').first().innerText()).trim() === '7');
  await page.click('button:has-text("USE SYNC")');
  await page.waitForTimeout(150);
  check('USE SYNC resolves to the sync value', !(await body()).includes('SHELF COUNT CONFLICTS') && (await page.locator('button[title="CORRECT UNITS SOLD"]').first().innerText()).trim() === '5');


  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
