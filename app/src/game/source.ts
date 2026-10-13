// ── DataSource adapter ────────────────────────────────────────────────────
// The terminal renders ONLY through this interface. Today it's fixtures;
// to go live, implement the same interface against your sources and swap
// the export in TerminalContext:
//
//   ShopifyAdminSource  — GET /admin/api/2026-01/orders.json, products.json,
//                         inventory_levels.json (or your Shopify MCP server)
//   MetaMarketingSource — GET /act_<id>/insights?level=campaign
//                         (or your Meta Ads MCP server)
//
// Both should run through a tiny proxy/server (tokens must never ship in the
// frontend bundle). See PRD §7 for the full integration contract.

import type { ParkData } from './types';
import { fixtureData } from './fixtures';

// Freshness is not a property of the source object: it comes from the
// snapshot's own dates (ParkData.meta) — see freshness.ts.
export interface DataSource {
  readonly name: string;
  load(): Promise<ParkData>;
}

export class FixtureSource implements DataSource {
  readonly name = 'SAMPLE DATA';
  async load(): Promise<ParkData> {
    return fixtureData;
  }
}
