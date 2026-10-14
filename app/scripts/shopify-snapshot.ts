// Build a park-data.json from a raw Shopify extract, optionally adding the
// business bank/card layer from an ERA extract.
//
//   npx vite-node scripts/shopify-snapshot.ts <shopify-extract.json> <out.json> [era-extract.json]
//
// The extract is gathered read-only through the Shopify MCP (see
// docs/data/shopify-sync.md). Both files hold real business data: keep them
// in data/private/ (gitignored), never in the repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildShopifySnapshot, toImportFile } from '../src/game/shopify';
import type { ShopifyExtract } from '../src/game/shopify';
import { validateParkData } from '../src/game/validate';
import { withEra } from '../src/game/era';
import type { EraExtract } from '../src/game/era';

const [inPath, outPath, eraPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: vite-node scripts/shopify-snapshot.ts <shopify-extract.json> <out.json> [era-extract.json]');
  process.exit(2);
}
const extract = JSON.parse(readFileSync(inPath, 'utf8')) as ShopifyExtract;
let snapshot = buildShopifySnapshot(extract);
if (eraPath) snapshot = withEra(snapshot, JSON.parse(readFileSync(eraPath, 'utf8')) as EraExtract);
const file = toImportFile(snapshot);
const v = validateParkData(file);
if (!v.ok) {
  console.error('Snapshot failed import validation:\n' + v.errors.join('\n'));
  process.exit(1);
}
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
console.log(`Wrote ${outPath}: ${file.products.length} products, ${file.days.length} days, ${file.orders.length} orders${file.accounts ? `, ${file.accounts.length} bank/card accounts, ${file.cashflow?.length ?? 0} months of cash flow` : ''}.`);
for (const n of file.meta?.notes ?? []) console.log(`  · ${n}`);
