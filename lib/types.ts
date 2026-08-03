export type Tier = 'low' | 'med' | 'high';
export type Severity = 'low' | 'med' | 'high';

export const TIERS: Tier[] = ['low', 'med', 'high'];

export const TIER_LABEL: Record<Tier, string> = {
  low: 'PRESERVATION',
  med: 'DIVERSIFIED',
  high: 'SPECULATIVE',
};

export interface Position {
  id: number;
  ticker: string;
  name: string;
  tier: Tier;
  shares: number;
  cost_basis: number;
  /** What would have to happen for me to conclude I was wrong. Required. */
  thesis: string;
  invalidation: string;
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
}

export interface PriceRow {
  id: number;
  ticker: string;
  price: number;
  as_of: string;
  source: string;
}

export interface Snapshot {
  id: number;
  taken_at: string;
  total_value: number;
  total_basis: number;
  by_tier_json: string;
}

export interface Target {
  tier: Tier;
  target_pct: number;
}

export interface NearTerm {
  id: number;
  amount: number;
  need_by: string;
  label: string;
}

/**
 * What a rule renders. `arithmetic` is the numbers that tripped it, `why` is
 * the reason the threshold exists, `question` is the thing I have to answer.
 * A flag never tells me what to do.
 */
export interface FlagDetail {
  arithmetic: string;
  why: string;
  question: string;
}

export interface Flag {
  id: number;
  raised_at: string;
  rule: string;
  severity: Severity;
  title: string;
  body: string;
  detail_json: string;
  fingerprint: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

/** The shape `lib/rules.ts` emits. `id` and timestamps are assigned on save. */
export interface RuleFlag {
  rule: string;
  severity: Severity;
  title: string;
  body: string;
  fingerprint: string;
  detail: FlagDetail;
}

export type BriefKind = 'weekly' | 'gaps';
export type BriefStatus = 'ok' | 'schema_error';

export interface BriefRow {
  id: number;
  generated_at: string;
  kind: BriefKind;
  payload_json: string;
  model: string;
  sources_json: string;
  status: BriefStatus;
  error: string | null;
  raw_text: string | null;
}

/** A position joined with its most recent observed price. */
export interface PricedPosition extends Position {
  price: number | null;
  price_as_of: string | null;
  price_source: string | null;
  /** shares * price, or null when no price has ever been observed. */
  market_value: number | null;
  /** shares * cost_basis. Always known. */
  basis_value: number;
}

/**
 * Everything the rules engine needs. Pure data — no db handles, no clock,
 * no network. `now` is passed in so rules are deterministic under test.
 */
export interface PortfolioState {
  positions: PricedPosition[];
  targets: Record<Tier, number>;
  nearTerm: NearTerm[];
  /** Uninvested cash, in the same currency as everything else. */
  cash: number;
  now: Date;
}
