// ── Sample dataset · Tropical Futures Institute ───────────────────────────
// Deterministic (seeded) so the board renders the same on every load.
// Replace via source.ts when wiring Shopify / Meta.

import type { ParkData, Product, Campaign, DayPoint, Order, Quest, PipelineItem, Channel, CostItem } from './types';

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const products: Product[] = [
  { id: 'p1', name: 'KEEP GOING 333 JERSEY',      drop: 'HOPECORE',        price: 88,  unitCost: 24, stock: 34,  startInventory: 220, sold7d: 61, soldPrev7d: 42, soldTotal: 186, published: true },
  { id: 'p2', name: 'I <3 DOLPHINS BABY TEE',     drop: 'DOLPHIN CLUB',    price: 45,  unitCost: 11, stock: 112, startInventory: 300, sold7d: 44, soldPrev7d: 51, soldTotal: 188, published: true },
  { id: 'p3', name: 'ARCHIPELAGO CAP · NAVY',     drop: 'ARCHIPELAGO',     price: 46,  unitCost: 13, stock: 0,   startInventory: 150, sold7d: 38, soldPrev7d: 22, soldTotal: 150, published: true },
  { id: 'p4', name: 'INHALER ZIPPER JERSEY',      drop: 'TROPICAL MARGINS', price: 118, unitCost: 38, stock: 58, startInventory: 140, sold7d: 19, soldPrev7d: 17, soldTotal: 82,  published: true },
  { id: 'p5', name: 'WATER DROPLET SARONG',       drop: 'DOLPHIN CLUB',    price: 56,  unitCost: 15, stock: 71,  startInventory: 120, sold7d: 8,  soldPrev7d: 9,  soldTotal: 49,  published: true },
  { id: 'p6', name: 'S*XBOMB BABY TEE',           drop: 'DOLPHIN CLUB',    price: 45,  unitCost: 11, stock: 4,   startInventory: 160, sold7d: 27, soldPrev7d: 30, soldTotal: 156, published: true },
  { id: 'p7', name: 'GODS FAVORITE TRUCKER',      drop: 'ARCHIVE',         price: 48,  unitCost: 14, stock: 203, startInventory: 400, sold7d: 3,  soldPrev7d: 4,  soldTotal: 197, published: true },
  { id: 'p8', name: 'PHILIPPINE LOVE SONGS L/S',  drop: 'ARCHIVE',         price: 65,  unitCost: 18, stock: 1,   startInventory: 60,  sold7d: 0,  soldPrev7d: 1,  soldTotal: 59,  published: false },
];

// Rides under construction — the production pipeline
const pipeline: PipelineItem[] = [
  { id: 'f1', name: 'MONSOON WINDBREAKER',        kind: 'JACKET', qty: 80, unitCost: 28, retail: 95, status: 'PRODUCTION', etaWeeks: 3, expectedSellThrough: 0.75 },
  { id: 'f2', name: 'TROPICAL DRAINER TEE',       kind: 'TEE',    qty: 50, unitCost: 12, retail: 45, status: 'SAMPLES',    etaWeeks: 5, expectedSellThrough: 0.8 },
  { id: 'f3', name: 'KEEP GOING 444 JERSEY',      kind: 'JERSEY', qty: 60, unitCost: 26, retail: 92, status: 'DESIGN',     etaWeeks: 8, expectedSellThrough: 0.7 },
  { id: 'f4', name: 'ARCHIPELAGO CAP · RESTOCK',  kind: 'CAP',    qty: 120, unitCost: 13, retail: 46, status: 'READY',      etaWeeks: 1, expectedSellThrough: 0.9 },
];

const channels: Channel[] = [
  {
    name: 'ONLINE STORE', location: 'WORLDWIDE', type: 'ONLINE', revenue: 11840, orders: 121, stock: [],
  },
  {
    name: 'TROPA', location: 'MANILA', type: 'STOCKIST', revenue: 1980, orders: 22,
    stock: [
      { productId: 'p1', allocated: 24, sold: 21 },
      { productId: 'p2', allocated: 30, sold: 18 },
      { productId: 'p3', allocated: 15, sold: 15 },
      { productId: 'p6', allocated: 20, sold: 17 },
    ],
  },
  {
    name: 'DOVER STREET MARKET', location: 'SINGAPORE', type: 'STOCKIST', revenue: 1420, orders: 11,
    stock: [
      { productId: 'p4', allocated: 12, sold: 9 },
      { productId: 'p1', allocated: 10, sold: 8 },
      { productId: 'p5', allocated: 10, sold: 2 },
    ],
  },
  {
    name: 'POP-UP · CEBU', location: 'PH', type: 'POPUP', revenue: 1150, orders: 16,
    stock: [
      { productId: 'p2', allocated: 40, sold: 31 },
      { productId: 'p7', allocated: 25, sold: 6 },
      { productId: 'p3', allocated: 20, sold: 12 },
    ],
  },
];

function buildDays(): DayPoint[] {
  const r = rng(260827);
  const days: DayPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const dropBoost = i <= 5 ? 1.65 : 1;
    const base = 950 + r() * 500 + (weekend ? 500 : 0);
    const revenue = Math.round(base * dropBoost * (0.85 + r() * 0.4));
    const orders = Math.max(6, Math.round(revenue / (88 + r() * 30)));
    const spend = Math.round((300 + r() * 160) * (i <= 5 ? 1.4 : 1));
    days.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      revenue, orders, spend,
    });
  }
  return days;
}

function buildOrders(): Order[] {
  const r = rng(77);
  const names = [
    'KEEP GOING 333 JERSEY / M', 'I <3 DOLPHINS BABY TEE / L', 'ARCHIPELAGO CAP', 'INHALER ZIPPER JERSEY / 32',
    'S*XBOMB BABY TEE / M', 'I <3 DOLPHINS BABY TEE / XL', 'KEEP GOING 333 JERSEY / XL',
    'WATER DROPLET SARONG', 'ARCHIPELAGO CAP · BROWN', 'KEEP GOING 333 JERSEY / S', 'S*XBOMB BABY TEE / L',
  ];
  const prices = [88, 45, 46, 118, 45, 45, 88, 56, 46, 88, 45];
  const orders: Order[] = [];
  let h = 23, m = 58;
  for (let i = 0; i < 42; i++) {
    const idx = Math.floor(r() * names.length);
    const bundle = r() > 0.82 ? 2 : 1;
    const value = prices[idx] * bundle + (r() > 0.9 ? 46 : 0);
    orders.push({
      id: `#${1042 - i}`,
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      label: names[idx] + (bundle > 1 ? ' ×2' : ''),
      value,
      returning: r() > 0.66,
    });
    m -= Math.floor(r() * 22) + 6;
    if (m < 0) { m += 60; h -= 1; }
    if (h < 6) h = 6;
  }
  return orders;
}

const campaigns: Campaign[] = [
  { id: 'c1', name: 'HOPECORE DROP — PROSPECTING / ASC', status: 'ACTIVE', spend: 1820, revenue: 6180, clicks: 2410, impressions: 311000, frequency: 1.8, dailySpend: [98, 104, 121, 110, 132, 128, 141, 136, 152, 148, 139, 145, 151, 155] },
  { id: 'c2', name: 'RETARGETING — CART + PDP 30D',      status: 'ACTIVE', spend: 640,  revenue: 3710, clicks: 1180, impressions: 96000,  frequency: 3.4, dailySpend: [41, 38, 44, 47, 45, 49, 46, 43, 48, 50, 47, 49, 46, 47] },
  { id: 'c3', name: 'ARCHIVE CLEARANCE — BROAD',         status: 'ACTIVE', spend: 480,  revenue: 530,  clicks: 890,  impressions: 142000, frequency: 4.9, dailySpend: [31, 33, 36, 34, 35, 38, 37, 36, 35, 34, 33, 32, 34, 32] },
  { id: 'c4', name: 'DOLPHIN CLUB — TEASER',             status: 'PAUSED', spend: 210,  revenue: 180,  clicks: 320,  impressions: 51000,  frequency: 2.1, dailySpend: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15] },
];

const quests: Quest[] = [
  { id: 'q1', scenario: 'ARCHIPELAGO SCENARIO', goal: 'SELL OUT ARCHIPELAGO CAP', unit: 'UNITS', target: 150, current: 150, daysLeft: 0, reward: 'GOLDEN PALM' },
  { id: 'q2', scenario: 'AUGUST SCENARIO',      goal: 'NET REVENUE',              unit: 'USD',   target: 40000, current: 31240, daysLeft: 4, reward: 'MONSOON FOUNTAIN' },
  { id: 'q3', scenario: 'EFFICIENCY SCENARIO',  goal: 'HOLD BLENDED ROAS ABOVE',  unit: 'ROAS', target: 3, current: 3.4, daysLeft: 9, reward: 'DOLPHIN MASCOT' },
];

// Recurring + one-off costs. Production runs also appear in the pipeline;
// here they're recorded as money spent.
const costs: CostItem[] = [
  { id: 'k1',  name: 'SHOPIFY PLUS PLAN',        category: 'SUBSCRIPTION', amount: 39,   cadence: 'MONTHLY', active: true },
  { id: 'k2',  name: 'KLAVIYO EMAIL/SMS',        category: 'SUBSCRIPTION', amount: 150,  cadence: 'MONTHLY', active: true },
  { id: 'k3',  name: 'ADOBE CC',                 category: 'SUBSCRIPTION', amount: 70,   cadence: 'MONTHLY', active: true },
  { id: 'k4',  name: 'CANVA PRO',                category: 'SUBSCRIPTION', amount: 15,   cadence: 'MONTHLY', active: true },
  { id: 'k5',  name: 'SHIPSTATION',              category: 'SUBSCRIPTION', amount: 30,   cadence: 'MONTHLY', active: true },
  { id: 'k6',  name: 'LOOM + NOTION + GSUITE',   category: 'SUBSCRIPTION', amount: 42,   cadence: 'MONTHLY', active: true },
  { id: 'k7',  name: 'PHOTOSHOP GENERATIVE CREDITS', category: 'SUBSCRIPTION', amount: 25, cadence: 'MONTHLY', active: false, note: 'trial ended' },
  { id: 'k8',  name: 'FOUNDER DRAW',             category: 'PAYROLL',      amount: 2000, cadence: 'MONTHLY', active: true },
  { id: 'k9',  name: 'FULFILLMENT · PART-TIME',  category: 'PAYROLL',      amount: 800,  cadence: 'MONTHLY', active: true },
  { id: 'k10', name: 'DESIGN CONTRACTOR',        category: 'PAYROLL',      amount: 1200, cadence: 'MONTHLY', active: true },
  { id: 'k11', name: 'ARCHIPELAGO CAP RESTOCK RUN', category: 'PRODUCTION', amount: 1560, cadence: 'ONE-OFF', active: true, note: '120 units · delivered' },
  { id: 'k12', name: 'MONSOON WINDBREAKER RUN',  category: 'PRODUCTION',   amount: 2240, cadence: 'ONE-OFF', active: true, note: '80 units · in production' },
  { id: 'k13', name: 'STUDIO RENT · CEBU',       category: 'OPS',          amount: 650,  cadence: 'MONTHLY', active: true },
  { id: 'k14', name: 'UTILITIES + INTERNET',     category: 'OPS',          amount: 110,  cadence: 'MONTHLY', active: true },
  { id: 'k15', name: 'SAMPLES + COURIER',        category: 'OPS',          amount: 180,  cadence: 'MONTHLY', active: true },
];

export const fixtureData: ParkData = {
  products,
  pipeline,
  channels,
  orders: buildOrders(),
  campaigns,
  days: buildDays(),
  quests,
  costs,
  bankBalance: 23480,
  repeatRate: 0.34,
  refundRate: 0.031,
  guestsToday: 486,
  grossMargin: 0.62,
  targetRoas: 3.0,
  growthTargetPct: 25,
  wholesalePct: 0.6,
  nextDrop: { name: 'MONSOON PACK', date: '2026-09-12' },
  annualBudget: 72000,
};
