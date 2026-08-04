/**
 * Anthropic integration: the weekly brief and the on-demand gap analysis.
 *
 * Two constraints from the spec shape everything here:
 *
 *   * Every AI claim carries a source URL. The zod schemas require
 *     `source_url` to be a real URL on every claim, so an uncited assertion
 *     fails validation and is never rendered.
 *   * No bare directives. The prompts forbid buy/sell language, and gap
 *     candidates must supply case_for, case_against and wrong_for — each at
 *     least 40 characters — or the response is rejected and retried.
 *
 * On a schema failure we retry once with the validation errors fed back, and
 * if that also fails we store the raw text with status 'schema_error' so the
 * failure is visible in the archive rather than silently swallowed.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { PortfolioState } from './types';
import { hasEnv, requireEnv } from './env';
import { TIER_LABEL } from './types';
import {
  ANTHROPIC_EFFORT,
  ANTHROPIC_MODEL,
  GAP_MIN_FIELD_LENGTH,
  MAX_IDEAS_PER_BRIEF,
  MOVE_ALERT_PCT,
  RULES,
} from './constants';
import { describeMovers, type Mover } from './movers';
import {
  drawdownPct,
  effectiveValue,
  money,
  openPositions,
  pct,
  positionWeight,
  tierWeights,
  totalValue,
} from './portfolio';
import {
  formatZodError,
  gapAnalysisSchema,
  weeklyBriefSchema,
  type GapAnalysis,
  type WeeklyBrief,
} from './validators';

export function isAnthropicConfigured(): boolean {
  return hasEnv('ANTHROPIC_API_KEY');
}

function client(): Anthropic {
  return new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
}

export interface GenerationResult<T> {
  ok: boolean;
  payload: T | null;
  rawText: string;
  sources: string[];
  model: string;
  error: string | null;
  attempts: number;
}

/* ------------------------------------------------------------------ *
 * portfolio → prompt
 * ------------------------------------------------------------------ */

/**
 * The model gets tickers, tiers, weights and — critically — the thesis and
 * invalidation text in my own words. The invalidation checks are only as good
 * as what it is checking against.
 */
function describePortfolio(state: PortfolioState): string {
  const open = openPositions(state);
  const weights = tierWeights(state);
  const total = totalValue(state);

  const positions = open
    .map((p) => {
      const dd = drawdownPct(p);
      return [
        `### ${p.ticker}${p.name ? ` — ${p.name}` : ''}`,
        `- Tier: ${TIER_LABEL[p.tier]}`,
        `- Weight: ${pct(positionWeight(state, p))} of portfolio (${money(effectiveValue(p))})`,
        `- Cost basis: ${money(p.cost_basis)}/share · Current: ${
          p.price === null ? 'no price on file' : `${money(p.price)}/share`
        }${dd === null ? '' : ` (${dd >= 0 ? '+' : ''}${dd.toFixed(1)}% vs cost)`}`,
        `- Opened: ${p.opened_at.slice(0, 10)}`,
        `- MY THESIS: ${p.thesis}`,
        `- MY INVALIDATION CONDITION: ${p.invalidation}`,
      ].join('\n');
    })
    .join('\n\n');

  const targets = (['low', 'med', 'high'] as const)
    .map(
      (t) =>
        `- ${TIER_LABEL[t]}: ${pct(weights[t])} actual vs ${pct(state.targets[t] ?? 0)} target`,
    )
    .join('\n');

  const nearTerm =
    state.nearTerm.length === 0
      ? '- none recorded'
      : state.nearTerm
          .map((n) => `- ${n.label || 'unlabelled'}: ${money(n.amount)} by ${n.need_by.slice(0, 10)}`)
          .join('\n');

  return `## Portfolio as of ${state.now.toISOString().slice(0, 10)}

Total value ${money(total)} (including ${money(state.cash)} uninvested cash), ${open.length} open positions.

### Tier allocation
${targets}

### Near-term cash needs
${nearTerm}

## Positions
${positions || '(no open positions)'}`;
}

/* ------------------------------------------------------------------ *
 * shared model plumbing
 * ------------------------------------------------------------------ */

/** Every URL the model actually visited, for the archive's source list. */
function collectSources(message: Anthropic.Message): string[] {
  const urls = new Set<string>();
  for (const block of message.content) {
    if (block.type === 'web_search_tool_result') {
      const content = block.content as unknown;
      if (Array.isArray(content)) {
        for (const r of content) {
          const url = (r as { url?: string }).url;
          if (url) urls.add(url);
        }
      }
    }
  }
  return [...urls];
}

function collectText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * The model may wrap its JSON in prose or a fenced block. Take the outermost
 * balanced object. Structured outputs are deliberately not used here: they
 * are not usable alongside the server-side web search tool, and the spec's
 * required behaviour (validate, retry once, then store the raw text) needs a
 * parse step we control anyway.
 */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * One request, with the web search tool enabled. Resumes on `pause_turn`,
 * which a long server-side search loop will hit.
 */
async function runOnce(
  system: string,
  userPrompt: string,
): Promise<{ text: string; sources: string[] }> {
  const anthropic = client();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

  const sources = new Set<string>();
  let text = '';

  for (let turn = 0; turn < 5; turn++) {
    const stream = anthropic.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 32_000,
      system,
      messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: ANTHROPIC_EFFORT as Anthropic.OutputConfig['effort'] },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 20 }],
    });

    const message = await stream.finalMessage();
    for (const url of collectSources(message)) sources.add(url);
    text = collectText(message);

    if (message.stop_reason === 'refusal') {
      throw new Error(
        `The model declined the request${
          message.stop_details && 'category' in message.stop_details
            ? ` (${message.stop_details.category})`
            : ''
        }.`,
      );
    }

    // A long web-search loop pauses rather than finishing; echo the turn back
    // and the server resumes where it left off.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    break;
  }

  return { text, sources: [...sources] };
}

/**
 * Runs the prompt, validates, and on failure retries exactly once with the
 * validation errors handed back to the model. Never throws on bad output —
 * a schema failure comes back as a result with ok: false and the raw text.
 */
async function generate<T>(
  system: string,
  userPrompt: string,
  validate: (value: unknown) => { success: true; data: T } | { success: false; error: string },
): Promise<GenerationResult<T>> {
  const allSources = new Set<string>();
  let lastText = '';
  let lastError = 'No response.';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\n---\n\nYour previous response failed schema validation with these errors:\n\n${lastError}\n\nYour previous output was:\n\n${lastText.slice(0, 4000)}\n\nReturn corrected JSON only. No prose outside the JSON object.`;

    let text: string;
    try {
      const run = await runOnce(system, prompt);
      text = run.text;
      for (const url of run.sources) allSources.add(url);
    } catch (err) {
      // A transport or API failure is not a schema failure — stop here.
      return {
        ok: false,
        payload: null,
        rawText: lastText,
        sources: [...allSources],
        model: ANTHROPIC_MODEL,
        error: err instanceof Error ? err.message : 'Request failed.',
        attempts: attempt,
      };
    }

    lastText = text;
    const json = extractJson(text);
    if (json === null) {
      lastError = 'No JSON object found in the response.';
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      lastError = `JSON.parse failed: ${err instanceof Error ? err.message : 'unknown'}`;
      continue;
    }

    const result = validate(parsed);
    if (result.success) {
      return {
        ok: true,
        payload: result.data,
        rawText: text,
        sources: [...allSources],
        model: ANTHROPIC_MODEL,
        error: null,
        attempts: attempt,
      };
    }
    lastError = result.error;
  }

  return {
    ok: false,
    payload: null,
    rawText: lastText,
    sources: [...allSources],
    model: ANTHROPIC_MODEL,
    error: lastError,
    attempts: 2,
  };
}

/* ------------------------------------------------------------------ *
 * weekly brief
 * ------------------------------------------------------------------ */

const BRIEF_SYSTEM = `You are assisting with a weekly review of a single person's investment portfolio. You are a discipline tool, not a signal generator.

Absolute constraints — violating any of these makes your output unusable:

1. NEVER recommend buying, selling, trimming, or adding to anything. Do not
   phrase a conclusion as an action. If you catch yourself writing an
   imperative about a position, rewrite it as an observation plus a question.
2. EVERY factual claim must carry a source URL you actually retrieved via web
   search. If you cannot cite it, omit the claim. An uncited claim will fail
   validation and be discarded.
3. Be honest about what is already priced in. If a point you are making is
   widely held consensus, say so in the already_consensus section — the user
   explicitly wants to know which of your observations offer no edge.
4. For invalidation checks, the question is narrow and literal: has anything
   in the past week matched the specific condition the user wrote down? Not
   "is the thesis under pressure" — has THE STATED CONDITION been met. Answer
   condition_met only if the written condition has literally occurred.
   partial_evidence means something happened that bears on it but does not
   satisfy it. no_evidence is the correct and most common answer, and saying
   it is a success, not a failure to find something.

Return a single JSON object and nothing else. No prose before or after, no
markdown fence.

Schema:
{
  "summary": string,
  "macro_developments": [{
    "claim": string,
    "data_point_to_watch": string,
    "next_release_or_date": string,
    "source_url": string,
    "source_title": string
  }],
  "invalidation_checks": [{
    "ticker": string,
    "invalidation_condition": string,
    "status": "no_evidence" | "partial_evidence" | "condition_met",
    "reasoning": string,
    "evidence": [{ "claim": string, "source_url": string, "source_title": string }]
  }],
  "already_consensus": [{ "point": string, "why_consensus": string, "source_url": string }],
  "questions_for_me": [string, string, string],
  "price_moves": [{
    "ticker": string,
    "pct_change": number,
    "explanation": string,
    "source_url": string
  }],
  "ideas": [{
    "instrument": string,
    "ticker": string,
    "why_now": string,
    "case_for": string,
    "case_against": string,
    "wrong_for": string,
    "source_url": string
  }]
}

The ideas array is the one place you may name something the user does not own.
It is a research list, never a shopping list: no ranking, no ordering that
implies preference, no conviction levels, and every entry must name a real
investor for whom it would be a mistake. An idea you cannot argue against is an
idea you do not understand well enough to raise.`;

export async function generateWeeklyBrief(
  state: PortfolioState,
  movers: Mover[] = [],
): Promise<GenerationResult<WeeklyBrief>> {
  const prompt = `${describePortfolio(state)}

## Holdings that moved at least ${MOVE_ALERT_PCT}% this week
${describeMovers(movers)}

---

Using web search, produce this week's review. Today is ${state.now.toISOString().slice(0, 10)}.

**macro_developments** — developments from the past 7 days that plausibly bear
on this specific portfolio. For each, give the specific data point to watch
next and when it is next published, so the claim can be checked later.

**invalidation_checks** — one entry for every open position, using the exact
invalidation condition quoted above. Echo the condition back in
invalidation_condition so this brief is self-contained when read months from
now. This is the highest-value section: it is the thing the user will not
notice on their own. Search specifically for evidence bearing on each stated
condition rather than for general news about the company.

**already_consensus** — which of your own points above are already widely held
and therefore offer no edge. Be blunt. If most of the brief is consensus, say
so; that is useful information, not an admission of failure.

**price_moves** — one entry for each holding listed as having moved above, and
only those. Search for what actually caused the move and cite it. If you cannot
find a cause, say so plainly in the explanation rather than inventing a
narrative — "no specific news found; moved with the sector" is a valid and
useful answer. Omit any holding not in that list; do not report moves you were
not given.

**ideas** — at most ${MAX_IDEAS_PER_BRIEF}, and zero is a perfectly good
answer. Things worth *researching*, given what this portfolio is missing and
what happened this week. Every one needs why_now, plus case_for, case_against
and wrong_for at ${GAP_MIN_FIELD_LENGTH}+ characters each. Do not rank them, do
not order them by preference, and do not tell the user to buy anything. If
nothing this week genuinely warrants a new idea, return an empty array — a
short honest list beats a padded one.

**questions_for_me** — exactly three questions the user should answer for
themselves. Not questions for you to answer. Questions that a person holding
these specific positions, with these specific written invalidations, should
be able to answer and might not be able to.`;

  return generate<WeeklyBrief>(BRIEF_SYSTEM, prompt, (value) => {
    const parsed = weeklyBriefSchema.safeParse(value);
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: formatZodError(parsed.error) };
  });
}

/* ------------------------------------------------------------------ *
 * gap analysis
 * ------------------------------------------------------------------ */

const GAP_SYSTEM = `You identify missing exposure in a single person's portfolio. You are not a recommendation engine.

Absolute constraints:

1. NEVER rank candidates, order them by preference, or use comparative
   language ("the best option", "I would favour"). Order within a gap is
   arbitrary and must not imply preference.
2. NEVER recommend buying anything. You name instruments worth *researching*.
3. Every candidate REQUIRES all three of case_for, case_against and wrong_for,
   each at least ${GAP_MIN_FIELD_LENGTH} characters of substantive argument.
   wrong_for must describe a real investor for whom this instrument is a
   genuinely bad idea — not a hedge, not a disclaimer, an actual person with
   an actual situation. A candidate missing any of these is discarded.
4. Every candidate carries a source_url — the fund page, prospectus, or
   issuer documentation — that you retrieved via web search.
5. Prefer liquid, low-cost, widely available instruments. Name the vehicle
   type and the expense ratio.

Return a single JSON object and nothing else.

Schema:
{
  "summary": string,
  "gaps": [{
    "dimension": "geography" | "asset_class" | "sector" | "factor" | "duration",
    "observation": string,
    "current_exposure": string,
    "candidates": [{
      "instrument": string,
      "ticker": string,
      "vehicle_type": string,
      "expense_ratio": string,
      "case_for": string,
      "case_against": string,
      "wrong_for": string,
      "source_url": string
    }]
  }]
}`;

export async function generateGapAnalysis(
  state: PortfolioState,
): Promise<GenerationResult<GapAnalysis>> {
  const prompt = `${describePortfolio(state)}

---

Identify exposure this portfolio does not have, across geography, asset class,
sector, factor, and duration. For each gap, state what the current exposure
actually is before saying what is missing.

Then name liquid, low-cost instruments worth researching for that gap. Use web
search to confirm each one exists, is currently available, and to get its
expense ratio and an authoritative URL.

Every candidate needs case_for, case_against, and wrong_for. Take wrong_for
seriously: describe an investor — their horizon, their existing holdings,
their obligations — for whom adding this would be a mistake. If you cannot
name such a person, you do not understand the instrument well enough to list
it, so leave it out.

Do not rank anything. Do not tell the user what to do. This is a research
list, not a shopping list.`;

  return generate<GapAnalysis>(GAP_SYSTEM, prompt, (value) => {
    const parsed = gapAnalysisSchema.safeParse(value);
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: formatZodError(parsed.error) };
  });
}

/** Exposed for the "how the rules relate to the brief" note in the UI. */
export const BRIEF_RULE_CONTEXT = RULES;
