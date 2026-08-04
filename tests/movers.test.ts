import { describe, expect, it } from 'vitest';
import { computeMovers, describeMovers } from '../lib/movers';
import type { PriceRow } from '../lib/types';
import { daysBefore, pos, NOW } from './helpers';

const prior = (ticker: string, price: number, days = 7): [string, PriceRow] => [
  ticker,
  { id: 1, ticker, price, as_of: daysBefore(days), source: 'test' },
];

describe('computeMovers', () => {
  it('reports a rise above the threshold', () => {
    const movers = computeMovers(
      [pos({ ticker: 'AAA', price: 110 })],
      new Map([prior('AAA', 100)]),
      6,
      NOW,
    );
    expect(movers).toHaveLength(1);
    expect(movers[0].pctChange).toBeCloseTo(10);
    expect(movers[0].from).toBe(100);
    expect(movers[0].to).toBe(110);
    expect(movers[0].days).toBeCloseTo(7);
  });

  it('reports a fall, signed negative', () => {
    const movers = computeMovers(
      [pos({ ticker: 'AAA', price: 80 })],
      new Map([prior('AAA', 100)]),
      6,
      NOW,
    );
    expect(movers[0].pctChange).toBeCloseTo(-20);
  });

  it('stays silent below the threshold', () => {
    expect(
      computeMovers([pos({ ticker: 'AAA', price: 105 })], new Map([prior('AAA', 100)]), 6, NOW),
    ).toEqual([]);
  });

  it('fires exactly at the threshold', () => {
    expect(
      computeMovers([pos({ ticker: 'AAA', price: 106 })], new Map([prior('AAA', 100)]), 6, NOW),
    ).toHaveLength(1);
  });

  it('orders by size of move, not direction', () => {
    const movers = computeMovers(
      [
        pos({ ticker: 'SMALL', price: 110 }),
        pos({ ticker: 'BIG', price: 60 }),
        pos({ ticker: 'MID', price: 120 }),
      ],
      new Map([prior('SMALL', 100), prior('BIG', 100), prior('MID', 100)]),
      6,
      NOW,
    );
    expect(movers.map((m) => m.ticker)).toEqual(['BIG', 'MID', 'SMALL']);
  });

  it('skips a holding with no current price rather than calling it a 100% move', () => {
    expect(
      computeMovers([pos({ ticker: 'AAA', price: null })], new Map([prior('AAA', 100)]), 6, NOW),
    ).toEqual([]);
  });

  it('skips a holding with no prior price', () => {
    expect(computeMovers([pos({ ticker: 'AAA', price: 200 })], new Map(), 6, NOW)).toEqual([]);
  });

  it('skips a zero prior price rather than dividing by zero', () => {
    const movers = computeMovers(
      [pos({ ticker: 'AAA', price: 50 })],
      new Map([prior('AAA', 0)]),
      6,
      NOW,
    );
    expect(movers).toEqual([]);
  });

  it('skips closed positions', () => {
    expect(
      computeMovers(
        [pos({ ticker: 'AAA', price: 200, closed_at: daysBefore(1) })],
        new Map([prior('AAA', 100)]),
        6,
        NOW,
      ),
    ).toEqual([]);
  });

  it('skips when both ends are the same observation — there is no window', () => {
    const p = pos({ ticker: 'AAA', price: 100, priceAgeDays: 7 });
    const movers = computeMovers(
      [p],
      new Map([['AAA', { id: 1, ticker: 'AAA', price: 50, as_of: p.price_as_of!, source: 't' }]]),
      6,
      NOW,
    );
    expect(movers).toEqual([]);
  });

  it('matches tickers case-insensitively', () => {
    const p = pos({ ticker: 'aaa', price: 120 });
    p.ticker = 'aaa';
    expect(computeMovers([p], new Map([prior('AAA', 100)]), 6, NOW)).toHaveLength(1);
  });
});

describe('describeMovers', () => {
  it('says so plainly when nothing moved', () => {
    expect(describeMovers([])).toContain('none moved');
  });

  it('writes one signed line per mover', () => {
    const text = describeMovers(
      computeMovers(
        [pos({ ticker: 'UP', price: 120 }), pos({ ticker: 'DOWN', price: 70 })],
        new Map([prior('UP', 100), prior('DOWN', 100)]),
        6,
        NOW,
      ),
    );
    expect(text).toContain('DOWN: -30.0%');
    expect(text).toContain('UP: +20.0%');
    expect(text).toContain('$100.00 → $120.00');
  });
});
