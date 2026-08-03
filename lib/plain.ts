/**
 * Plain English.
 *
 * The finance vocabulary in this app is precise and useless to someone who
 * hasn't met it before. "Cost basis", "invalidation", "drawdown", "allocation
 * drift" all mean something exact, and none of them explain themselves.
 *
 * Every user-facing label goes through here. The precise term is kept where it
 * genuinely matters (so you learn it by seeing it), but the plain phrasing
 * leads and a one-line explainer sits underneath.
 */
import type { Tier } from './types';

/** Tier names, as a person would say them. */
export const TIER_NAME: Record<Tier, string> = {
  low: 'Safe',
  med: 'Balanced',
  high: 'Risky',
};

/** The precise term, kept so it stops being unfamiliar. */
export const TIER_FORMAL: Record<Tier, string> = {
  low: 'Preservation',
  med: 'Diversified',
  high: 'Speculative',
};

export const TIER_HELP: Record<Tier, string> = {
  low: 'Money that has to still be there on a specific date. Bonds, cash, steady holdings. It grows slowly — that is the trade.',
  med: 'Broad funds that hold hundreds of companies at once. You are not betting on any single one. This is most people\'s biggest slice.',
  high: 'Individual companies or specific bets. Highest upside, and the only slice where you can lose most of what you put in.',
};

/** One-line explainers for the terms that appear as column headings. */
export const TERM: Record<string, { plain: string; help: string }> = {
  cost_basis: {
    plain: 'You paid',
    help: 'What you paid per share, not the total.',
  },
  price: {
    plain: 'Now worth',
    help: 'The most recent price we have for one share.',
  },
  value: {
    plain: 'Total value',
    help: 'Shares × current price.',
  },
  weight: {
    plain: 'Share of portfolio',
    help: 'How much of everything you own is this one holding.',
  },
  unrealized: {
    plain: 'Up / down',
    help: 'Profit or loss on paper. It is not real money until you sell.',
  },
  realized: {
    plain: 'Actual profit',
    help: 'What you really made or lost, because you already sold.',
  },
  drawdown: {
    plain: 'vs. what you paid',
    help: 'How far the price has moved from your purchase price, as a percentage.',
  },
  thesis: {
    plain: 'Why you bought it',
    help: 'Your reason, in your own words. Future you will want to know.',
  },
  invalidation: {
    plain: 'What would prove you wrong',
    help: 'A specific thing that could happen which would mean your reason no longer holds. Not "if it drops" — something real, like "if they lose their biggest customer".',
  },
  cash: {
    plain: 'Cash',
    help: 'Money in the account you have not invested yet.',
  },
  near_term: {
    plain: 'Money you need soon',
    help: 'Amounts you already know you will have to spend, and roughly when.',
  },
  target: {
    plain: 'Target',
    help: 'The mix you decided on when you were thinking clearly, in percent.',
  },
  drift: {
    plain: 'Off target',
    help: 'How far your actual mix has wandered from your target. The market moves this on its own.',
  },
};

/** Plain-English titles for each rule, and what it is protecting you from. */
export const RULE_PLAIN: Record<string, { title: string; help: string }> = {
  allocationDrift: {
    title: 'Your mix has shifted',
    help: 'You picked a target split between safe, balanced, and risky. The market has pushed you away from it without asking.',
  },
  concentration: {
    title: 'Too much in one thing',
    help: 'One holding has grown large enough that its bad day becomes your bad day.',
  },
  undocumented: {
    title: 'Missing your reasoning',
    help: 'You own something without having written down why, or what would change your mind.',
  },
  stalePrice: {
    title: 'Prices are out of date',
    help: 'We have not been able to get a fresh price, so some numbers on screen are guesses.',
  },
  drawdownReview: {
    title: 'Something is well down',
    help: 'A holding has fallen a long way from what you paid. Worth re-reading why you bought it.',
  },
  speculativeCreep: {
    title: 'Getting risky',
    help: 'Your risky slice has quietly grown — usually because it went up, which is exactly when people stop noticing.',
  },
  horizonMismatch: {
    title: 'You may be short on cash',
    help: 'Money you have said you need soon is more than what you can safely get to without selling something at a bad moment.',
  },
  thinPortfolio: {
    title: 'Not much here yet',
    help: 'With only a couple of holdings, most of these checks cannot tell you much.',
  },
};

export const SEVERITY_PLAIN: Record<string, string> = {
  high: 'Look now',
  med: 'Worth a look',
  low: 'Minor',
};

export function ruleTitle(rule: string, fallback: string): string {
  return RULE_PLAIN[rule]?.title ?? fallback;
}

export function ruleHelp(rule: string): string | null {
  return RULE_PLAIN[rule]?.help ?? null;
}
