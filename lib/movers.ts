/**
 * Price moves worth mentioning.
 *
 * Pure functions: the caller supplies both the current positions and the
 * prices as they stood at the comparison date, so this is deterministic and
 * needs no database or clock.
 *
 * This deliberately does NOT live in the rules engine. The eight rules are
 * fixed and heavily tested, and "a price moved" is not a discipline failure —
 * it is context for the weekly brief. A move only matters once you have
 * checked it against what you wrote down, which is what the brief does next.
 */
import type { PriceRow, PricedPosition } from './types';
import { isOpen } from './portfolio';

export interface Mover {
  ticker: string;
  name: string;
  from: number;
  to: number;
  /** Signed percentage change over the window. */
  pctChange: number;
  /** Actual days between the two observations, which may not be exactly 7. */
  days: number;
}

/**
 * Holdings whose price moved at least `minAbsPct` since the comparison
 * snapshot, biggest absolute move first. Positions with no price at either end
 * are skipped rather than reported as a 100% move.
 */
export function computeMovers(
  positions: PricedPosition[],
  priorPrices: Map<string, PriceRow>,
  minAbsPct: number,
  now: Date,
): Mover[] {
  const out: Mover[] = [];

  for (const p of positions) {
    if (!isOpen(p) || p.price === null || p.price <= 0) continue;

    const prior = priorPrices.get(p.ticker.toUpperCase());
    if (!prior || prior.price <= 0) continue;

    // Same observation at both ends means we have no window to measure.
    if (prior.as_of === p.price_as_of) continue;

    const pctChange = ((p.price - prior.price) / prior.price) * 100;
    if (!Number.isFinite(pctChange) || Math.abs(pctChange) < minAbsPct) continue;

    const priorAt = new Date(prior.as_of).getTime();
    const days = Number.isNaN(priorAt)
      ? 0
      : Math.abs(now.getTime() - priorAt) / (1000 * 60 * 60 * 24);

    out.push({
      ticker: p.ticker,
      name: p.name,
      from: prior.price,
      to: p.price,
      pctChange,
      days,
    });
  }

  return out.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
}

/** One line per mover, for the model prompt. */
export function describeMovers(movers: Mover[]): string {
  if (movers.length === 0) return '- none moved more than the alert threshold';
  return movers
    .map(
      (m) =>
        `- ${m.ticker}: ${m.pctChange >= 0 ? '+' : ''}${m.pctChange.toFixed(1)}% over ${m.days.toFixed(0)} days ($${m.from.toFixed(2)} → $${m.to.toFixed(2)})`,
    )
    .join('\n');
}
