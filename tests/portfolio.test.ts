import { describe, expect, it } from 'vitest';
import {
  dateOnly,
  daysBetween,
  drawdownPct,
  effectiveValue,
  isOpen,
  money,
  nearTermTotal,
  openPositions,
  pct,
  positionWeight,
  priceAgeDays,
  pricePositions,
  realizedPL,
  tierValue,
  tierValues,
  tierWeights,
  totalBasis,
  totalValue,
} from '../lib/portfolio';
import type { Position, PriceRow } from '../lib/types';
import { cleanState, daysBefore, need, pos, state, NOW } from './helpers';

describe('formatting', () => {
  it('formats money and percentages', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(money(-600)).toBe('-$600.00');
    expect(pct(12.345)).toBe('12.3%');
    expect(pct(12.345, 2)).toBe('12.35%');
  });
});

describe('pricePositions', () => {
  const base: Position = {
    id: 1,
    ticker: 'aapl',
    name: 'Apple',
    tier: 'med',
    shares: 10,
    cost_basis: 100,
    thesis: 't',
    invalidation: 'i',
    opened_at: daysBefore(10),
    closed_at: null,
    close_price: null,
  };

  it('joins on the uppercased ticker', () => {
    const row: PriceRow = { id: 1, ticker: 'AAPL', price: 150, as_of: daysBefore(1), source: 'test' };
    const [p] = pricePositions([base], new Map([['AAPL', row]]));
    expect(p.price).toBe(150);
    expect(p.market_value).toBe(1500);
    expect(p.basis_value).toBe(1000);
    expect(p.price_source).toBe('test');
  });

  it('leaves market value null when no price has ever been observed', () => {
    const [p] = pricePositions([base], new Map());
    expect(p.price).toBeNull();
    expect(p.market_value).toBeNull();
    expect(p.price_as_of).toBeNull();
    expect(p.price_source).toBeNull();
    expect(p.basis_value).toBe(1000);
  });
});

describe('valuation', () => {
  it('falls back to cost basis when unpriced, so the position does not vanish', () => {
    const p = pos({ shares: 10, cost_basis: 100, price: null });
    expect(effectiveValue(p)).toBe(1000);
  });

  it('prefers market value when priced', () => {
    expect(effectiveValue(pos({ shares: 10, cost_basis: 100, price: 150 }))).toBe(1500);
  });
});

describe('open vs closed', () => {
  it('reads closed_at', () => {
    expect(isOpen(pos())).toBe(true);
    expect(isOpen(pos({ closed_at: daysBefore(1) }))).toBe(false);
  });

  it('excludes closed positions from every aggregate', () => {
    const s = state({
      positions: [
        pos({ ticker: 'OPEN', shares: 10, cost_basis: 100, price: 100 }),
        pos({ ticker: 'SHUT', shares: 10, cost_basis: 100, price: 100, closed_at: daysBefore(1) }),
      ],
    });
    expect(openPositions(s)).toHaveLength(1);
    expect(totalValue(s)).toBe(1000);
    expect(totalBasis(s)).toBe(1000);
  });
});

describe('totals and weights', () => {
  it('adds cash to total value but not to total basis', () => {
    const s = cleanState({ cash: 2_500 });
    expect(totalValue(s)).toBe(12_500);
    expect(totalBasis(s)).toBe(10_000);
  });

  it('computes tier values and weights against the whole portfolio', () => {
    const s = cleanState();
    expect(tierValues(s)).toEqual({ low: 5000, med: 3500, high: 1500 });
    const w = tierWeights(s);
    expect(w.low).toBeCloseTo(50);
    expect(w.med).toBeCloseTo(35);
    expect(w.high).toBeCloseTo(15);
    expect(tierValue(s, 'high')).toBe(1500);
  });

  it('returns zeroes rather than NaN for an empty portfolio', () => {
    const s = state();
    expect(totalValue(s)).toBe(0);
    expect(tierWeights(s)).toEqual({ low: 0, med: 0, high: 0 });
    expect(positionWeight(s, pos())).toBe(0);
  });

  it('weights an individual position against the total', () => {
    const s = cleanState();
    const aaa = s.positions.find((p) => p.ticker === 'AAA')!;
    expect(positionWeight(s, aaa)).toBeCloseTo(17);
  });
});

describe('drawdownPct', () => {
  it('is negative below cost and positive above', () => {
    expect(drawdownPct(pos({ cost_basis: 100, price: 75 }))).toBeCloseTo(-25);
    expect(drawdownPct(pos({ cost_basis: 100, price: 130 }))).toBeCloseTo(30);
  });

  it('is null without a price', () => {
    expect(drawdownPct(pos({ price: null }))).toBeNull();
  });

  it('is null for a zero cost basis instead of dividing by zero', () => {
    expect(drawdownPct(pos({ cost_basis: 0, price: 10 }))).toBeNull();
  });
});

describe('price age', () => {
  it('measures days regardless of direction', () => {
    expect(daysBetween(new Date('2026-01-10'), new Date('2026-01-01'))).toBe(9);
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-10'))).toBe(9);
  });

  it('reports the age of the latest price', () => {
    expect(priceAgeDays(pos({ priceAgeDays: 3 }), NOW)).toBeCloseTo(3);
  });

  it('is null when never priced', () => {
    expect(priceAgeDays(pos({ price: null }), NOW)).toBeNull();
  });

  it('is null for an unparseable timestamp', () => {
    expect(priceAgeDays(pos({ price_as_of: 'garbage' }), NOW)).toBeNull();
  });
});

describe('near-term needs', () => {
  it('sums to zero when there are none', () => {
    expect(nearTermTotal(state())).toBe(0);
  });

  it('sums every entry', () => {
    expect(nearTermTotal(state({ nearTerm: [need(1000), need(250)] }))).toBe(1250);
  });
});

describe('realizedPL', () => {
  it('is null while the position is open', () => {
    expect(realizedPL(pos())).toBeNull();
  });

  it('is null when closed without a recorded price', () => {
    expect(realizedPL(pos({ closed_at: daysBefore(1), close_price: null }))).toBeNull();
  });

  it('is proceeds minus basis, times shares', () => {
    const p = pos({ shares: 10, cost_basis: 100, closed_at: daysBefore(1), close_price: 130 });
    expect(realizedPL(p)).toBe(300);
    const loss = pos({ shares: 10, cost_basis: 100, closed_at: daysBefore(1), close_price: 60 });
    expect(realizedPL(loss)).toBe(-400);
  });
});

describe('dateOnly', () => {
  it('trims a timestamp to its date', () => {
    expect(dateOnly('2026-12-01T07:40:35.581Z')).toBe('2026-12-01');
  });

  it('leaves an already-date-only string alone', () => {
    expect(dateOnly('2026-12-01')).toBe('2026-12-01');
  });
});
