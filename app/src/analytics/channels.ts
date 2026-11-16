// ── Channel mapping ───────────────────────────────────────────────────────
// Explicit map from Shopify sales-channel names to reporting groups. Anything
// not listed is UNMAPPED and stays visible in every total and table — it is
// never silently dropped or guessed into DTC or wholesale.

export type ChannelGroup = 'DTC' | 'WHOLESALE' | 'UNMAPPED';

/** Decided 14 Oct 2026. Change only with the owner; see docs/metrics.md#channels. */
export const CHANNEL_MAP: Record<string, ChannelGroup> = {
  'Online Store': 'DTC',
  'Facebook & Instagram': 'DTC',
  // 'Draft Orders' is deliberately unmapped: on this store they have been
  // 100%-discounted multi-unit orders (possibly wholesale, consignment or
  // gifting). The owner decides; until then they stay visible as unmapped.
  // 'Shopify Claude Connector App' — unknown purpose; unmapped.
};

export const channelGroup = (channel: string, map: Record<string, ChannelGroup> = CHANNEL_MAP): ChannelGroup =>
  map[channel] ?? 'UNMAPPED';

export type ChannelFilter = 'ALL' | ChannelGroup;

export const matchesChannel = (channel: string, filter: ChannelFilter, map: Record<string, ChannelGroup> = CHANNEL_MAP) =>
  filter === 'ALL' || channelGroup(channel, map) === filter;

// ── Wholesale de-duplication ───────────────────────────────────────────────
// When an external wholesale sheet is connected, an order may also exist in
// Shopify (e.g. a draft order). A sheet row that references a Shopify order
// already counted is excluded, and repeated imports of the same sheet row
// (same id) count once.

export interface WholesaleRow {
  id: string;                     // stable row id from the sheet
  shopifyOrderName?: string | null; // e.g. "#2025-2044" when the order was also entered in Shopify
  account: string;
  invoicedMinor: number | null;
  currency: string;
}

export function dedupeWholesale(rows: WholesaleRow[], shopifyOrderNames: Iterable<string>): { kept: WholesaleRow[]; duplicates: { row: WholesaleRow; reason: string }[] } {
  const inShopify = new Set(shopifyOrderNames);
  const seen = new Set<string>();
  const kept: WholesaleRow[] = [];
  const duplicates: { row: WholesaleRow; reason: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) { duplicates.push({ row: r, reason: `row ${r.id} imported more than once` }); continue; }
    seen.add(r.id);
    if (r.shopifyOrderName && inShopify.has(r.shopifyOrderName)) {
      duplicates.push({ row: r, reason: `already counted in Shopify as ${r.shopifyOrderName}` });
      continue;
    }
    kept.push(r);
  }
  return { kept, duplicates };
}
