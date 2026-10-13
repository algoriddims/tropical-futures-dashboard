// ── Game rules engine ─────────────────────────────────────────────────────
// Pure functions over ParkData. Thresholds and formulas live here so they
// can be tuned without touching UI.

import type { ParkData, Product, Notice, Campaign, PipelineItem, Channel, CostItem, CostCategory, Tier } from './types';

export type RideState = 'THRIVING' | 'NORMAL' | 'QUIET' | 'BROKEN' | 'CLOSED';

export interface Metrics {
  revenue: number;
  orders: number;
  aov: number;
  spend: number;
  roas: number;
  mer: number;
  breakEvenRoas: number;
  guests: number;
  conversionRate: number;
  rating: number;
  ratingBand: string;
  ratingParts: { label: string; score: number; weight: number; note: string }[];
  revenueDeltaPct: number;
  inventoryUnits: number;
  inventoryCost: number;
  inventoryRetail: number;
  overallSellThrough: number;
  pipelineUnits: number;
  pipelineCost: number;
  pipelineGross: number;
  pipelineNet: number;
}

export function sellThrough(p: Product): number {
  return p.soldTotal / (p.soldTotal + p.stock);
}

export function dailyVelocity(p: Product): number {
  return p.sold7d / 7;
}

export function daysOfStock(p: Product): number {
  const v = dailyVelocity(p);
  return v <= 0 ? Infinity : p.stock / v;
}

export function rideState(p: Product): RideState {
  if (!p.published) return 'CLOSED';
  if (p.stock === 0) return 'BROKEN';
  const v = dailyVelocity(p);
  const prev = p.soldPrev7d / 7;
  if (v >= prev * 1.25 && sellThrough(p) > 0.25) return 'THRIVING';
  if (v < 0.5) return 'QUIET';
  return 'NORMAL';
}

// Cost math — everything normalized to a monthly figure.
export function monthlyAmount(c: CostItem): number {
  if (!c.active) return 0;
  if (c.cadence === 'WEEKLY') return c.amount * 4.33;
  if (c.cadence === 'ONE-OFF') return 0; // one-offs tracked separately
  return c.amount;
}

export function monthlyBurn(d: ParkData): number {
  return d.costs.reduce((s, c) => s + monthlyAmount(c), 0);
}

export function oneOffCosts(d: ParkData): number {
  return d.costs.filter((c) => c.active && c.cadence === 'ONE-OFF').reduce((s, c) => s + c.amount, 0);
}

export function burnByCategory(d: ParkData): { category: CostCategory; monthly: number; count: number }[] {
  const cats: CostCategory[] = ['SUBSCRIPTION', 'PAYROLL', 'PRODUCTION', 'OPS'];
  return cats.map((category) => {
    const items = d.costs.filter((c) => c.category === category && c.active);
    return {
      category,
      // production one-offs are amortized into the month they land
      monthly: items.reduce((s, c) => s + (c.cadence === 'ONE-OFF' ? c.amount : monthlyAmount(c)), 0),
      count: items.length,
    };
  });
}

export function runwayMonths(d: ParkData): number {
  const burn = monthlyBurn(d);
  return burn > 0 ? d.bankBalance / burn : Infinity;
}

// Planning baseline: always trailing 30 days, regardless of which range the
// UI is viewing. Viewing a hot drop week should not inflate a 6-month plan.
export function trailing30dRevenue(d: ParkData): number {
  return d.days.slice(-30).reduce((s, x) => s + x.revenue, 0);
}

// Whole days until an ISO date (negative once passed).
export function daysUntil(isoDate: string): number {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - t.getTime()) / 86400000);
}

// Channel (store location) stock math. ONLINE derives from the products list;
// stockists/pop-ups carry their own per-product allocations.
export interface ChannelStats {
  onHand: number;
  soldUnits: number;
  allocated: number;
  sellThrough: number;     // 0..1
  retailValue: number;     // on-hand at retail
  rows: { product: Product; allocated: number; sold: number; onHand: number; sellThrough: number }[];
}

export function channelStats(c: Channel, products: Product[]): ChannelStats {
  if (c.type === 'ONLINE') {
    const rows = products
      .filter((p) => p.published)
      .map((p) => ({ product: p, allocated: p.startInventory, sold: p.soldTotal, onHand: p.stock, sellThrough: sellThrough(p) }));
    const onHand = rows.reduce((s, r) => s + r.onHand, 0);
    const soldUnits = rows.reduce((s, r) => s + r.sold, 0);
    return {
      onHand, soldUnits,
      allocated: rows.reduce((s, r) => s + r.allocated, 0),
      sellThrough: soldUnits / (soldUnits + onHand || 1),
      retailValue: rows.reduce((s, r) => s + r.onHand * r.product.price, 0),
      rows,
    };
  }
  const rows = c.stock.map((s) => {
    const product = products.find((p) => p.id === s.productId);
    if (!product) return null;
    return {
      product,
      allocated: s.allocated,
      sold: s.sold,
      onHand: s.allocated - s.sold,
      sellThrough: s.allocated > 0 ? s.sold / s.allocated : 0,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  const onHand = rows.reduce((s, r) => s + r.onHand, 0);
  const soldUnits = rows.reduce((s, r) => s + r.sold, 0);
  return {
    onHand, soldUnits,
    allocated: rows.reduce((s, r) => s + r.allocated, 0),
    sellThrough: soldUnits / (soldUnits + onHand || 1),
    retailValue: rows.reduce((s, r) => s + r.onHand * r.product.price, 0),
    rows,
  };
}

// Pipeline economics
export function pipelineGross(i: PipelineItem): number { return i.qty * i.retail; }
export function pipelineCost(i: PipelineItem): number { return i.qty * i.unitCost; }
export function pipelineNet(i: PipelineItem): number { return pipelineGross(i) - pipelineCost(i); }
export function pipelineMargin(i: PipelineItem): number { return (i.retail - i.unitCost) / i.retail; }
// expected profit if it performs like comparable products
export function pipelineExpectedNet(i: PipelineItem): number {
  const sold = Math.round(i.qty * i.expectedSellThrough);
  return sold * i.retail - pipelineCost(i);
}

export function computeMetrics(d: ParkData, rangeDays: number): Metrics {
  const days = d.days.slice(-rangeDays);
  const prev = d.days.slice(-rangeDays * 2, -rangeDays);
  const revenue = days.reduce((s, x) => s + x.revenue, 0);
  const orders = days.reduce((s, x) => s + x.orders, 0);
  const spend = days.reduce((s, x) => s + x.spend, 0);
  const prevRevenue = prev.reduce((s, x) => s + x.revenue, 0) || 1;

  const attrRevenue = d.campaigns.reduce((s, c) => s + c.revenue, 0);
  const campSpend = d.campaigns.reduce((s, c) => s + c.spend, 0);
  const roas = campSpend > 0 ? attrRevenue / campSpend : 0;
  const mer = spend > 0 ? revenue / spend : 0;
  const breakEvenRoas = 1 / d.grossMargin;

  const guests = Math.round(d.guestsToday * (rangeDays === 1 ? 1 : rangeDays * 0.82));

  const inventoryUnits = d.products.reduce((s, p) => s + p.stock, 0);
  const inventoryCost = d.products.reduce((s, p) => s + p.stock * p.unitCost, 0);
  const inventoryRetail = d.products.reduce((s, p) => s + p.stock * p.price, 0);
  const totalSold = d.products.reduce((s, p) => s + p.soldTotal, 0);
  const overallSellThrough = totalSold / (totalSold + inventoryUnits || 1);

  const ratingParts = buildRating(d, { revenue, prevRevenue, roas, breakEvenRoas });
  const rating = Math.round(ratingParts.reduce((s, p) => s + p.score * p.weight, 0));

  return {
    revenue, orders,
    aov: orders > 0 ? revenue / orders : 0,
    spend, roas, mer, breakEvenRoas,
    guests,
    conversionRate: guests > 0 ? (orders / guests) * 100 : 0,
    rating,
    ratingBand: bandFor(rating),
    ratingParts,
    revenueDeltaPct: ((revenue - prevRevenue) / prevRevenue) * 100,
    inventoryUnits, inventoryCost, inventoryRetail, overallSellThrough,
    pipelineUnits: d.pipeline.reduce((s, i) => s + i.qty, 0),
    pipelineCost: d.pipeline.reduce((s, i) => s + pipelineCost(i), 0),
    pipelineGross: d.pipeline.reduce((s, i) => s + pipelineGross(i), 0),
    pipelineNet: d.pipeline.reduce((s, i) => s + pipelineNet(i), 0),
  };
}

function bandFor(r: number): string {
  if (r < 200) return 'DERELICT';
  if (r < 400) return 'ROADSIDE ATTRACTION';
  if (r < 600) return 'LOCAL FAVORITE';
  if (r < 800) return 'DESTINATION PARK';
  return 'HYPE PARK';
}

// Park Rating, 0–1000. Each component scores 0..100, weights sum to 10.
function buildRating(
  d: ParkData,
  ctx: { revenue: number; prevRevenue: number; roas: number; breakEvenRoas: number },
) {
  const momentum = clamp(((ctx.revenue / ctx.prevRevenue) - 0.7) / 0.6, 0, 1) * 100;

  const live = d.products.filter((p) => p.published);
  const healthy = live.filter((p) => p.stock > 0 && dailyVelocity(p) > 0.3);
  const rideHealth = live.length ? (healthy.length / live.length) * 100 : 0;

  const marketing = clamp((ctx.roas - ctx.breakEvenRoas * 0.6) / (d.targetRoas - ctx.breakEvenRoas * 0.6), 0, 1) * 100;

  const happiness = clamp((1 - d.refundRate * 8) * 0.6 + d.repeatRate * 1.1 * 0.4, 0, 1) * 100;

  const active = d.quests.filter((q) => q.daysLeft > 0);
  const questPace = active.length
    ? clamp(active.reduce((s, q) => s + q.current / q.target, 0) / active.length / 0.8, 0, 1) * 100
    : 70;

  const dead = live.filter((p) => dailyVelocity(p) < 0.5 && p.stock > 20).length;
  const stockouts = live.filter((p) => p.stock === 0).length;
  const discipline = clamp(1 - dead * 0.18 - stockouts * 0.25, 0, 1) * 100;

  return [
    { label: 'SALES MOMENTUM', score: momentum, weight: 2.5, note: 'revenue vs trailing baseline' },
    { label: 'RIDE HEALTH', score: rideHealth, weight: 2.0, note: 'products in stock + selling' },
    { label: 'MARKETING EFFICIENCY', score: marketing, weight: 2.0, note: `roas vs break-even ${ctx.breakEvenRoas.toFixed(2)}` },
    { label: 'GUEST HAPPINESS', score: happiness, weight: 1.5, note: 'refunds ↓ · repeat customers ↑' },
    { label: 'QUEST PACE', score: questPace, weight: 1.0, note: 'active scenario progress' },
    { label: 'INVENTORY DISCIPLINE', score: discipline, weight: 1.0, note: 'dead stock ↓ · stockouts ↓' },
  ];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function campaignVerdict(c: Campaign, breakEvenRoas: number, targetRoas: number): { label: string; tier: 'red' | 'amber' | 'green' } {
  if (c.status === 'PAUSED') return { label: 'IDLE', tier: 'amber' };
  const roas = c.spend > 0 ? c.revenue / c.spend : 0;
  if (roas < breakEvenRoas) return { label: 'MONEY PIT', tier: 'red' };
  if (roas >= targetRoas) return { label: 'SCALE ME', tier: 'green' };
  return { label: 'HOLD', tier: 'amber' };
}

// ── Cash-flow forecast ────────────────────────────────────────────────────
// 6-month forward projection in cash terms: customer revenue in, burn +
// production out. Convention: runs in PRODUCTION/READY are already committed
// (they exist as ONE-OFF cost lines, paid this month); DESIGN/SAMPLES runs
// are committed — and paid — at their ETA month. Expected sell-through
// revenue lands the month after stock arrives.

// Money stockists owe for units already sold on their shelves —
// sold units × retail × wholesale cut, per stockist.
export function stockistOwed(d: ParkData): { name: string; amount: number }[] {
  return d.channels
    .filter((c) => c.type !== 'ONLINE')
    .map((c) => ({
      name: c.name,
      amount: Math.round(
        c.stock.reduce((s, r) => {
          const p = d.products.find((x) => x.id === r.productId);
          return p ? s + r.sold * p.price * d.wholesalePct : s;
        }, 0),
      ),
    }))
    .filter((x) => x.amount > 0);
}

export function totalStockistOwed(d: ParkData): number {
  return stockistOwed(d).reduce((s, x) => s + x.amount, 0);
}

// Ongoing wholesale income: stockist register sales (trailing 30d channel
// revenue) × the wholesale cut — what shelves keep paying if pace holds.
export function stockistMonthlyPace(d: ParkData): number {
  return Math.round(
    d.channels
      .filter((c) => c.type !== 'ONLINE')
      .reduce((s, c) => s + c.revenue, 0) * d.wholesalePct,
  );
}

export interface ForecastEvent { text: string; amount: number; }

export interface ForecastMonth {
  label: string;
  opening: number;
  baselineIn: number;
  pipelineIn: number;
  receivableIn: number; // stockist payouts collected (month 1) then wholesale pace (month 2+)
  burnOut: number;
  productionOut: number;
  net: number;
  closing: number;
  events: ForecastEvent[];
}

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function etaMonthIndex(i: PipelineItem): number {
  return Math.max(1, Math.ceil(i.etaWeeks / 4.33));
}

export function forecastCashflow(d: ParkData, monthlyRevenue: number, months = 6): ForecastMonth[] {
  const burn = monthlyBurn(d);
  const committed = d.costs.filter((c) => c.active && c.cadence === 'ONE-OFF');
  const uncommitted = d.pipeline.filter((i) => i.status === 'DESIGN' || i.status === 'SAMPLES');
  const now = new Date();
  const out: ForecastMonth[] = [];
  let bank = d.bankBalance;
  for (let m = 1; m <= months; m++) {
    const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const label = `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
    const events: ForecastEvent[] = [];
    let productionOut = 0;
    if (m === 1) {
      for (const c of committed) {
        productionOut += c.amount;
        events.push({ text: `${c.name} PAID`, amount: -c.amount });
      }
    }
    for (const i of uncommitted) {
      if (etaMonthIndex(i) === m) {
        const cost = pipelineCost(i);
        productionOut += cost;
        events.push({ text: `${i.name} RUN COMMITTED`, amount: -cost });
      }
    }
    let pipelineIn = 0;
    for (const i of d.pipeline) {
      if (etaMonthIndex(i) + 1 === m) {
        const rev = Math.round(i.qty * i.retail * i.expectedSellThrough);
        pipelineIn += rev;
        events.push({ text: `${i.name} REVENUE @ ${Math.round(i.expectedSellThrough * 100)}% SELL-THRU`, amount: rev });
      }
    }
    let receivableIn = 0;
    if (m === 1) {
      receivableIn = totalStockistOwed(d);
      if (receivableIn > 0) {
        events.push({ text: 'STOCKIST PAYOUTS COLLECTED', amount: receivableIn });
      }
    } else {
      receivableIn = stockistMonthlyPace(d);
      if (receivableIn > 0) {
        events.push({ text: 'STOCKIST WHOLESALE PACE', amount: receivableIn });
      }
    }
    const net = monthlyRevenue + pipelineIn + receivableIn - burn - productionOut;
    const closing = bank + net;
    out.push({ label, opening: bank, baselineIn: monthlyRevenue, pipelineIn, receivableIn, burnOut: burn, productionOut, net, closing, events });
    bank = closing;
  }
  return out;
}

export function forecastVerdict(fc: ForecastMonth[]): { tone: 'red' | 'amber' | 'green'; text: string } {
  const dip = fc.find((m) => m.closing < 0);
  if (dip) {
    return { tone: 'red', text: `GOES NEGATIVE IN ${dip.label} — $${Math.abs(Math.round(dip.closing)).toLocaleString()} SHORT` };
  }
  const low = fc.reduce((min, m) => (m.closing < min.closing ? m : min), fc[0]);
  if (low.closing < fc[0].opening * 0.5) {
    return { tone: 'amber', text: `LOW POINT $${Math.round(low.closing).toLocaleString()} IN ${low.label}` };
  }
  return { tone: 'green', text: `SELF-FUNDING — LOW POINT $${Math.round(low.closing).toLocaleString()} IN ${low.label}` };
}

// Notification rules — red = act now, amber = notable, green = context
export function buildNotices(d: ParkData, m: Metrics): Notice[] {
  const out: Notice[] = [];
  let n = 0;
  const push = (tier: Notice['tier'], source: Notice['source'], text: string, detail: string, desk: string, time: string) =>
    out.push({ id: `n${n++}`, tier, source, text, detail, desk, time });

  for (const p of d.products) {
    if (p.published && p.stock === 0) {
      push('red', 'SHOP', `${p.name} SOLD OUT — RIDE IS BROKEN`, `Sold ${p.soldTotal} units. Restock or guests leave the queue.`, 'i', '07:12');
    } else if (p.published && daysOfStock(p) < 5 && dailyVelocity(p) > 1) {
      push('amber', 'SHOP', `${p.name} STOCKOUT RISK — ${Math.floor(daysOfStock(p))} DAYS LEFT`, `${p.stock} units at ${dailyVelocity(p).toFixed(1)}/day velocity.`, 'i', '06:48');
    }
  }

  for (const c of d.campaigns) {
    const v = campaignVerdict(c, m.breakEvenRoas, d.targetRoas);
    if (v.tier === 'red') {
      push('red', 'ADS', `${c.name} BELOW BREAK-EVEN`, `ROAS ${(c.revenue / c.spend).toFixed(2)} vs break-even ${m.breakEvenRoas.toFixed(2)}. $${c.spend.toLocaleString()} spent this period.`, 'a', '05:30');
    }
    if (c.frequency > 4.5) {
      push('amber', 'ADS', `${c.name} AUDIENCE FATIGUE`, `Frequency ${c.frequency.toFixed(1)} — creative is wearing out.`, 'a', '05:30');
    }
  }

  for (const p of d.products) {
    const prev = p.soldPrev7d / 7;
    const v = dailyVelocity(p);
    if (prev > 1 && v > prev * 1.4) {
      push('green', 'SHOP', `${p.name} VELOCITY +${Math.round((v / prev - 1) * 100)}% WoW`, 'Guests are queuing for this ride.', 'i', '08:02');
    }
  }

  for (const i of d.pipeline) {
    if (i.status === 'READY') {
      push('green', 'PARK', `NEW RIDE READY TO OPEN: ${i.name}`, `${i.qty} units · $${pipelineNet(i).toLocaleString()} net potential. List it on the shop.`, 'p', '08:30');
    }
  }

  // store location stock rules
  for (const c of d.channels) {
    if (c.type === 'ONLINE') continue;
    const st = channelStats(c, d.products);
    for (const r of st.rows) {
      if (r.sellThrough >= 0.85 && r.allocated >= 10) {
        push('green', 'SHOP', `${c.name}: ${r.product.name} NEARLY SOLD THROUGH`, `${r.sold}/${r.allocated} units sold — ship a restock while it's hot.`, 'l', '07:40');
      } else if (r.onHand >= 15 && r.sellThrough < 0.3) {
        push('amber', 'SHOP', `${c.name}: ${r.product.name} SITTING ON SHELF`, `${r.onHand} units on hand, ${Math.round(r.sellThrough * 100)}% sold. Swap the display or pull stock back.`, 'l', '07:45');
      }
    }
  }

  for (const q of d.quests) {
    if (q.current >= q.target) {
      push('green', 'PARK', `QUEST COMPLETE: ${q.goal}`, `Reward unlocked — ${q.reward}.`, 's', '09:00');
    } else if (q.daysLeft <= 3 && q.current / q.target < 0.85) {
      push('amber', 'PARK', `QUEST AT RISK: ${q.goal}`, `${Math.round((q.current / q.target) * 100)}% with ${q.daysLeft} days left.`, 's', '09:00');
    }
  }

  if (m.revenueDeltaPct > 10) {
    push('green', 'PARK', `REVENUE +${m.revenueDeltaPct.toFixed(0)}% VS PREVIOUS PERIOD`, 'Park cash is climbing.', 's', '09:01');
  }

  // cost / runway rules
  const runway = runwayMonths(d);
  const burn = monthlyBurn(d);
  if (runway < 6) {
    push('red', 'PARK', `RUNWAY ${runway.toFixed(1)} MONTHS`, `Monthly burn $${burn.toLocaleString()} against $${d.bankBalance.toLocaleString()} in the bank. Cut costs or move units.`, 'c', '06:00');
  } else if (runway < 12) {
    push('amber', 'PARK', `RUNWAY ${runway.toFixed(1)} MONTHS`, `Monthly burn $${burn.toLocaleString()}. Comfortable, but watch the founder draw.`, 'c', '06:00');
  }
  const subs = d.costs.filter((c) => c.category === 'SUBSCRIPTION');
  const inactiveSubs = subs.filter((c) => !c.active);
  for (const s of inactiveSubs) {
    push('green', 'PARK', `PAUSED SUBSCRIPTION: ${s.name}`, `Would add $${s.amount}/mo if reactivated.`, 'c', '06:05');
  }

  // forward cash-flow — baseline = trailing 30d revenue
  const baseline30d = d.days.slice(-30).reduce((s, x) => s + x.revenue, 0);
  const fv = forecastVerdict(forecastCashflow(d, baseline30d, 6));
  if (fv.tone === 'red') {
    push('red', 'PARK', `CASH FORECAST: ${fv.text}`, 'Projection includes burn, committed production runs, and expected pipeline revenue.', 'c', '06:10');
  } else if (fv.tone === 'amber') {
    push('amber', 'PARK', `CASH FORECAST: ${fv.text}`, 'No negative month, but the bank takes a real dip. Time the next run carefully.', 'c', '06:10');
  }

  const order = { red: 0, amber: 1, green: 2 } as const;
  return out.sort((a, b) => order[a.tier] - order[b.tier]);
}

// ── Top moves — the 3 highest-dollar actions right now ────────────────────
// Same signals as notices/insights, but ranked by money so a solo operator
// knows what to do first.

export interface Move {
  id: string;
  tier: Tier;
  text: string;
  detail: string;
  impact: number;   // dollars at stake (savings, recoverable, or expected)
  desk: string;
}

export function buildMoves(d: ParkData, m: Metrics, monthlyRevenue: number): Move[] {
  const out: Move[] = [];
  let n = 0;
  const push = (tier: Tier, text: string, detail: string, impact: number, desk: string) =>
    out.push({ id: `mv${n++}`, tier, text, detail, impact, desk });

  for (const c of d.campaigns) {
    const v = campaignVerdict(c, m.breakEvenRoas, d.targetRoas);
    if (v.tier === 'red') {
      push('red', `PAUSE ${c.name}`, `ROAS ${(c.revenue / c.spend).toFixed(2)} vs break-even ${m.breakEvenRoas.toFixed(2)} — stop the bleed`, c.spend, 'a');
    }
  }

  for (const p of d.products) {
    if (p.published && p.stock === 0 && p.sold7d > 0) {
      push('red', `RESTOCK ${p.name}`, `was moving ${p.sold7d} units/wk when it broke`, p.price * p.sold7d, 'i');
    }
  }

  for (const i of d.pipeline.filter((x) => x.status === 'READY')) {
    const rev = Math.round(i.qty * i.retail * i.expectedSellThrough);
    push('green', `OPEN ${i.name}`, `${i.qty} units paid for — list it and collect`, rev, 'p');
  }

  for (const c of d.channels) {
    if (c.type === 'ONLINE') continue;
    const st = channelStats(c, d.products);
    for (const r of st.rows) {
      if (r.sellThrough >= 0.85 && r.allocated >= 10) {
        push('amber', `SHIP ${r.product.name} TO ${c.name}`, `${r.sold}/${r.allocated} sold — shelf nearly empty`, r.product.price * r.sold, 'l');
      }
    }
  }

  const dip = forecastCashflow(d, monthlyRevenue, 6).find((x) => x.closing < 0);
  if (dip) {
    push('red', `COVER ${dip.label} SHORTFALL`, 'delay a production run or move units faster', Math.abs(Math.round(dip.closing)), 'c');
  }

  const owed = totalStockistOwed(d);
  if (owed >= 500) {
    push('amber', 'COLLECT STOCKIST PAYOUTS', 'units already sold on their shelves — invoice and collect', owed, 'l');
  }

  const dead = d.products
    .filter((p) => p.published && p.stock >= 20 && dailyVelocity(p) < 0.5)
    .sort((a, b) => b.stock * b.price - a.stock * a.price)[0];
  if (dead) {
    push('amber', `LIQUIDATE ${dead.name}`, `${dead.stock} units idle — bundle or archive sale frees the cash`, Math.round(dead.stock * dead.price * 0.5), 'i');
  }

  return out.sort((a, b) => b.impact - a.impact).slice(0, 3);
}

// ── Sync delta — what changed between two park-data snapshots ─────────────

export interface SyncDelta {
  revenue: number;
  orders: number;
  spend: number;
  events: string[];
}

export function diffSnapshots(prev: ParkData, next: ParkData): SyncDelta {
  const prevDates = new Set(prev.days.map((x) => x.date));
  const fresh = next.days.filter((x) => !prevDates.has(x.date));
  const events: string[] = [];
  for (const p of next.products) {
    const before = prev.products.find((q) => q.id === p.id);
    if (!before) events.push(`NEW PRODUCT: ${p.name}`);
    else if (before.stock > 0 && p.stock === 0 && p.published) events.push(`${p.name} SOLD OUT`);
  }
  for (const i of next.pipeline) {
    const before = prev.pipeline.find((q) => q.id === i.id);
    if (!before) events.push(`NEW BUILD: ${i.name}`);
    else if (before.status !== i.status) events.push(`${i.name}: ${before.status} → ${i.status}`);
  }
  return {
    revenue: fresh.reduce((s, x) => s + x.revenue, 0),
    orders: fresh.reduce((s, x) => s + x.orders, 0),
    spend: fresh.reduce((s, x) => s + x.spend, 0),
    events,
  };
}

// ── Insights — cross-data-point observations ──────────────────────────────
// Rule-based, deliberately simple: each rule reads several parts of ParkData
// and says one true thing. Red = money at risk, amber = worth a look,
// green = working as intended.

export interface Insight {
  id: string;
  tier: Tier;
  text: string;
  detail: string;
}

export interface GrowthPlan {
  currentRetail: number;      // retail value of everything under construction
  targetPct: number;
  targetRetail: number;       // currentRetail × (1 + pct)
  deltaRetail: number;
  estCost: number;            // targetRetail × (1 − grossMargin)
  estUnits: number;           // targetRetail ÷ blended pipeline retail price
  expectedNet: number;        // at blended expected sell-through
  fundable: boolean;          // estCost ≤ lowest forecast closing
  lowPoint: number;           // lowest forecast closing
  lowPointLabel: string;
}

export function growthPlan(d: ParkData, monthlyRevenue: number): GrowthPlan {
  const currentRetail = d.pipeline.reduce((s, i) => s + pipelineGross(i), 0);
  const targetPct = d.growthTargetPct;
  const targetRetail = Math.round(currentRetail * (1 + targetPct / 100));
  const blendedPrice = d.pipeline.length
    ? d.pipeline.reduce((s, i) => s + i.retail, 0) / d.pipeline.length
    : 50;
  const blendedSellThrough = d.pipeline.length
    ? d.pipeline.reduce((s, i) => s + i.expectedSellThrough, 0) / d.pipeline.length
    : 0.7;
  const estCost = Math.round(targetRetail * (1 - d.grossMargin));
  const fc = forecastCashflow(d, monthlyRevenue, 6);
  const low = fc.reduce((min, m) => (m.closing < min.closing ? m : min), fc[0]);
  return {
    currentRetail,
    targetPct,
    targetRetail,
    deltaRetail: targetRetail - currentRetail,
    estCost,
    estUnits: Math.round(targetRetail / (blendedPrice || 1)),
    expectedNet: Math.round(targetRetail * blendedSellThrough - estCost),
    fundable: estCost <= low.closing,
    lowPoint: low.closing,
    lowPointLabel: low.label,
  };
}

export function buildInsights(d: ParkData, m: Metrics, monthlyRevenue: number): Insight[] {
  const out: Insight[] = [];
  let n = 0;
  const push = (tier: Tier, text: string, detail: string) => out.push({ id: `i${n++}`, tier, text, detail });

  // 1. forecast verdict
  const fv = forecastVerdict(forecastCashflow(d, monthlyRevenue, 6));
  push(fv.tone === 'green' ? 'green' : fv.tone, `SIX-MONTH CASH: ${fv.text}`, 'Burn + committed runs + expected pipeline revenue, against current sales pace.');

  // 2. what actually weighs on burn
  const cats = burnByCategory(d).filter((c) => c.category !== 'PRODUCTION');
  const recurringTotal = cats.reduce((s, c) => s + c.monthly, 0);
  const heaviest = cats.reduce((a, b) => (b.monthly > a.monthly ? b : a), cats[0]);
  if (heaviest && recurringTotal > 0 && heaviest.monthly / recurringTotal > 0.5) {
    push('amber', `${heaviest.category} IS ${Math.round((heaviest.monthly / recurringTotal) * 100)}% OF RECURRING BURN`, 'Cutting subscriptions will not move runway — this category will.');
  }

  // 3. dead stock with real money stuck in it
  const dead = d.products
    .filter((p) => p.published && p.stock >= 20 && dailyVelocity(p) < 0.5)
    .sort((a, b) => b.stock * b.price - a.stock * a.price)[0];
  if (dead) {
    const months = daysOfStock(dead) === Infinity ? null : Math.round(daysOfStock(dead) / 30);
    push('amber', `$${(dead.stock * dead.price).toLocaleString()} RETAIL SITTING IN ${dead.name}`,
      `${dead.stock} units${months ? ` · ~${months} months of stock at current pace` : ' · no measurable velocity'}. A bundle or archive sale frees the cash.`);
  }

  // 4. ready rides are unclaimed money
  const ready = d.pipeline.filter((i) => i.status === 'READY');
  if (ready.length > 0) {
    const expected = ready.reduce((s, i) => s + Math.round(i.qty * i.retail * i.expectedSellThrough), 0);
    push('green', `${ready.length} RIDE${ready.length > 1 ? 'S' : ''} READY — ~$${expected.toLocaleString()} EXPECTED ON OPENING`,
      ready.map((i) => i.name).join(' · ') + '. Listing costs nothing; the stock is already paid for.');
  }

  // 5. budget discipline — recurring burn vs the annual budget's monthly allowance
  if (d.annualBudget > 0) {
    const allowance = d.annualBudget / 12;
    const burnNow = monthlyBurn(d);
    if (burnNow > allowance) {
      push(burnNow > allowance * 1.15 ? 'red' : 'amber',
        `BURN ${Math.round((burnNow / allowance) * 100)}% OF BUDGET ALLOWANCE`,
        `$${Math.round(burnNow).toLocaleString()}/mo recurring vs $${Math.round(allowance).toLocaleString()}/mo allowed ($${d.annualBudget.toLocaleString()}/yr). One-off production runs don't count against this — this is the fixed base creeping.`);
    } else {
      push('green', `BUDGET HOLDING — $${Math.round(allowance - burnNow).toLocaleString()}/MO OF HEADROOM`,
        `Recurring burn $${Math.round(burnNow).toLocaleString()} vs $${Math.round(allowance).toLocaleString()} allowance. Headroom is where the next production run comes from.`);
    }
  }

  // 6. ad money pits
  const pit = d.campaigns.find((c) => campaignVerdict(c, m.breakEvenRoas, d.targetRoas).tier === 'red');
  if (pit) {
    push('red', `PAUSING ${pit.name} SAVES ~$${pit.spend.toLocaleString()} PERIOD EQUIV`, `ROAS ${(pit.revenue / pit.spend).toFixed(2)} vs break-even ${m.breakEvenRoas.toFixed(2)}.`);
  }

  // 7. consignment engine — when stockists carry the brand, shelf health = revenue
  const onlineRev = d.channels.filter((c) => c.type === 'ONLINE').reduce((s, c) => s + c.revenue, 0);
  const partnerRev = d.channels.filter((c) => c.type !== 'ONLINE').reduce((s, c) => s + c.revenue, 0);
  const partnerShare = partnerRev / (onlineRev + partnerRev || 1);
  if (partnerShare > 0.5) {
    push('amber', `STOCKISTS DRIVE ${Math.round(partnerShare * 100)}% OF REVENUE`,
      `Wholesale pace ≈ $${stockistMonthlyPace(d).toLocaleString()}/mo at your cut. Protect shelf stock and collect payouts on schedule — that IS the business.`);
  }

  // 8. stockist divergence — where to send the next box
  const stockists = d.channels.filter((c) => c.type !== 'ONLINE');
  if (stockists.length >= 2) {
    const ranked = stockists
      .map((c) => ({ c, st: channelStats(c, d.products) }))
      .sort((a, b) => b.st.sellThrough - a.st.sellThrough);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.st.sellThrough - worst.st.sellThrough > 0.25) {
      push('amber', `${best.c.name} SELLS AT ${Math.round(best.st.sellThrough * 100)}%, ${worst.c.name} AT ${Math.round(worst.st.sellThrough * 100)}%`,
        'Shift the next allocation toward the shelf that moves it.');
    }
  }

  // 9. growth target feasibility
  const plan = growthPlan(d, monthlyRevenue);
  if (plan.currentRetail > 0) {
    if (!plan.fundable) {
      push('red', `GROWTH TARGET NOT FUNDABLE AT +${plan.targetPct}%`,
        `$${plan.estCost.toLocaleString()} production cost vs low point $${Math.round(plan.lowPoint).toLocaleString()} in ${plan.lowPointLabel}. Lower the target or stage the runs.`);
    } else {
      push('green', `+${plan.targetPct}% PRODUCTION TARGET IS FUNDABLE`,
        `$${plan.estCost.toLocaleString()} cost clears the forecast low point ($${Math.round(plan.lowPoint).toLocaleString()} in ${plan.lowPointLabel}).`);
    }
  }

  const order = { red: 0, amber: 1, green: 2 } as const;
  return out.sort((a, b) => order[a.tier] - order[b.tier]).slice(0, 6);
}

// Ambient ticker lines — flavor driven by real states.
export function guestThoughts(d: ParkData, m: Metrics): string[] {
  const t: string[] = [];
  const broken = d.products.filter((p) => rideState(p) === 'BROKEN');
  const hot = d.products.filter((p) => rideState(p) === 'THRIVING');
  for (const p of broken) t.push(`"NOOO, ${p.name} IS SOLD OUT?!"`);
  for (const p of hot) t.push(`"THE ${p.name} LINE IS SO WORTH IT"`);
  t.push(`"PARK RATING ${m.rating} — THIS PLACE IS ${m.ratingBand}"`);
  t.push(`"SPENT $${Math.round(m.aov)} AND ZERO REGRETS"`);
  t.push('"THINKING LIKE AN ARCHIPELAGO"');
  t.push('"KEEP GOING. KEEP GOING. KEEP GOING."');
  if (m.roas >= d.targetRoas) t.push('"THEIR ADS FOUND ME AT 2AM. NO NOTES."');
  return t;
}
