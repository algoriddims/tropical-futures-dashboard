// Validation for the snapshot's `analytics` block. Imported snapshots are
// checked in full before they can replace the last good one.
import { z } from 'zod';

// No eval (the hosted page's CSP forbids it). Set here too because this
// module builds its schemas before validate.ts runs.
z.config({ jitless: true });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date-time');
const minor = z.number().int('money must be integer minor units');
const count = z.number().int();

const measures = {
  grossSales: minor, discounts: minor, returns: minor, netSales: minor,
  cogs: minor.nullable(), netSalesWithCost: minor,
  qtyOrdered: count, qtyReturned: count, netItems: count,
};

export const analyticsSchema = z.object({
  version: z.literal(1),
  source: z.literal('shopify'),
  shop: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code'),
  timezone: z.string().nullable(),
  extractedAt: iso,
  inventoryAsOf: iso,
  salesCoverage: z.object({ from: ymd, to: ymd, missing: z.array(ymd) }),
  daily: z.array(z.object({ date: ymd, channel: z.string().min(1), orders: count, ...measures })),
  variantDaily: z.array(z.object({ date: ymd, channel: z.string().min(1), productId: z.string().min(1), variantId: z.string().min(1), ...measures })),
  variants: z.array(z.object({
    variantId: z.string().min(1), productId: z.string().min(1), productTitle: z.string(), productType: z.string(),
    variantTitle: z.string(), sku: z.string().nullable(),
    options: z.array(z.object({ name: z.string(), value: z.string() })),
    price: minor, unitCost: minor.nullable(),
    productCreatedAt: iso, productPublishedAt: iso.nullable(),
    tracked: z.boolean(), isBundle: z.boolean(),
    inventory: z.array(z.object({
      locationId: z.string(), locationName: z.string(),
      available: count, onHand: count, committed: count, incoming: count, reserved: count, unavailable: count,
    })),
  })),
  customers: z.array(z.object({ from: ymd, to: ymd, channel: z.string(), customers: count, returningCustomers: count, orders: count })),
  notes: z.array(z.string()),
}).superRefine((a, ctx) => {
  // stable-id uniqueness and no duplicate records (repeated imports must not double count)
  const dup = <T,>(rows: T[], key: (r: T) => string, path: string) => {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const k = key(r);
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [path, i], message: `duplicate record ${k}` });
      seen.add(k);
    });
  };
  dup(a.daily, (r) => `${r.date}|${r.channel}`, 'daily');
  dup(a.variantDaily, (r) => `${r.date}|${r.channel}|${r.variantId}`, 'variantDaily');
  dup(a.variants, (r) => r.variantId, 'variants');
});
