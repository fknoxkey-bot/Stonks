import { describe, expect, it } from 'vitest';
import { renderBriefEmail, renderBriefText } from '../lib/email';
import type { WeeklyBrief } from '../lib/validators';

const brief: WeeklyBrief = {
  summary: 'Two conditions moved; neither was met.',
  macro_developments: [
    {
      claim: 'Core PCE decelerated to 2.6%.',
      data_point_to_watch: 'Services ex-housing.',
      next_release_or_date: '2026-04-30',
      source_url: 'https://www.federalreserve.gov/releases/x',
      source_title: 'Federal Reserve',
    },
  ],
  invalidation_checks: [
    {
      ticker: 'ASML',
      invalidation_condition: 'A competitor ships a production EUV tool.',
      status: 'no_evidence',
      reasoning: 'Nothing found.',
      evidence: [
        { claim: 'Backlog reiterated.', source_url: 'https://www.asml.com/ir', source_title: 'ASML' },
      ],
    },
    {
      ticker: 'BND',
      invalidation_condition: 'Real yields negative for four quarters.',
      status: 'partial_evidence',
      reasoning: 'Falling but positive.',
      evidence: [],
    },
  ],
  already_consensus: [
    {
      point: 'Disinflation continues.',
      why_consensus: 'Modal view everywhere.',
      source_url: 'https://example.com/c',
    },
  ],
  questions_for_me: ['First?', 'Second?', 'Third?'],
  price_moves: [
    {
      ticker: 'ASML',
      pct_change: -8.4,
      explanation: 'Fell with the semi-equipment complex after a peer cut guidance.',
      source_url: 'https://example.com/move',
    },
  ],
  ideas: [
    {
      instrument: 'Example Short Treasury ETF',
      ticker: 'EXST',
      why_now: 'Your roof money is due in four months and sits in equities.',
      case_for: 'Very short duration means the price barely moves, so money you need on a date stays roughly intact.',
      case_against: 'Yields little after inflation, and locks up cash that could compound elsewhere for years.',
      wrong_for: 'Anyone with no near-term spending commitment, who would simply be giving up long-run returns.',
      source_url: 'https://example.com/fund',
    },
  ],
};

describe('renderBriefEmail', () => {
  const html = renderBriefEmail(brief, '2026-04-05T18:00:00.000Z', 'https://stonks.local');

  it('leads with the invalidation checks, before macro', () => {
    expect(html).toContain('prove you wrong');
    expect(html).toContain('What happened in the wider market');
    expect(html.indexOf('prove you wrong')).toBeLessThan(
      html.indexOf('What happened in the wider market'),
    );
  });

  it('renders every check with its status and quoted condition', () => {
    expect(html).toContain('ASML');
    expect(html).toContain('NO EVIDENCE');
    expect(html).toContain('BND');
    expect(html).toContain('PARTIAL EVIDENCE');
    expect(html).toContain('A competitor ships a production EUV tool.');
  });

  it('renders all three questions', () => {
    for (const q of brief.questions_for_me) expect(html).toContain(q);
  });

  it('links every source by hostname', () => {
    expect(html).toContain('href="https://www.federalreserve.gov/releases/x"');
    expect(html).toContain('federalreserve.gov');
    expect(html).toContain('href="https://www.asml.com/ir"');
  });

  it('renders price moves with direction and a source', () => {
    expect(html).toContain('ASML');
    expect(html).toContain('8.4%');
    expect(html).toContain('&#9660;'); // down arrow
    expect(html).toContain('https://example.com/move');
  });

  it('renders ideas with all three sides, and says they are not ranked', () => {
    expect(html).toContain('EXST');
    expect(html).toContain('not ranked');
    expect(html).toContain('For:');
    expect(html).toContain('Against:');
    expect(html).toContain('Wrong for:');
  });

  it('puts what-moved and the invalidation checks ahead of any idea', () => {
    expect(html.indexOf('What moved')).toBeLessThan(html.indexOf('Worth researching'));
    expect(html.indexOf('prove you wrong')).toBeLessThan(html.indexOf('Worth researching'));
  });

  it('carries the no-recommendation and no-brokerage footer', () => {
    expect(html).toContain('Nothing here is a recommendation');
    expect(html).toContain('no brokerage connection');
  });

  it('links back to the archive', () => {
    expect(html).toContain('https://stonks.local/briefs');
  });

  it('is a single column with inline styles and no images', () => {
    expect(html).toContain('max-width:640px');
    expect(html).toContain('name="viewport"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('@media');
  });

  it('escapes model output so a stray tag cannot break the layout', () => {
    const hostile: WeeklyBrief = {
      ...brief,
      summary: '<script>alert("x")</script> & "quoted" <b>bold</b>',
    };
    const out = renderBriefEmail(hostile, '2026-04-05T18:00:00.000Z', 'https://stonks.local');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;quoted&quot;');
  });

  it('degrades to a legible line when a section is empty', () => {
    const empty: WeeklyBrief = {
      ...brief,
      macro_developments: [],
      invalidation_checks: [],
      already_consensus: [],
      price_moves: [],
      ideas: [],
    };
    const out = renderBriefEmail(empty, '2026-04-05T18:00:00.000Z', 'https://stonks.local');
    expect(out).toContain('No positions to check.');
    expect(out).toContain('Treat that claim with suspicion.');
  });
});

describe('renderBriefText', () => {
  const text = renderBriefText(brief, '2026-04-05T18:00:00.000Z');

  it('carries every section', () => {
    expect(text).toContain('WHAT MOVED');
    expect(text).toContain('INVALIDATION CHECKS');
    expect(text).toContain('THREE QUESTIONS');
    expect(text).toContain('WORTH RESEARCHING');
    expect(text).toContain('MACRO');
    expect(text).toContain('ALREADY CONSENSUS');
  });

  it('signs the move and keeps the checks ahead of any idea', () => {
    expect(text).toContain('ASML -8.4%');
    expect(text.indexOf('INVALIDATION CHECKS')).toBeLessThan(text.indexOf('WORTH RESEARCHING'));
  });

  it('never states an idea without all three sides against it', () => {
    expect(text).toContain('for: Very short duration');
    expect(text).toContain('against: Yields little after inflation');
    expect(text).toContain('wrong for: Anyone with no near-term spending commitment');
    expect(text).toContain('not ranked, not advice');
  });

  it('omits the optional sections entirely when there is nothing to say', () => {
    const bare = renderBriefText({ ...brief, price_moves: [], ideas: [] }, '2026-04-05T18:00:00.000Z');
    expect(bare).not.toContain('WHAT MOVED');
    expect(bare).not.toContain('WORTH RESEARCHING');
    expect(bare).toContain('INVALIDATION CHECKS');
  });

  it('numbers the questions', () => {
    expect(text).toContain('1. First?');
    expect(text).toContain('3. Third?');
  });

  it('includes raw source URLs, since a text client cannot follow a label', () => {
    expect(text).toContain('https://www.asml.com/ir');
    expect(text).toContain('https://www.federalreserve.gov/releases/x');
  });

  it('carries no HTML', () => {
    expect(text).not.toMatch(/<[a-z]/i);
  });
});
