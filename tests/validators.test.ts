import { describe, expect, it } from 'vitest';
import { extractJson } from '../lib/anthropic';
import { gapCandidateSchema, weeklyBriefSchema } from '../lib/validators';
import { GAP_MIN_FIELD_LENGTH } from '../lib/constants';

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a fenced block', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nHope that helps.')).toBe('{"a":1}');
  });

  it('unwraps an unlabelled fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips prose either side of a bare object', () => {
    expect(extractJson('Sure. {"a":1} Let me know.')).toBe('{"a":1}');
  });

  it('takes the whole object when it nests', () => {
    expect(extractJson('{"a":{"b":{"c":2}},"d":3}')).toBe('{"a":{"b":{"c":2}},"d":3}');
  });

  it('is not fooled by braces inside strings', () => {
    const text = '{"note":"a } brace and a { brace","x":1}';
    expect(extractJson(text)).toBe(text);
  });

  it('is not fooled by an escaped quote before a brace', () => {
    const text = '{"note":"he said \\"} \\" to me","x":1}';
    expect(extractJson(text)).toBe(text);
  });

  it('returns null when there is no object', () => {
    expect(extractJson('I could not complete this request.')).toBeNull();
  });

  it('returns null on an unbalanced object rather than a truncated one', () => {
    expect(extractJson('{"a":1')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The two constraints the schemas exist to enforce.
 * ------------------------------------------------------------------ */

const validBrief = {
  summary: 'A summary.',
  macro_developments: [
    {
      claim: 'Something happened.',
      data_point_to_watch: 'The next print.',
      next_release_or_date: '2026-04-10',
      source_url: 'https://example.com/a',
      source_title: 'Example',
    },
  ],
  invalidation_checks: [
    {
      ticker: 'AAA',
      invalidation_condition: 'A competitor ships an equivalent tool.',
      status: 'no_evidence',
      reasoning: 'Nothing found this week.',
      evidence: [],
    },
  ],
  already_consensus: [
    { point: 'Rates matter.', why_consensus: 'Everyone says so.', source_url: 'https://example.com/b' },
  ],
  questions_for_me: ['One?', 'Two?', 'Three?'],
};

describe('weeklyBriefSchema', () => {
  it('accepts a well-formed brief', () => {
    expect(weeklyBriefSchema.safeParse(validBrief).success).toBe(true);
  });

  it('rejects a macro claim without a source URL', () => {
    const bad = structuredClone(validBrief);
    // @ts-expect-error deliberately removing a required field
    delete bad.macro_developments[0].source_url;
    expect(weeklyBriefSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a source that is not a URL', () => {
    const bad = structuredClone(validBrief);
    bad.macro_developments[0].source_url = 'according to my research';
    const result = weeklyBriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('source URL');
    }
  });

  it('rejects evidence inside an invalidation check that lacks a source', () => {
    const bad = structuredClone(validBrief);
    bad.invalidation_checks[0].evidence = [
      // @ts-expect-error deliberately incomplete
      { claim: 'It happened.', source_title: 'Somewhere' },
    ];
    expect(weeklyBriefSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invented invalidation status', () => {
    const bad = structuredClone(validBrief);
    bad.invalidation_checks[0].status = 'probably_fine';
    expect(weeklyBriefSchema.safeParse(bad).success).toBe(false);
  });

  it('requires exactly three questions', () => {
    for (const questions of [['One?'], ['One?', 'Two?'], ['1?', '2?', '3?', '4?']]) {
      const bad = { ...validBrief, questions_for_me: questions };
      expect(weeklyBriefSchema.safeParse(bad).success).toBe(false);
    }
  });
});

const validCandidate = {
  instrument: 'Example Total International Stock ETF',
  ticker: 'EXUS',
  vehicle_type: 'ETF',
  expense_ratio: '0.07%',
  case_for: 'Broad ex-US equity exposure at a low expense ratio, covering developed and emerging markets in one holding.',
  case_against: 'Currency exposure is unhedged, and the index is dominated by a handful of very large companies.',
  wrong_for: 'Someone drawing down within three years, or anyone already holding a global fund that includes these markets.',
  source_url: 'https://example.com/fund',
};

describe('gapCandidateSchema', () => {
  it('accepts a candidate that argues against itself', () => {
    expect(gapCandidateSchema.safeParse(validCandidate).success).toBe(true);
  });

  for (const field of ['case_for', 'case_against', 'wrong_for'] as const) {
    it(`rejects a candidate whose ${field} is missing`, () => {
      const bad: Record<string, unknown> = { ...validCandidate };
      delete bad[field];
      expect(gapCandidateSchema.safeParse(bad).success).toBe(false);
    });

    it(`rejects a candidate whose ${field} is under ${GAP_MIN_FIELD_LENGTH} characters`, () => {
      const bad = { ...validCandidate, [field]: 'Diversification.' };
      const result = gapCandidateSchema.safeParse(bad);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(String(GAP_MIN_FIELD_LENGTH));
      }
    });
  }

  it('rejects a candidate with no source URL', () => {
    expect(gapCandidateSchema.safeParse({ ...validCandidate, source_url: 'n/a' }).success).toBe(
      false,
    );
  });

  it('counts length after trimming, so padding does not satisfy the bar', () => {
    const padded = { ...validCandidate, wrong_for: `${' '.repeat(80)}Nobody.${' '.repeat(80)}` };
    expect(gapCandidateSchema.safeParse(padded).success).toBe(false);
  });
});
