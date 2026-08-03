import type { Severity } from './types';
import { env } from './env';

/**
 * Every threshold in the rules engine lives here. Change a number in this
 * object and the engine changes. Nothing else in the codebase hard-codes a
 * threshold — if you find one that does, it is a bug.
 *
 * These are *your* numbers. They are not defensible in the abstract; they are
 * defensible because you picked them while calm and wrote them down.
 */
export const RULES = {
  /** Any tier ≥ N points away from its target weight. */
  allocationDrift: {
    points: 5,
    highPoints: 15,
    severity: 'med' as Severity,
    highSeverity: 'high' as Severity,
    why: 'Targets are the allocation you chose while calm. Drift is the market choosing for you. Five points is roughly the point at which drift stops being noise and starts being a decision you did not make.',
  },

  /** Any single position at or above N% of the portfolio. */
  concentration: {
    pct: 25,
    highPct: 40,
    severity: 'med' as Severity,
    highSeverity: 'high' as Severity,
    why: 'At a quarter of the portfolio, one position\'s idiosyncratic risk dominates everything you did to diversify. At 40% the rest of the portfolio is mostly decoration.',
  },

  /** Any position missing a thesis or an invalidation condition. */
  undocumented: {
    severity: 'med' as Severity,
    why: 'A position without a written invalidation cannot be falsified, so it cannot be exited on evidence — only on emotion. Writing it down before you need it is the entire discipline.',
  },

  /** Latest observed price older than N days. */
  stalePrice: {
    days: 14,
    severity: 'low' as Severity,
    why: 'Everything downstream — weights, drawdowns, drift — is computed from these prices. A stale price silently corrupts every other number on the screen.',
  },

  /** Position at or below −N% against its cost basis. */
  drawdownReview: {
    pct: 25,
    severity: 'med' as Severity,
    why: 'A quarter down is large enough that the market is telling you something, and small enough that you can still act deliberately. This is a prompt to re-read your invalidation, not a prompt to sell.',
  },

  /** Speculative (high) tier above N% of the portfolio. */
  speculativeCreep: {
    pct: 40,
    severity: 'high' as Severity,
    why: 'Speculative positions grow into the portfolio when they win, which is exactly when you least want to notice. Past this line, a normal drawdown in the speculative book becomes a portfolio-level event.',
  },

  /** Near-term cash needs exceeding liquid + preservation assets. */
  horizonMismatch: {
    severity: 'high' as Severity,
    why: 'Money you need on a date cannot be exposed to a market that does not know about your date. This is the one flag that can force a sale at the worst possible moment, which is why it is high severity every time.',
  },

  /** Fewer than N open positions. */
  thinPortfolio: {
    minPositions: 3,
    severity: 'med' as Severity,
    why: 'Below three positions, portfolio-level thinking is a fiction — you own a couple of bets, and the outcome is dominated by whichever one moves. Position-level rules stop protecting you.',
  },
} as const;

/** Fetch a given ticker at most once per hour. Free tiers are stingy. */
export const PRICE_CACHE_TTL_MS = 60 * 60 * 1000;

/** A ticker the provider rejected is not re-tried for this long. */
export const PRICE_NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Prices older than this get a stale badge in the UI. Matches the rule. */
export const STALE_PRICE_DAYS = RULES.stalePrice.days;

/**
 * The model used for briefs and gap analysis. Overridable via env so the
 * choice is not buried in code.
 */
export const ANTHROPIC_MODEL = env('ANTHROPIC_MODEL', 'claude-opus-5');

/** Thinking depth for brief generation. */
export const ANTHROPIC_EFFORT = env('ANTHROPIC_EFFORT', 'max');

/** Gap-analysis candidates must argue against themselves at this length. */
export const GAP_MIN_FIELD_LENGTH = 40;
