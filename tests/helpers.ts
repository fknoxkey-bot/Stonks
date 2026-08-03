import type { NearTerm, PortfolioState, PricedPosition, Tier } from '../lib/types';

export const NOW = new Date('2026-03-01T12:00:00.000Z');

export function daysBefore(n: number, from: Date = NOW): string {
  return new Date(from.getTime() - n * 86_400_000).toISOString();
}

let nextId = 1;

export interface PosOpts {
  ticker?: string;
  tier?: Tier;
  shares?: number;
  cost_basis?: number;
  price?: number | null;
  priceAgeDays?: number | null;
  thesis?: string;
  invalidation?: string;
  closed_at?: string | null;
  close_price?: number | null;
  price_as_of?: string | null;
}

/** Builds a fully-priced position. Sensible, non-triggering defaults. */
export function pos(opts: PosOpts = {}): PricedPosition {
  const shares = opts.shares ?? 10;
  const cost_basis = opts.cost_basis ?? 100;
  const price = opts.price === undefined ? cost_basis : opts.price;
  const ageDays = opts.priceAgeDays === undefined ? 0 : opts.priceAgeDays;

  const price_as_of =
    opts.price_as_of !== undefined
      ? opts.price_as_of
      : price === null || ageDays === null
        ? null
        : daysBefore(ageDays);

  return {
    id: nextId++,
    ticker: opts.ticker ?? `T${nextId}`,
    name: 'Test Holding',
    tier: opts.tier ?? 'med',
    shares,
    cost_basis,
    thesis: opts.thesis === undefined ? 'A written thesis.' : opts.thesis,
    invalidation:
      opts.invalidation === undefined ? 'A written invalidation condition.' : opts.invalidation,
    opened_at: daysBefore(365),
    closed_at: opts.closed_at ?? null,
    close_price: opts.close_price ?? null,
    price,
    price_as_of,
    price_source: price === null ? null : 'test',
    market_value: price === null ? null : price * shares,
    basis_value: cost_basis * shares,
  };
}

export interface StateOpts {
  positions?: PricedPosition[];
  targets?: Partial<Record<Tier, number>>;
  nearTerm?: NearTerm[];
  cash?: number;
  now?: Date;
}

export function state(opts: StateOpts = {}): PortfolioState {
  return {
    positions: opts.positions ?? [],
    targets: { low: 50, med: 35, high: 15, ...(opts.targets ?? {}) },
    nearTerm: opts.nearTerm ?? [],
    cash: opts.cash ?? 0,
    now: opts.now ?? NOW,
  };
}

export function need(amount: number, label = 'Need', needBy = daysBefore(-90)): NearTerm {
  return { id: nextId++, amount, need_by: needBy, label };
}

/**
 * A six-position, $10,000 portfolio: exactly on target (50/35/15), every
 * position under the concentration line, fully priced, fully documented, no
 * near-term needs. Nothing fires against it.
 *
 * Every test that wants a single rule to trip starts here and perturbs one
 * thing — so a test failure points at the perturbation, not the fixture.
 */
export function cleanState(overrides: StateOpts = {}): PortfolioState {
  const holding = (ticker: string, tier: Tier, price: number) =>
    pos({ ticker, tier, shares: 100, cost_basis: price, price });

  return state({
    positions: [
      holding('AAA', 'low', 17.0), //  1700
      holding('BBB', 'low', 16.5), //  1650
      holding('CCC', 'low', 16.5), //  1650  → low  = 5000 = 50%
      holding('DDD', 'med', 17.5), //  1750
      holding('EEE', 'med', 17.5), //  1750  → med  = 3500 = 35%
      holding('FFF', 'high', 15.0), // 1500  → high = 1500 = 15%
    ],
    cash: 0,
    ...overrides,
  });
}
