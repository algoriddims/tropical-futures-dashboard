// Build a park-data.json from a raw Shopify extract.
//
//   npx vite-node scripts/shopify-snapshot.ts <extract.json> <out.json>
//
// The extract is gathered read-only through the Shopify MCP (see
// docs/data/shopify-sync.md). Both files hold real business data: keep them
// in data/private/ (gitignored), never in the repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildShopifySnapshot, toImportFile } from '../src/game/shopify';
import type { ShopifyExtract } from '../src/game/shopify';
import { validateParkData } from '../src/game/validate';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: vite-node scripts/shopify-snapshot.ts <extract.json> <out.json>');
  process.exit(2);
}
const extract = JSON.parse(readFileSync(inPath, 'utf8')) as ShopifyExtract;
const file = toImportFile(buildShopifySnapshot(extract));
const v = validateParkData(file);
if (!v.ok) {
  console.error('Snapshot failed import validation:\n' + v.errors.join('\n'));
  process.exit(1);
}
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
console.log(`Wrote ${outPath}: ${file.products.length} products, ${file.days.length} days, ${file.orders.length} orders.`);
for (const n of file.meta?.notes ?? []) console.log(`  · ${n}`);
