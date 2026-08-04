import { z } from 'zod';
import { GAP_MIN_FIELD_LENGTH } from './constants';

/* ------------------------------------------------------------------ *
 * API input
 * ------------------------------------------------------------------ */

const tier = z.enum(['low', 'med', 'high']);

/**
 * Note the two `.min(1)` calls on thesis and invalidation. They are the whole
 * point. The database has matching CHECK constraints; this layer exists so
 * the error message is legible instead of a SQLite constraint code.
 */
export const positionCreateSchema = z.object({
  ticker: z.string().trim().min(1, 'Ticker is required.').max(20),
  name: z.string().trim().max(120).optional().default(''),
  tier,
  shares: z.coerce.number().positive('Shares must be greater than zero.'),
  cost_basis: z.coerce.number().nonnegative('Cost basis cannot be negative.'),
  thesis: z.string().trim().min(1, 'Thesis is required. Why do you own this?'),
  invalidation: z
    .string()
    .trim()
    .min(
      1,
      'Invalidation is required. What specifically would have to happen for you to conclude you were wrong?',
    ),
  opened_at: z.string().optional(),
});

export const positionUpdateSchema = positionCreateSchema.partial().extend({
  // Partial must not become a hole through which an empty invalidation fits.
  thesis: z.string().trim().min(1, 'Thesis cannot be emptied.').optional(),
  invalidation: z.string().trim().min(1, 'Invalidation cannot be emptied.').optional(),
});

export const positionCloseSchema = z.object({
  close_price: z.coerce.number().nonnegative(),
  closed_at: z.string().optional(),
});

export const resolveFlagSchema = z.object({
  note: z
    .string()
    .trim()
    .min(
      1,
      'A resolution note is required. Dismissing a flag without writing why defeats the point of having it.',
    ),
});

export const targetsSchema = z.object({
  low: z.coerce.number().min(0).max(100),
  med: z.coerce.number().min(0).max(100),
  high: z.coerce.number().min(0).max(100),
});

export const nearTermSchema = z.object({
  amount: z.coerce.number().nonnegative(),
  need_by: z.string().min(1, 'A date is required — that is what makes it near-term.'),
  label: z.string().trim().max(120).optional().default(''),
});

export const cashSchema = z.object({ amount: z.coerce.number().nonnegative() });

const longEnough = (field: string) =>
  z
    .string()
    .trim()
    .min(
      GAP_MIN_FIELD_LENGTH,
      `${field} must be a real argument, not a phrase — at least ${GAP_MIN_FIELD_LENGTH} characters.`,
    );

/* ------------------------------------------------------------------ *
 * weekly brief — the model's output shape
 * ------------------------------------------------------------------ */

/**
 * Every claim carries a source URL. This is not decoration: if the model
 * cannot cite it, the object fails validation and the claim is not rendered.
 */
const sourced = z.object({
  claim: z.string().min(1),
  source_url: z.string().url('Every claim must carry a resolvable source URL.'),
  source_title: z.string().min(1),
});

export const macroDevelopmentSchema = sourced.extend({
  /** The specific number to watch next, so the claim is checkable later. */
  data_point_to_watch: z.string().min(1),
  next_release_or_date: z.string().min(1),
});

export const invalidationCheckSchema = z.object({
  ticker: z.string().min(1),
  /** Echoed back so the archive is self-contained six months from now. */
  invalidation_condition: z.string().min(1),
  status: z.enum(['no_evidence', 'partial_evidence', 'condition_met']),
  reasoning: z.string().min(1),
  evidence: z.array(sourced).default([]),
});

export const consensusPointSchema = z.object({
  point: z.string().min(1),
  why_consensus: z.string().min(1),
  source_url: z.string().url(),
});

/** A holding that moved, with the model's explanation and a citation. */
export const priceMoveSchema = z.object({
  ticker: z.string().min(1),
  pct_change: z.number(),
  explanation: z.string().min(1),
  source_url: z.string().url('A price move needs a source explaining it.'),
});

/**
 * An idea surfaced alongside the brief. Same three-sided requirement as gap
 * analysis: if it cannot argue against itself, it does not get rendered.
 */
export const ideaSchema = z.object({
  instrument: z.string().min(1),
  ticker: z.string().min(1),
  why_now: z.string().min(1),
  case_for: longEnough('case_for'),
  case_against: longEnough('case_against'),
  wrong_for: longEnough('wrong_for'),
  source_url: z.string().url(),
});

export const weeklyBriefSchema = z.object({
  summary: z.string().min(1),
  macro_developments: z.array(macroDevelopmentSchema),
  invalidation_checks: z.array(invalidationCheckSchema),
  already_consensus: z.array(consensusPointSchema),
  questions_for_me: z.array(z.string().min(1)).min(3).max(3),
  // Defaulted so briefs generated before these sections existed still parse
  // and still render in the archive.
  price_moves: z.array(priceMoveSchema).default([]),
  ideas: z.array(ideaSchema).max(3).default([]),
});

export type WeeklyBrief = z.infer<typeof weeklyBriefSchema>;

/* ------------------------------------------------------------------ *
 * gap analysis
 * ------------------------------------------------------------------ */

/**
 * A candidate that cannot argue against itself is not rendered. `wrong_for`
 * is the field that keeps this from becoming a recommendation engine: every
 * idea has to name the person it is wrong for.
 */
export const gapCandidateSchema = z.object({
  instrument: z.string().min(1),
  ticker: z.string().min(1),
  vehicle_type: z.string().min(1),
  expense_ratio: z.string().min(1),
  case_for: longEnough('case_for'),
  case_against: longEnough('case_against'),
  wrong_for: longEnough('wrong_for'),
  source_url: z.string().url(),
});

export const gapSchema = z.object({
  dimension: z.enum(['geography', 'asset_class', 'sector', 'factor', 'duration']),
  observation: z.string().min(1),
  current_exposure: z.string().min(1),
  candidates: z.array(gapCandidateSchema).min(1),
});

export const gapAnalysisSchema = z.object({
  summary: z.string().min(1),
  gaps: z.array(gapSchema),
});

export type GapAnalysis = z.infer<typeof gapAnalysisSchema>;

/* ------------------------------------------------------------------ *
 * helper
 * ------------------------------------------------------------------ */

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}
