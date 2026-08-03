/**
 * The rules engine.
 *
 * Every function here is pure: portfolio state in, `RuleFlag | null` out. No
 * database, no clock, no network — `state.now` is supplied by the caller so
 * the whole engine is deterministic under test.
 *
 * A rule fires when a number crosses a threshold *you* set in
 * `lib/constants.ts`. It states the arithmetic that tripped it, why the
 * threshold exists, and asks you a question. It does not decide anything and
 * it never says buy or sell.
 *
 * Where several items trip the same rule, the rule emits one flag that names
 * all of them rather than a burst of near-identical flags. Severity is taken
 * from the worst offender.
 */
import { RULES } from './constants';
import type { PortfolioState, PricedPosition, RuleFlag, Severity } from './types';
import { TIERS, TIER_LABEL } from './types';
import {
  drawdownPct,
  effectiveValue,
  money,
  nearTermTotal,
  openPositions,
  pct,
  positionWeight,
  priceAgeDays,
  tierValue,
  tierWeights,
  totalValue,
} from './portfolio';

const label = (p: PricedPosition) => p.ticker;

/* ------------------------------------------------------------------ *
 * allocationDrift — any tier ≥5 points off its target
 * ------------------------------------------------------------------ */

export function allocationDrift(state: PortfolioState): RuleFlag | null {
  if (totalValue(state) <= 0) return null;

  const weights = tierWeights(state);
  const drifted = TIERS.map((tier) => {
    const target = state.targets[tier] ?? 0;
    const actual = weights[tier];
    return { tier, target, actual, drift: actual - target };
  }).filter((d) => Math.abs(d.drift) >= RULES.allocationDrift.points);

  if (drifted.length === 0) return null;

  const worst = Math.max(...drifted.map((d) => Math.abs(d.drift)));
  const severity: Severity =
    worst >= RULES.allocationDrift.highPoints
      ? RULES.allocationDrift.highSeverity
      : RULES.allocationDrift.severity;

  const lines = drifted.map(
    (d) =>
      `${TIER_LABEL[d.tier]}: ${pct(d.actual)} actual − ${pct(d.target)} target = ${
        d.drift >= 0 ? '+' : ''
      }${d.drift.toFixed(1)} points`,
  );

  return {
    rule: 'allocationDrift',
    severity,
    title: `Allocation drift: ${drifted.length} tier${drifted.length === 1 ? '' : 's'} off target`,
    body: `${drifted
      .map((d) => TIER_LABEL[d.tier])
      .join(', ')} ${drifted.length === 1 ? 'is' : 'are'} at least ${
      RULES.allocationDrift.points
    } points away from the weight you chose.`,
    fingerprint: `allocationDrift:${drifted
      .map((d) => d.tier)
      .sort()
      .join(',')}`,
    detail: {
      arithmetic: `${lines.join('\n')}\nThreshold: ±${RULES.allocationDrift.points} points (±${
        RULES.allocationDrift.highPoints
      } escalates to high)\nPortfolio total: ${money(totalValue(state))}`,
      why: RULES.allocationDrift.why,
      question:
        'Did the market move you here, or did you change your mind? If you changed your mind, edit the target. If the market moved you, say what you are going to do about it and by when.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * concentration — any single position ≥25% of the portfolio
 * ------------------------------------------------------------------ */

export function concentration(state: PortfolioState): RuleFlag | null {
  const total = totalValue(state);
  if (total <= 0) return null;

  const heavy = openPositions(state)
    .map((p) => ({ p, weight: positionWeight(state, p) }))
    .filter((x) => x.weight >= RULES.concentration.pct)
    .sort((a, b) => b.weight - a.weight);

  if (heavy.length === 0) return null;

  const worst = heavy[0].weight;
  const severity: Severity =
    worst >= RULES.concentration.highPct
      ? RULES.concentration.highSeverity
      : RULES.concentration.severity;

  const lines = heavy.map(
    (x) =>
      `${label(x.p)}: ${money(effectiveValue(x.p))} ÷ ${money(total)} = ${pct(x.weight)}`,
  );

  return {
    rule: 'concentration',
    severity,
    title: `Concentration: ${heavy.map((x) => label(x.p)).join(', ')}`,
    body: `${heavy.length === 1 ? 'One position is' : `${heavy.length} positions are`} at or above ${
      RULES.concentration.pct
    }% of the portfolio.`,
    fingerprint: `concentration:${heavy
      .map((x) => x.p.ticker)
      .sort()
      .join(',')}`,
    detail: {
      arithmetic: `${lines.join('\n')}\nThreshold: ${RULES.concentration.pct}% (${
        RULES.concentration.highPct
      }% escalates to high)`,
      why: RULES.concentration.why,
      question: `If ${label(
        heavy[0].p,
      )} fell 50% tomorrow, the portfolio takes a ${pct(worst / 2)} hit. Is that a number you would accept in advance, in writing? If yes, note it and move on. If no, what size would you accept?`,
    },
  };
}

/* ------------------------------------------------------------------ *
 * undocumented — empty thesis or invalidation
 * ------------------------------------------------------------------ */

export function undocumented(state: PortfolioState): RuleFlag | null {
  const bad = openPositions(state).filter(
    (p) => !p.thesis?.trim() || !p.invalidation?.trim(),
  );
  if (bad.length === 0) return null;

  const lines = bad.map((p) => {
    const missing: string[] = [];
    if (!p.thesis?.trim()) missing.push('thesis');
    if (!p.invalidation?.trim()) missing.push('invalidation');
    return `${label(p)}: missing ${missing.join(' and ')}`;
  });

  return {
    rule: 'undocumented',
    severity: RULES.undocumented.severity,
    title: `Undocumented: ${bad.map(label).join(', ')}`,
    body: `${bad.length} open position${
      bad.length === 1 ? '' : 's'
    } cannot be falsified, because the condition that would prove you wrong was never written down.`,
    fingerprint: `undocumented:${bad
      .map((p) => p.id)
      .sort((a, b) => a - b)
      .join(',')}`,
    detail: {
      arithmetic: `${lines.join('\n')}\nOpen positions: ${openPositions(state).length}\nUndocumented: ${
        bad.length
      }`,
      why: RULES.undocumented.why,
      question:
        'For each of these: what specific, observable event would make you say "I was wrong about this"? If you cannot name one, that is the finding — write down that you could not.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * stalePrice — latest price older than 14 days (or never fetched)
 * ------------------------------------------------------------------ */

export function stalePrice(state: PortfolioState): RuleFlag | null {
  const stale = openPositions(state)
    .map((p) => ({ p, age: priceAgeDays(p, state.now) }))
    .filter((x) => x.age === null || x.age > RULES.stalePrice.days)
    .sort((a, b) => (b.age ?? Infinity) - (a.age ?? Infinity));

  if (stale.length === 0) return null;

  const lines = stale.map((x) =>
    x.age === null
      ? `${label(x.p)}: never priced — valued at cost basis ${money(x.p.basis_value)}`
      : `${label(x.p)}: last price ${money(x.p.price ?? 0)} observed ${x.age.toFixed(
          1,
        )} days ago (${x.p.price_as_of})`,
  );

  return {
    rule: 'stalePrice',
    severity: RULES.stalePrice.severity,
    title: `Stale prices: ${stale.map((x) => label(x.p)).join(', ')}`,
    body: `${stale.length} position${
      stale.length === 1 ? ' has' : 's have'
    } no price newer than ${RULES.stalePrice.days} days. Every percentage on this screen that involves ${
      stale.length === 1 ? 'it' : 'them'
    } is provisional.`,
    fingerprint: `stalePrice:${stale
      .map((x) => x.p.ticker)
      .sort()
      .join(',')}`,
    detail: {
      arithmetic: `${lines.join('\n')}\nThreshold: ${RULES.stalePrice.days} days\nEvaluated at: ${state.now.toISOString()}`,
      why: RULES.stalePrice.why,
      question:
        'Is this a fetch failure, a delisting, or something you stopped tracking on purpose? Refresh prices; if a ticker still will not resolve, decide whether the position is still real.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * drawdownReview — position ≥25% below cost basis
 * ------------------------------------------------------------------ */

export function drawdownReview(state: PortfolioState): RuleFlag | null {
  const down = openPositions(state)
    .map((p) => ({ p, dd: drawdownPct(p) }))
    .filter((x): x is { p: PricedPosition; dd: number } => x.dd !== null && x.dd <= -RULES.drawdownReview.pct)
    .sort((a, b) => a.dd - b.dd);

  if (down.length === 0) return null;

  const lines = down.map(
    (x) =>
      `${label(x.p)}: (${money(x.p.price!)} − ${money(x.p.cost_basis)}) ÷ ${money(
        x.p.cost_basis,
      )} = ${x.dd.toFixed(1)}%  ·  unrealized ${money(
        (x.p.price! - x.p.cost_basis) * x.p.shares,
      )}`,
  );

  return {
    rule: 'drawdownReview',
    severity: RULES.drawdownReview.severity,
    title: `Drawdown review: ${down.map((x) => label(x.p)).join(', ')}`,
    body: `${down.length} position${
      down.length === 1 ? ' is' : 's are'
    } at least ${RULES.drawdownReview.pct}% below cost. This is a review prompt, not a verdict.`,
    fingerprint: `drawdownReview:${down
      .map((x) => x.p.ticker)
      .sort()
      .join(',')}`,
    detail: {
      arithmetic: `${lines.join('\n')}\nThreshold: −${RULES.drawdownReview.pct}% against cost basis`,
      why: RULES.drawdownReview.why,
      question: `Re-read what you wrote as the invalidation for ${down
        .map((x) => label(x.p))
        .join(', ')}. Has it happened? If it has, the price is irrelevant. If it has not, the price is also irrelevant — say which, and say why.`,
    },
  };
}

/* ------------------------------------------------------------------ *
 * speculativeCreep — high tier above 40% of the portfolio
 * ------------------------------------------------------------------ */

export function speculativeCreep(state: PortfolioState): RuleFlag | null {
  const total = totalValue(state);
  if (total <= 0) return null;

  const weight = tierWeights(state).high;
  if (weight <= RULES.speculativeCreep.pct) return null;

  const value = tierValue(state, 'high');
  const names = openPositions(state)
    .filter((p) => p.tier === 'high')
    .map(label);

  return {
    rule: 'speculativeCreep',
    severity: RULES.speculativeCreep.severity,
    title: `Speculative creep: ${pct(weight)} of the portfolio`,
    body: `The speculative tier has grown past ${RULES.speculativeCreep.pct}% of everything you own.`,
    fingerprint: 'speculativeCreep',
    detail: {
      arithmetic: `SPECULATIVE ${money(value)} ÷ portfolio ${money(total)} = ${pct(
        weight,
      )}\nThreshold: ${RULES.speculativeCreep.pct}%\nHoldings: ${names.join(', ') || '—'}\nTarget for this tier: ${pct(
        state.targets.high ?? 0,
      )}`,
      why: RULES.speculativeCreep.why,
      question:
        'Did you add to this tier, or did it grow on you? Those need different responses. If it grew, are you comfortable that a 50% drawdown here is now a portfolio-level event?',
    },
  };
}

/* ------------------------------------------------------------------ *
 * horizonMismatch — near-term needs exceed cash + preservation tier
 * ------------------------------------------------------------------ */

export function horizonMismatch(state: PortfolioState): RuleFlag | null {
  const need = nearTermTotal(state);
  if (need <= 0) return null;

  const lowValue = tierValue(state, 'low');
  const available = state.cash + lowValue;
  if (need <= available) return null;

  const shortfall = need - available;
  const needLines = state.nearTerm.map(
    (n) => `  ${n.label || 'unlabelled'}: ${money(n.amount)} by ${n.need_by}`,
  );

  return {
    rule: 'horizonMismatch',
    severity: RULES.horizonMismatch.severity,
    title: `Horizon mismatch: ${money(shortfall)} short`,
    body: `You have committed to ${money(
      need,
    )} of near-term spending backed by ${money(available)} of cash and preservation assets.`,
    fingerprint: 'horizonMismatch',
    detail: {
      arithmetic: `Near-term needs:\n${needLines.join('\n')}\n  total = ${money(
        need,
      )}\nCash ${money(state.cash)} + PRESERVATION ${money(lowValue)} = ${money(
        available,
      )}\n${money(need)} − ${money(available)} = ${money(shortfall)} shortfall`,
      why: RULES.horizonMismatch.why,
      question:
        'Which is wrong — the date, the amount, or the allocation? One of the three has to move. Pick it now, while the market is not picking it for you.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * thinPortfolio — fewer than 3 open positions
 * ------------------------------------------------------------------ */

export function thinPortfolio(state: PortfolioState): RuleFlag | null {
  const count = openPositions(state).length;
  if (count >= RULES.thinPortfolio.minPositions) return null;

  return {
    rule: 'thinPortfolio',
    severity: RULES.thinPortfolio.severity,
    title: `Thin portfolio: ${count} open position${count === 1 ? '' : 's'}`,
    body: `Below ${RULES.thinPortfolio.minPositions} positions, the portfolio-level rules on this page are measuring almost nothing.`,
    fingerprint: 'thinPortfolio',
    detail: {
      arithmetic: `Open positions: ${count}\nThreshold: ${RULES.thinPortfolio.minPositions}\nPortfolio value: ${money(
        totalValue(state),
      )} (cash ${money(state.cash)})`,
      why: RULES.thinPortfolio.why,
      question:
        'Is this a portfolio you are building, or a portfolio you have wound down? If you are building it, what is the intended shape and how far in are you?',
    },
  };
}

/* ------------------------------------------------------------------ *
 * registry
 * ------------------------------------------------------------------ */

export type Rule = (state: PortfolioState) => RuleFlag | null;

export const ALL_RULES: Record<string, Rule> = {
  allocationDrift,
  concentration,
  undocumented,
  stalePrice,
  drawdownReview,
  speculativeCreep,
  horizonMismatch,
  thinPortfolio,
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, med: 1, low: 2 };

/** Runs every rule. Most severe first, then alphabetically by rule name. */
export function evaluateAll(state: PortfolioState): RuleFlag[] {
  return Object.values(ALL_RULES)
    .map((rule) => rule(state))
    .filter((f): f is RuleFlag => f !== null)
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule),
    );
}
