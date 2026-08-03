import { buildPortfolioState, insertBrief } from './queries';
import { generateGapAnalysis, generateWeeklyBrief, isAnthropicConfigured } from './anthropic';
import type { BriefKind, BriefRow } from './types';

export interface RunOutcome {
  configured: boolean;
  brief: BriefRow | null;
  ok: boolean;
  error: string | null;
  attempts: number;
}

/**
 * Generates a brief and stores it — including when validation fails.
 *
 * A failed generation is written with status 'schema_error' plus the raw text
 * and the error, so the archive records that the model produced garbage on a
 * given date instead of that date simply being missing. Being able to count
 * the failures later is the point.
 */
export async function runBrief(kind: BriefKind): Promise<RunOutcome> {
  if (!isAnthropicConfigured()) {
    return { configured: false, brief: null, ok: false, error: 'ANTHROPIC_API_KEY is not set.', attempts: 0 };
  }

  const state = buildPortfolioState();
  const result =
    kind === 'weekly' ? await generateWeeklyBrief(state) : await generateGapAnalysis(state);

  const brief = insertBrief({
    kind,
    payload: result.payload,
    model: result.model,
    sources: result.sources,
    status: result.ok ? 'ok' : 'schema_error',
    error: result.error,
    raw_text: result.ok ? null : result.rawText,
  });

  return {
    configured: true,
    brief,
    ok: result.ok,
    error: result.error,
    attempts: result.attempts,
  };
}
