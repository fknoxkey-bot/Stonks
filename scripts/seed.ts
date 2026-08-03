/**
 * Seeds a small, deliberately imperfect portfolio so every view has something
 * to render and several rules actually fire on first run. Idempotent-ish:
 * it wipes the sample rows it owns before re-inserting.
 */
import { getDb } from '../lib/db';
import {
  createPosition,
  createNearTerm,
  insertPrice,
  setCash,
  setTarget,
  takeSnapshot,
  buildPortfolioState,
} from '../lib/queries';
import { evaluateAll } from '../lib/rules';
import { syncFlags } from '../lib/queries';

const db = getDb();

db.exec('DELETE FROM positions; DELETE FROM prices; DELETE FROM near_term; DELETE FROM snapshots; DELETE FROM flags;');

setTarget('low', 50);
setTarget('med', 35);
setTarget('high', 15);
setCash(8_000);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const seed = [
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    tier: 'med' as const,
    shares: 120,
    cost_basis: 210.4,
    thesis:
      'Broad US equity beta at 3bp. The default holding; anything else has to argue why it beats this.',
    invalidation:
      'Expense ratio rises above 0.10%, or a materially cheaper total-market vehicle with comparable liquidity exists for two consecutive quarters.',
    opened_at: daysAgo(700),
    price: 268.1,
    priceAgeDays: 0,
  },
  {
    ticker: 'BND',
    name: 'Vanguard Total Bond Market ETF',
    tier: 'low' as const,
    shares: 200,
    cost_basis: 74.2,
    thesis:
      'Duration ballast. Exists to be boring and to be sellable in a month when equities are down 30%.',
    invalidation:
      'Real yields stay negative for four consecutive quarters, or correlation to equities turns persistently positive across two drawdowns.',
    opened_at: daysAgo(640),
    price: 73.1,
    priceAgeDays: 0,
  },
  {
    ticker: 'ASML',
    name: 'ASML Holding NV',
    tier: 'high' as const,
    shares: 22,
    cost_basis: 905.0,
    thesis:
      'Monopoly on EUV lithography. Every leading-edge fab on earth has to buy from one company, and that company is this one.',
    invalidation:
      'A credible competitor ships a production EUV or equivalent-resolution tool, or two consecutive quarters of declining EUV unit bookings absent a broader semi downturn.',
    opened_at: daysAgo(400),
    price: 640.0, // ~29% below basis — trips drawdownReview
    priceAgeDays: 1,
  },
  {
    ticker: 'BRK.B',
    name: 'Berkshire Hathaway Inc. Class B',
    tier: 'low' as const,
    shares: 60,
    cost_basis: 358.0,
    thesis:
      'Diversified operating businesses plus a very large cash pile run by people who have said in writing what they will do with it.',
    invalidation:
      'Book value per share declines for two consecutive years absent a market-wide drawdown, or a capital allocation decision is made that contradicts the stated policy.',
    opened_at: daysAgo(520),
    price: 470.0,
    priceAgeDays: 22, // stale — trips stalePrice
  },
];

for (const s of seed) {
  createPosition({
    ticker: s.ticker,
    name: s.name,
    tier: s.tier,
    shares: s.shares,
    cost_basis: s.cost_basis,
    thesis: s.thesis,
    invalidation: s.invalidation,
    opened_at: s.opened_at,
  });
  // A short synthetic price history so the charts have something to draw.
  for (let d = 45; d >= s.priceAgeDays; d -= 5) {
    const drift = 1 + (Math.sin(d / 7) * 0.03 + (45 - d) * 0.0008);
    insertPrice(s.ticker, Number((s.price * drift).toFixed(2)), 'seed', daysAgo(d));
  }
  insertPrice(s.ticker, s.price, 'seed', daysAgo(s.priceAgeDays));
}

// Deliberately larger than cash + the preservation tier, so the seeded
// portfolio demonstrates a high-severity flag rather than only gentle ones.
createNearTerm(62_000, daysAgo(-120).slice(0, 10), 'Roof replacement');

// Backfill a few months of snapshots so the history view is not a single dot.
for (let d = 180; d >= 0; d -= 7) {
  takeSnapshot(buildPortfolioState(new Date(Date.now() - d * 86_400_000)), new Date(Date.now() - d * 86_400_000));
}

const state = buildPortfolioState();
const flags = evaluateAll(state);
syncFlags(flags, state.now);

console.log(`[seed] ${seed.length} positions, 1 near-term need, ${flags.length} flags raised.`);
for (const f of flags) console.log(`[seed]   ${f.severity.toUpperCase().padEnd(4)} ${f.rule}`);
db.close();
