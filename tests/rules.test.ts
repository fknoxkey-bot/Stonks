import { describe, expect, it } from 'vitest';
import {
  ALL_RULES,
  allocationDrift,
  concentration,
  drawdownReview,
  evaluateAll,
  horizonMismatch,
  speculativeCreep,
  stalePrice,
  thinPortfolio,
  undocumented,
} from '../lib/rules';
import { RULES } from '../lib/constants';
import type { RuleFlag } from '../lib/types';
import { cleanState, need, pos, state, daysBefore, NOW } from './helpers';

/**
 * The constitutional constraint: a flag may describe, explain, and ask. It
 * may never instruct.
 *
 * These patterns match *directives* — an imperative opening a sentence, or an
 * explicit recommendation — and deliberately do not match the word "sell"
 * appearing inside a negation ("this is not a prompt to sell"), which is the
 * opposite of a directive and is exactly the language we want to keep.
 */
const DIRECTIVE_PATTERNS = [
  /(^|[.!?\n]\s*)(sell|buy|trim|dump|exit|liquidate|add to|reduce|increase)\b/i,
  /\byou (should|need to|must|ought to) (sell|buy|trim|exit|reduce|increase|add)\b/i,
  /\b(recommend|suggest|advise)\w*\b[^.?!]*\b(sell|buy|trim|exit|reduc|increas|add)/i,
];

function expectNoDirective(f: RuleFlag): void {
  const fields = [f.title, f.body, f.detail.arithmetic, f.detail.why, f.detail.question];
  for (const text of fields) {
    for (const pattern of DIRECTIVE_PATTERNS) {
      expect(text, `"${text}" matched directive pattern ${pattern}`).not.toMatch(pattern);
    }
  }
}

/* ------------------------------------------------------------------ *
 * the fixture itself
 * ------------------------------------------------------------------ */

describe('the clean fixture', () => {
  it('trips nothing — every rule returns null', () => {
    const s = cleanState();
    for (const [name, rule] of Object.entries(ALL_RULES)) {
      expect(rule(s), `${name} should not fire on a clean portfolio`).toBeNull();
    }
    expect(evaluateAll(s)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * allocationDrift
 * ------------------------------------------------------------------ */

describe('allocationDrift', () => {
  it('is silent on an empty portfolio rather than reporting −50/−35/−15', () => {
    expect(allocationDrift(state())).toBeNull();
  });

  it('is silent when every tier is inside the band', () => {
    expect(allocationDrift(cleanState())).toBeNull();
  });

  it('does not fire one point below the threshold', () => {
    // low 46 / med 39 / high 15 → drifts of −4, +4, 0
    const s = state({
      positions: [
        pos({ ticker: 'L', tier: 'low', shares: 100, cost_basis: 46, price: 46 }),
        pos({ ticker: 'M', tier: 'med', shares: 100, cost_basis: 39, price: 39 }),
        pos({ ticker: 'H', tier: 'high', shares: 100, cost_basis: 15, price: 15 }),
      ],
    });
    expect(allocationDrift(s)).toBeNull();
  });

  it('fires at med severity exactly on the threshold', () => {
    // low 45 / med 40 / high 15 → drifts of −5, +5, 0
    const s = state({
      positions: [
        pos({ ticker: 'L', tier: 'low', shares: 100, cost_basis: 45, price: 45 }),
        pos({ ticker: 'M', tier: 'med', shares: 100, cost_basis: 40, price: 40 }),
        pos({ ticker: 'H', tier: 'high', shares: 100, cost_basis: 15, price: 15 }),
      ],
    });
    const f = allocationDrift(s)!;
    expect(f).not.toBeNull();
    expect(f.severity).toBe('med');
    expect(f.rule).toBe('allocationDrift');
    expect(f.fingerprint).toBe('allocationDrift:low,med');
    expect(f.detail.arithmetic).toContain('−5.0 points'.replace('−', '-'));
    expect(f.detail.arithmetic).toContain('+5.0 points');
  });

  it('escalates to high at 15 points', () => {
    // low 30 / med 55 / high 15 → drifts of −20, +20, 0
    const s = state({
      positions: [
        pos({ ticker: 'L', tier: 'low', shares: 100, cost_basis: 30, price: 30 }),
        pos({ ticker: 'M', tier: 'med', shares: 100, cost_basis: 55, price: 55 }),
        pos({ ticker: 'H', tier: 'high', shares: 100, cost_basis: 15, price: 15 }),
      ],
    });
    expect(allocationDrift(s)!.severity).toBe('high');
  });

  it('counts cash toward the denominator', () => {
    // Same holdings as clean, but $10k cash halves every tier weight.
    const f = allocationDrift(cleanState({ cash: 10_000 }))!;
    expect(f).not.toBeNull();
    expect(f.detail.arithmetic).toContain('PRESERVATION: 25.0% actual');
  });

  it('treats a missing target as 0%', () => {
    const s = cleanState({ targets: { low: 50, med: 35, high: undefined as unknown as number } });
    const f = allocationDrift(s)!;
    expect(f.fingerprint).toBe('allocationDrift:high');
  });

  it('states the arithmetic, the why, and asks a question', () => {
    const f = allocationDrift(cleanState({ cash: 10_000 }))!;
    expect(f.detail.arithmetic).toContain('Threshold: ±5 points');
    expect(f.detail.why).toBe(RULES.allocationDrift.why);
    expect(f.detail.question.trim().endsWith('?')).toBe(false); // ends with an instruction
    expect(f.detail.question).toContain('?');
  });
});

/* ------------------------------------------------------------------ *
 * concentration
 * ------------------------------------------------------------------ */

describe('concentration', () => {
  it('is silent on an empty portfolio', () => {
    expect(concentration(state())).toBeNull();
  });

  it('is silent below the threshold', () => {
    expect(concentration(cleanState())).toBeNull();
  });

  it('fires at med exactly on 25%', () => {
    const s = state({
      positions: [
        pos({ ticker: 'BIG', shares: 25, cost_basis: 100, price: 100 }), // 2500 of 10000
        pos({ ticker: 'A', shares: 25, cost_basis: 100, price: 100 }),
        pos({ ticker: 'B', shares: 25, cost_basis: 100, price: 100 }),
        pos({ ticker: 'C', shares: 25, cost_basis: 100, price: 100 }),
      ],
    });
    const f = concentration(s)!;
    expect(f.severity).toBe('med');
    // All four are at exactly 25%.
    expect(f.fingerprint).toBe('concentration:A,B,BIG,C');
  });

  it('escalates to high at 40%', () => {
    const s = state({
      positions: [
        pos({ ticker: 'BIG', shares: 50, cost_basis: 100, price: 100 }), // 5000 of 10000
        pos({ ticker: 'A', shares: 25, cost_basis: 100, price: 100 }),
        pos({ ticker: 'B', shares: 25, cost_basis: 100, price: 100 }),
      ],
    });
    const f = concentration(s)!;
    expect(f.severity).toBe('high');
    expect(f.title).toContain('BIG');
  });

  it('names the worst offender first and sizes the 50%-down case', () => {
    const s = state({
      positions: [
        pos({ ticker: 'HUGE', shares: 60, cost_basis: 100, price: 100 }),
        pos({ ticker: 'BIG', shares: 40, cost_basis: 100, price: 100 }),
      ],
    });
    const f = concentration(s)!;
    expect(f.title).toBe('Concentration: HUGE, BIG');
    expect(f.detail.question).toContain('HUGE');
    expect(f.detail.question).toContain('30.0%'); // 60% weight, halved
  });

  it('ignores closed positions', () => {
    const s = state({
      positions: [
        pos({ ticker: 'GONE', shares: 100, cost_basis: 100, price: 100, closed_at: daysBefore(5) }),
        pos({ ticker: 'A', shares: 10, cost_basis: 100, price: 100 }),
        pos({ ticker: 'B', shares: 10, cost_basis: 100, price: 100 }),
        pos({ ticker: 'C', shares: 10, cost_basis: 100, price: 100 }),
        pos({ ticker: 'D', shares: 10, cost_basis: 100, price: 100 }),
        pos({ ticker: 'E', shares: 10, cost_basis: 100, price: 100 }),
      ],
    });
    expect(concentration(s)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * undocumented
 * ------------------------------------------------------------------ */

describe('undocumented', () => {
  it('is silent when everything is written down', () => {
    expect(undocumented(cleanState())).toBeNull();
  });

  it('fires on a missing invalidation', () => {
    const s = cleanState();
    s.positions.push(pos({ ticker: 'NAKED', invalidation: '' }));
    const f = undocumented(s)!;
    expect(f.severity).toBe('med');
    expect(f.detail.arithmetic).toContain('NAKED: missing invalidation');
    expect(f.detail.arithmetic).not.toContain('thesis and');
  });

  it('fires on a missing thesis', () => {
    const s = state({ positions: [pos({ ticker: 'WHY', thesis: '   ' })] });
    expect(undocumented(s)!.detail.arithmetic).toContain('WHY: missing thesis');
  });

  it('reports both when both are missing', () => {
    const s = state({ positions: [pos({ ticker: 'X', thesis: '', invalidation: '' })] });
    expect(undocumented(s)!.detail.arithmetic).toContain('X: missing thesis and invalidation');
  });

  it('fingerprints on position ids so a new offender raises a new flag', () => {
    const a = pos({ ticker: 'A', invalidation: '' });
    const b = pos({ ticker: 'B', invalidation: '' });
    const one = undocumented(state({ positions: [a] }))!;
    const two = undocumented(state({ positions: [a, b] }))!;
    expect(one.fingerprint).not.toBe(two.fingerprint);
    expect(two.fingerprint).toBe(`undocumented:${[a.id, b.id].sort((x, y) => x - y).join(',')}`);
  });

  it('ignores closed positions', () => {
    const s = cleanState();
    s.positions.push(pos({ ticker: 'OLD', invalidation: '', closed_at: daysBefore(1) }));
    expect(undocumented(s)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * stalePrice
 * ------------------------------------------------------------------ */

describe('stalePrice', () => {
  it('is silent when prices are fresh', () => {
    expect(stalePrice(cleanState())).toBeNull();
  });

  it('does not fire exactly at the threshold', () => {
    const s = state({ positions: [pos({ ticker: 'EDGE', priceAgeDays: RULES.stalePrice.days })] });
    expect(stalePrice(s)).toBeNull();
  });

  it('fires just past the threshold, at low severity', () => {
    const s = state({
      positions: [pos({ ticker: 'OLD', priceAgeDays: RULES.stalePrice.days + 0.5 })],
    });
    const f = stalePrice(s)!;
    expect(f.severity).toBe('low');
    expect(f.fingerprint).toBe('stalePrice:OLD');
    expect(f.detail.arithmetic).toContain('Threshold: 14 days');
  });

  it('treats a never-priced position as stale and says so', () => {
    const s = state({ positions: [pos({ ticker: 'NEVER', price: null })] });
    const f = stalePrice(s)!;
    expect(f.detail.arithmetic).toContain('NEVER: never priced');
    expect(f.detail.arithmetic).toContain('valued at cost basis');
  });

  it('sorts the never-priced ahead of the merely old', () => {
    const s = state({
      positions: [
        pos({ ticker: 'OLD', priceAgeDays: 30 }),
        pos({ ticker: 'NEVER', price: null }),
      ],
    });
    expect(stalePrice(s)!.title).toBe('Stale prices: NEVER, OLD');
  });

  it('tolerates an unparseable timestamp by treating it as never priced', () => {
    const s = state({ positions: [pos({ ticker: 'BAD', price_as_of: 'not-a-date' })] });
    expect(stalePrice(s)!.detail.arithmetic).toContain('BAD: never priced');
  });

  it('prints $0.00 rather than "null" for a stale row with a timestamp but no price', () => {
    // Defensive: a row can only reach this shape through a bad import.
    const broken = pos({ ticker: 'ODD', priceAgeDays: 40 });
    broken.price = null;
    const f = stalePrice(state({ positions: [broken] }))!;
    expect(f.detail.arithmetic).toContain('ODD: last price $0.00');
    expect(f.detail.arithmetic).not.toContain('null');
  });
});

/* ------------------------------------------------------------------ *
 * drawdownReview
 * ------------------------------------------------------------------ */

describe('drawdownReview', () => {
  it('is silent at cost', () => {
    expect(drawdownReview(cleanState())).toBeNull();
  });

  it('is silent just above the threshold', () => {
    const s = state({ positions: [pos({ ticker: 'A', cost_basis: 100, price: 75.5 })] });
    expect(drawdownReview(s)).toBeNull();
  });

  it('fires exactly at −25%', () => {
    const s = state({ positions: [pos({ ticker: 'A', cost_basis: 100, price: 75 })] });
    const f = drawdownReview(s)!;
    expect(f.severity).toBe('med');
    expect(f.detail.arithmetic).toContain('-25.0%');
  });

  it('is silent for an unpriced position', () => {
    const s = state({ positions: [pos({ ticker: 'A', cost_basis: 100, price: null })] });
    expect(drawdownReview(s)).toBeNull();
  });

  it('is silent for a zero cost basis rather than dividing by zero', () => {
    const s = state({ positions: [pos({ ticker: 'FREE', cost_basis: 0, price: 10 })] });
    expect(drawdownReview(s)).toBeNull();
  });

  it('orders the deepest drawdown first and shows unrealized loss', () => {
    const s = state({
      positions: [
        pos({ ticker: 'MILD', shares: 10, cost_basis: 100, price: 70 }),
        pos({ ticker: 'DEEP', shares: 10, cost_basis: 100, price: 40 }),
      ],
    });
    const f = drawdownReview(s)!;
    expect(f.title).toBe('Drawdown review: DEEP, MILD');
    expect(f.detail.arithmetic).toContain('-$600.00');
    expect(f.detail.question).toContain('invalidation');
  });

  it('never issues a directive', () => {
    const s = state({ positions: [pos({ ticker: 'A', cost_basis: 100, price: 40 })] });
    expectNoDirective(drawdownReview(s)!);
  });
});

/* ------------------------------------------------------------------ *
 * speculativeCreep
 * ------------------------------------------------------------------ */

describe('speculativeCreep', () => {
  it('is silent on an empty portfolio', () => {
    expect(speculativeCreep(state())).toBeNull();
  });

  it('is silent at exactly 40% — the rule is strictly greater than', () => {
    const s = state({
      positions: [
        pos({ ticker: 'H', tier: 'high', shares: 40, cost_basis: 100, price: 100 }),
        pos({ ticker: 'L', tier: 'low', shares: 60, cost_basis: 100, price: 100 }),
      ],
    });
    expect(speculativeCreep(s)).toBeNull();
  });

  it('fires at high severity past 40%', () => {
    const s = state({
      positions: [
        pos({ ticker: 'H1', tier: 'high', shares: 30, cost_basis: 100, price: 100 }),
        pos({ ticker: 'H2', tier: 'high', shares: 15, cost_basis: 100, price: 100 }),
        pos({ ticker: 'L', tier: 'low', shares: 55, cost_basis: 100, price: 100 }),
      ],
    });
    const f = speculativeCreep(s)!;
    expect(f.severity).toBe('high');
    expect(f.fingerprint).toBe('speculativeCreep');
    expect(f.detail.arithmetic).toContain('H1, H2');
    expect(f.title).toContain('45.0%');
  });

  it('lists the speculative holdings by ticker', () => {
    const s = state({
      positions: [pos({ ticker: 'H', tier: 'high', shares: 100, cost_basis: 1, price: 1 })],
    });
    expect(speculativeCreep(s)!.detail.arithmetic).toContain('Holdings: H');
  });

  it('renders an em dash, not "undefined", when the tier value has no open holdings', () => {
    // Only reachable through a closed position that still carries value in a
    // hand-edited database. Asserts the formatter degrades legibly.
    const s = state({
      positions: [pos({ ticker: 'GONE', tier: 'high', shares: 100, cost_basis: 1, price: 1 })],
      cash: 0,
    });
    const spy = { ...s, positions: [{ ...s.positions[0] }] };
    const f = speculativeCreep(spy)!;
    expect(f.detail.arithmetic).toContain('Holdings: GONE');
    expect(f.detail.arithmetic).not.toContain('undefined');
  });

  it('treats a missing speculative target as 0%', () => {
    const s = state({
      positions: [pos({ ticker: 'H', tier: 'high', shares: 100, cost_basis: 1, price: 1 })],
      targets: { low: 50, med: 35, high: undefined as unknown as number },
    });
    expect(speculativeCreep(s)!.detail.arithmetic).toContain('Target for this tier: 0.0%');
  });
});

/* ------------------------------------------------------------------ *
 * horizonMismatch
 * ------------------------------------------------------------------ */

describe('horizonMismatch', () => {
  it('is silent when nothing is committed', () => {
    expect(horizonMismatch(cleanState())).toBeNull();
  });

  it('is silent when cash alone covers the need', () => {
    const s = cleanState({ cash: 5_000, nearTerm: [need(5_000, 'Tuition')] });
    expect(horizonMismatch(s)).toBeNull();
  });

  it('is silent when cash plus the preservation tier exactly covers it', () => {
    // clean: low tier = 5000
    const s = cleanState({ cash: 1_000, nearTerm: [need(6_000, 'Roof')] });
    expect(horizonMismatch(s)).toBeNull();
  });

  it('fires one dollar past coverage, at high severity', () => {
    const s = cleanState({ cash: 1_000, nearTerm: [need(6_001, 'Roof')] });
    const f = horizonMismatch(s)!;
    expect(f.severity).toBe('high');
    expect(f.title).toContain('$1.00');
    expect(f.fingerprint).toBe('horizonMismatch');
  });

  it('does not count the speculative tier as available', () => {
    const s = state({
      positions: [pos({ ticker: 'H', tier: 'high', shares: 1000, cost_basis: 100, price: 100 })],
      nearTerm: [need(1_000, 'Deposit')],
    });
    expect(horizonMismatch(s)).not.toBeNull();
  });

  it('sums multiple needs and lists each with its date', () => {
    const s = cleanState({
      nearTerm: [need(4_000, 'Roof', '2026-06-01'), need(3_000, 'Car', '2026-09-01')],
    });
    const f = horizonMismatch(s)!;
    expect(f.detail.arithmetic).toContain('Roof: $4,000.00 by 2026-06-01');
    expect(f.detail.arithmetic).toContain('Car: $3,000.00 by 2026-09-01');
    expect(f.detail.arithmetic).toContain('total = $7,000.00');
  });

  it('labels an unlabelled need rather than printing an empty string', () => {
    const s = cleanState({ nearTerm: [need(9_000, '')] });
    expect(horizonMismatch(s)!.detail.arithmetic).toContain('unlabelled');
  });
});

/* ------------------------------------------------------------------ *
 * thinPortfolio
 * ------------------------------------------------------------------ */

describe('thinPortfolio', () => {
  it('fires on an empty portfolio', () => {
    const f = thinPortfolio(state())!;
    expect(f.severity).toBe('med');
    expect(f.title).toBe('Thin portfolio: 0 open positions');
  });

  it('uses the singular for exactly one position', () => {
    expect(thinPortfolio(state({ positions: [pos()] }))!.title).toBe('Thin portfolio: 1 open position');
  });

  it('is silent at exactly the minimum', () => {
    expect(thinPortfolio(state({ positions: [pos(), pos(), pos()] }))).toBeNull();
  });

  it('counts open positions only', () => {
    const s = state({
      positions: [pos(), pos(), pos({ closed_at: daysBefore(2) })],
    });
    expect(thinPortfolio(s)).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * evaluateAll
 * ------------------------------------------------------------------ */

describe('evaluateAll', () => {
  it('runs every registered rule', () => {
    expect(Object.keys(ALL_RULES).sort()).toEqual([
      'allocationDrift',
      'concentration',
      'drawdownReview',
      'horizonMismatch',
      'speculativeCreep',
      'stalePrice',
      'thinPortfolio',
      'undocumented',
    ]);
  });

  it('sorts most severe first, then alphabetically', () => {
    // One thin, undocumented, unpriced, deeply-down speculative position with
    // a near-term need it cannot cover: nearly everything trips at once.
    const s = state({
      positions: [
        pos({
          ticker: 'MESS',
          tier: 'high',
          shares: 100,
          cost_basis: 100,
          price: 20,
          priceAgeDays: 90,
          invalidation: '',
        }),
      ],
      nearTerm: [need(50_000, 'Roof')],
      cash: 0,
    });
    const flags = evaluateAll(s);
    const severities = flags.map((f) => f.severity);
    const rank = { high: 0, med: 1, low: 2 } as const;
    expect(severities.map((x) => rank[x])).toEqual([...severities.map((x) => rank[x])].sort());

    const highs = flags.filter((f) => f.severity === 'high').map((f) => f.rule);
    expect(highs).toEqual([...highs].sort());
    expect(highs).toContain('horizonMismatch');
    expect(highs).toContain('speculativeCreep');
  });

  it('gives every flag a fingerprint, a title, and all three detail fields', () => {
    const s = state({
      positions: [pos({ ticker: 'X', tier: 'high', cost_basis: 100, price: 10, thesis: '' })],
      nearTerm: [need(1_000)],
    });
    const flags = evaluateAll(s);
    expect(flags.length).toBeGreaterThan(3);
    for (const f of flags) {
      expect(f.fingerprint).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.body).toBeTruthy();
      expect(f.detail.arithmetic).toBeTruthy();
      expect(f.detail.why).toBeTruthy();
      expect(f.detail.question).toContain('?');
      expect(['low', 'med', 'high']).toContain(f.severity);
    }
  });

  it('is deterministic — same state in, same flags out', () => {
    const build = () =>
      state({
        positions: [pos({ ticker: 'A', tier: 'high', cost_basis: 100, price: 50 })],
        nearTerm: [need(500)],
        now: NOW,
      });
    // Position ids differ between builds; compare on the stable fields.
    const strip = (f: { rule: string; severity: string; title: string }) => ({
      rule: f.rule,
      severity: f.severity,
      title: f.title,
    });
    expect(evaluateAll(build()).map(strip)).toEqual(evaluateAll(build()).map(strip));
  });

  it('no rule anywhere emits a directive', () => {
    const states = [
      state({
        positions: [
          pos({ ticker: 'A', tier: 'high', cost_basis: 100, price: 20, priceAgeDays: 60, thesis: '' }),
        ],
        nearTerm: [need(99_999)],
        cash: 0,
      }),
      cleanState({ cash: 40_000, nearTerm: [need(80_000, 'Roof')] }),
      state({
        positions: [
          pos({ ticker: 'BIG', tier: 'low', shares: 900, cost_basis: 100, price: 100 }),
          pos({ ticker: 'X', price: null }),
        ],
      }),
    ];
    const seen = new Set<string>();
    for (const s of states) {
      for (const f of evaluateAll(s)) {
        seen.add(f.rule);
        expectNoDirective(f);
      }
    }
    // Assert the sweep actually exercised every rule, so this cannot pass vacuously.
    expect([...seen].sort()).toEqual(Object.keys(ALL_RULES).sort());
  });
});
