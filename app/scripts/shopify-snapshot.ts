// Build a park-data.json from Shopify extracts, optionally adding the business
// bank/card layer from an ERA extract.
//
//   npx vite-node scripts/shopify-snapshot.ts <raw-dir | shopify-extract.json> <out.json> [era-extract.json]
//
// <raw-dir> (current): a folder of read-only connector results — meta.json,
// daily-by-channel.json, variant-daily.json, variants-p*.json — see
// docs/data/shopify-sync.md. A single shopify-extract.json is the older format
// (no analytics block). Both hold real business data: keep them in
// data/private/ (gitignored), never in the repo.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShopifySnapshot, toImportFile } from '../src/game/shopify';
import type { ShopifyExtract } from '../src/game/shopify';
import { validateParkData } from '../src/game/validate';
import { withEra } from '../src/game/era';
import type { EraExtract } from '../src/game/era';
import { buildAnalytics } from '../src/analytics/shopifyAdapter';
import type { RawShopifyAnalytics, RawVariantNode } from '../src/analytics/shopifyAdapter';
import { legacyExtract } from '../src/analytics/legacyBridge';

const [inPath, outPath, eraPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: vite-node scripts/shopify-snapshot.ts <raw-dir | shopify-extract.json> <out.json> [era-extract.json]');
  process.exit(2);
}
const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

let snapshot;
if (statSync(inPath).isDirectory()) {
  const meta = json(join(inPath, 'meta.json'));
  const table = (f: string) => json(join(inPath, f)).data.shopifyqlQuery.tableData.rows as Record<string, string>[];
  const nodes: RawVariantNode[] = readdirSync(inPath).filter((f) => /^variants-p\d+\.json$/.test(f)).sort()
    .flatMap((f) => json(join(inPath, f)).data.productVariants.nodes);
  const raw: RawShopifyAnalytics = {
    shop: meta.shop, extractedAt: meta.extractedAt, inventoryAsOf: meta.inventoryAsOf, salesRange: meta.salesRange,
    dailyRows: table('daily-by-channel.json'), variantDailyRows: table('variant-daily.json'),
    variantNodes: nodes, customerWindows: meta.customerWindows,
  };
  const analytics = buildAnalytics(raw);
  const legacy = legacyExtract(raw, analytics, {
    sessions: meta.sessions, recentOrders: meta.recentOrders, returningCustomerRate90d: meta.returningCustomerRate90d, plan: meta.shop.plan,
  });
  snapshot = buildShopifySnapshot(legacy);
  snapshot = {
    ...snapshot, analytics,
    meta: { ...snapshot.meta, notes: [...(snapshot.meta?.notes ?? []), ...(meta.readNote ? [meta.readNote] : []), ...analytics.notes.map((n) => `Analytics: ${n}`)] },
  };
} else {
  snapshot = buildShopifySnapshot(json(inPath) as ShopifyExtract);
}
if (eraPath) snapshot = withEra(snapshot, json(eraPath) as EraExtract);
const file = toImportFile(snapshot);
const v = validateParkData(file);
if (!v.ok) {
  console.error('Snapshot failed import validation:\n' + v.errors.join('\n'));
  process.exit(1);
}
writeFileSync(outPath, JSON.stringify(file) + '\n');
console.log(`Wrote ${outPath}: ${file.products.length} products, ${file.days.length} days, ${file.orders.length} orders${file.analytics ? `, analytics: ${file.analytics.variants.length} variants, ${file.analytics.daily.length} day-channel rows, ${file.analytics.variantDaily.length} variant-day rows` : ''}${file.accounts ? `, ${file.accounts.length} bank/card accounts` : ''}.`);
for (const n of file.meta?.notes ?? []) console.log(`  · ${n}`);
