import type { Position, PriceRow, PricedPosition, PortfolioState, Tier } from './types';
import { TIERS } from './types';

/** Money formatting used in flag arithmetic and the UI. */
export function money(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function isOpen(p: Position): boolean {
  return p.closed_at === null || p.closed_at === undefined;
}

/**
 * Joins positions to their most recent observed price. Pure — the caller
 * supplies the price rows, so tests never touch a database.
 */
export function pricePositions(
  positions: Position[],
  latestPrices: Map<string, PriceRow>,
): PricedPosition[] {
  return positions.map((p) => {
    const row = latestPrices.get(p.ticker.toUpperCase()) ?? null;
    const price = row ? row.price : null;
    return {
      ...p,
      price,
      price_as_of: row ? row.as_of : null,
      price_source: row ? row.source : null,
      market_value: price === null ? null : price * p.shares,
      basis_value: p.cost_basis * p.shares,
    };
  });
}

/**
 * The value we use for weighting. Falls back to cost basis when a position
 * has never been priced, so a missing price does not silently erase a
 * position from every percentage on the screen. The `stalePrice` rule is
 * what tells you the fallback is in play.
 */
export function effectiveValue(p: PricedPosition): number {
  return p.market_value ?? p.basis_value;
}

export function openPositions(state: PortfolioState): PricedPosition[] {
  return state.positions.filter(isOpen);
}

/** Open positions at market (or basis) value, plus uninvested cash. */
export function totalValue(state: PortfolioState): number {
  return openPositions(state).reduce((sum, p) => sum + effectiveValue(p), 0) + state.cash;
}

export function totalBasis(state: PortfolioState): number {
  return openPositions(state).reduce((sum, p) => sum + p.basis_value, 0);
}

export function tierValue(state: PortfolioState, tier: Tier): number {
  return openPositions(state)
    .filter((p) => p.tier === tier)
    .reduce((sum, p) => sum + effectiveValue(p), 0);
}

export function tierValues(state: PortfolioState): Record<Tier, number> {
  const out = {} as Record<Tier, number>;
  for (const t of TIERS) out[t] = tierValue(state, t);
  return out;
}

/**
 * Tier weights as percentages of the whole portfolio, cash included. Returns
 * all zeroes for an empty portfolio rather than NaN.
 */
export function tierWeights(state: PortfolioState): Record<Tier, number> {
  const total = totalValue(state);
  const values = tierValues(state);
  const out = {} as Record<Tier, number>;
  for (const t of TIERS) out[t] = total > 0 ? (values[t] / total) * 100 : 0;
  return out;
}

export function positionWeight(state: PortfolioState, p: PricedPosition): number {
  const total = totalValue(state);
  return total > 0 ? (effectiveValue(p) / total) * 100 : 0;
}

/** Percent above/below cost basis. Null when the position has no price. */
export function drawdownPct(p: PricedPosition): number | null {
  if (p.price === null || p.cost_basis <= 0) return null;
  return ((p.price - p.cost_basis) / p.cost_basis) * 100;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/** Age of a position's price in days. Null when it has never been priced. */
export function priceAgeDays(p: PricedPosition, now: Date): number | null {
  if (!p.price_as_of) return null;
  const asOf = new Date(p.price_as_of);
  if (Number.isNaN(asOf.getTime())) return null;
  return daysBetween(now, asOf);
}

export function nearTermTotal(state: PortfolioState): number {
  return state.nearTerm.reduce((sum, n) => sum + n.amount, 0);
}

/** Realized profit/loss on a closed position. Null while it is still open. */
export function realizedPL(p: Position): number | null {
  if (isOpen(p) || p.close_price === null || p.close_price === undefined) return null;
  return (p.close_price - p.cost_basis) * p.shares;
}
