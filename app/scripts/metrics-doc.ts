// Regenerate docs/metrics.md from src/analytics/dictionary.ts.
//   npx vite-node scripts/metrics-doc.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { metricsMarkdown } from '../src/analytics/dictionary';

const out = resolve(__dirname, '../../docs/metrics.md');
writeFileSync(out, metricsMarkdown());
console.log(`wrote ${out}`);
