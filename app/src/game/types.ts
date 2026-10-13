// ── Tropical Futures Terminal · domain model ──────────────────────────────
// The RCT metaphor is conceptual: the brand is the park, products are rides,
// pipeline products are rides under construction. No literal park scene.

export type Tier = 'red' | 'amber' | 'green';
export type RideState = 'THRIVING' | 'NORMAL' | 'QUIET' | 'BROKEN' | 'CLOSED';

export interface Product {
  id: string;
  name: string;
  drop: string;            // collection / drop name
  price: number;           // retail
  unitCost: number;        // production cost per unit
  stock: number;
  startInventory: number;
  sold7d: number;
  soldPrev7d: number;
  soldTotal: number;
  published: boolean;
}

export interface PipelineItem {
  id: string;
  name: string;            // "upcoming ride"
  kind: string;            // TEE / CAP / JERSEY...
  qty: number;             // units being produced
  unitCost: number;        // production cost per unit
  retail: number;          // planned retail price
  status: 'DESIGN' | 'SAMPLES' | 'PRODUCTION' | 'READY';
  etaWeeks: number;
  expectedSellThrough: number; // 0..1 based on comparable products
}

export interface ChannelStock {
  productId: string;
  allocated: number;       // units sent to this location
  sold: number;            // units sold through this location
}

export interface Channel {
  name: string;            // ONLINE STORE / stockist / pop-up
  location: string;
  type: 'ONLINE' | 'STOCKIST' | 'POPUP';
  revenue: number;         // selected period
  orders: number;
  stock: ChannelStock[];   // per-product allocation (empty for ONLINE — derived from products)
}

export interface Order {
  id: string;
  time: string;
  label: string;
  value: number;
  returning: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  frequency: number;
  dailySpend: number[];
}

export interface DayPoint {
  date: string;
  revenue: number;
  orders: number;
  spend: number;
}

export interface Quest {
  id: string;
  scenario: string;
  goal: string;
  unit: string;
  target: number;
  current: number;
  daysLeft: number;
  reward: string;
}

export type CostCategory = 'SUBSCRIPTION' | 'PAYROLL' | 'PRODUCTION' | 'OPS';

export interface CostItem {
  id: string;
  name: string;
  category: CostCategory;
  amount: number;          // per cadence
  cadence: 'MONTHLY' | 'WEEKLY' | 'ONE-OFF';
  active: boolean;
  note?: string;
}

export interface Notice {
  id: string;
  tier: Tier;
  source: 'SHOP' | 'ADS' | 'PARK';
  text: string;
  detail: string;
  time: string;
  desk: string;
}

export interface ParkData {
  products: Product[];
  pipeline: PipelineItem[];
  channels: Channel[];
  orders: Order[];
  campaigns: Campaign[];
  days: DayPoint[];
  quests: Quest[];
  costs: CostItem[];
  bankBalance: number;     // current bank account (manual entry until a feed exists)
  repeatRate: number;
  refundRate: number;
  guestsToday: number;
  grossMargin: number;
  targetRoas: number;
  growthTargetPct: number; // planning input: next production run's retail growth vs current pipeline
  wholesalePct: number;    // planning input: fraction of retail a stockist pays per sold unit (e.g. 0.6)
  nextDrop: { name: string; date: string } | null; // planning input: ISO date of the next drop
  annualBudget: number;    // planning input: 0 = unset; monthly allowance = budget ÷ 12
}
