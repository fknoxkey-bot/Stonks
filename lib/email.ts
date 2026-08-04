/**
 * Weekly brief delivery via Resend.
 *
 * Plain HTML, readable on a phone: one column, system fonts, inline styles,
 * no media queries, no images. The brief is already stored and readable in
 * the app; this email exists so the invalidation checks reach you on a
 * Sunday evening without you having to remember to look.
 */
import { Resend } from 'resend';
import type { WeeklyBrief } from './validators';
import { env, hasEnv, requireEnv } from './env';

export function isEmailConfigured(): boolean {
  return hasEnv('RESEND_API_KEY') && hasEnv('BRIEF_FROM_EMAIL') && hasEnv('BRIEF_TO_EMAIL');
}

const INK = '#12313C';
const RULE = '#C3CFC9';
const PAPER = '#E9EDE9';

const STATUS_COLOUR = {
  condition_met: '#A72F6E',
  partial_evidence: '#B87A22',
  no_evidence: '#2E7159',
} as const;

const STATUS_TEXT = {
  condition_met: 'CONDITION MET',
  partial_evidence: 'PARTIAL EVIDENCE',
  no_evidence: 'NO EVIDENCE',
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const label = (text: string) =>
  `<div style="font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:${INK};opacity:.6;margin:28px 0 8px">${escapeHtml(text)}</div>`;

const link = (url: string, text?: string) => {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* leave the raw string */
  }
  return `<a href="${escapeHtml(url)}" style="color:${INK};font:11px ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(text ? `${text} · ${host}` : host)}</a>`;
};

export function renderBriefEmail(brief: WeeklyBrief, generatedAt: string, appUrl: string): string {
  const moves =
    brief.price_moves.length === 0
      ? ''
      : label('What moved, and why') +
        brief.price_moves
          .map(
            (m) => `
    <div style="border:1px solid ${RULE};padding:12px;margin-bottom:10px">
      <span style="font-weight:600;font-size:14px">${escapeHtml(m.ticker)}</span>
      <span style="font-weight:600;font-size:14px;color:${m.pct_change >= 0 ? '#0A8F04' : '#C4321F'};margin-left:8px">${m.pct_change >= 0 ? '&#9650;' : '&#9660;'} ${Math.abs(m.pct_change).toFixed(1)}%</span>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5">${escapeHtml(m.explanation)}</p>
      <p style="margin:6px 0 0">${link(m.source_url)}</p>
    </div>`,
          )
          .join('');

  const ideas =
    brief.ideas.length === 0
      ? ''
      : label('Worth researching — not ranked, not advice') +
        brief.ideas
          .map(
            (i) => `
    <div style="border:1px solid ${RULE};padding:12px;margin-bottom:10px">
      <span style="font-weight:600;font-size:14px">${escapeHtml(i.ticker)}</span>
      <span style="font-size:14px;opacity:.7;margin-left:8px">${escapeHtml(i.instrument)}</span>
      <p style="margin:6px 0 0;font-size:13px;opacity:.75">Why now: ${escapeHtml(i.why_now)}</p>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5"><strong>For:</strong> ${escapeHtml(i.case_for)}</p>
      <p style="margin:6px 0 0;font-size:14px;line-height:1.5"><strong>Against:</strong> ${escapeHtml(i.case_against)}</p>
      <p style="margin:6px 0 0;font-size:14px;line-height:1.5"><strong>Wrong for:</strong> ${escapeHtml(i.wrong_for)}</p>
      <p style="margin:6px 0 0">${link(i.source_url)}</p>
    </div>`,
          )
          .join('');

  const checks = brief.invalidation_checks
    .map(
      (c) => `
    <div style="border:1px solid ${RULE};padding:12px;margin-bottom:10px">
      <div>
        <span style="font:600 14px ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(c.ticker)}</span>
        <span style="font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;border:1px solid ${STATUS_COLOUR[c.status]};color:${STATUS_COLOUR[c.status]};padding:2px 5px;margin-left:8px">${STATUS_TEXT[c.status]}</span>
      </div>
      <p style="margin:8px 0 0;font-style:italic;opacity:.7;font-size:14px;line-height:1.5">“${escapeHtml(c.invalidation_condition)}”</p>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5">${escapeHtml(c.reasoning)}</p>
      ${c.evidence
        .map(
          (e) =>
            `<p style="margin:6px 0 0;font-size:14px;line-height:1.5">${escapeHtml(e.claim)} ${link(e.source_url, e.source_title)}</p>`,
        )
        .join('')}
    </div>`,
    )
    .join('');

  const macro = brief.macro_developments
    .map(
      (m) => `
    <div style="border-bottom:1px solid ${RULE};padding-bottom:10px;margin-bottom:10px">
      <p style="margin:0;font-size:14px;line-height:1.5">${escapeHtml(m.claim)}</p>
      <p style="margin:6px 0 0;font-size:13px;line-height:1.5;opacity:.75">Watch next: ${escapeHtml(m.data_point_to_watch)} — ${escapeHtml(m.next_release_or_date)}</p>
      <p style="margin:6px 0 0">${link(m.source_url, m.source_title)}</p>
    </div>`,
    )
    .join('');

  const consensus = brief.already_consensus
    .map(
      (c) => `
    <li style="margin-bottom:8px;font-size:14px;line-height:1.5">
      ${escapeHtml(c.point)}
      <span style="opacity:.7"> — ${escapeHtml(c.why_consensus)}</span>
      <br>${link(c.source_url)}
    </li>`,
    )
    .join('');

  const questions = brief.questions_for_me
    .map((q) => `<li style="margin-bottom:10px;font-size:15px;line-height:1.5;font-weight:600">${escapeHtml(q)}</li>`)
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK}">
  <div style="max-width:640px;margin:0 auto;padding:20px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

    <div style="border-bottom:1px solid ${INK};padding-bottom:8px">
      <span style="font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase">Weekly review</span>
      <span style="font:11px ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.6;float:right">${escapeHtml(generatedAt.slice(0, 10))}</span>
    </div>

    <p style="margin:16px 0 0;font-size:15px;line-height:1.6">${escapeHtml(brief.summary)}</p>

    ${moves}
    ${label('Has anything happened that would prove you wrong?')}
    ${checks || '<p style="font-size:14px;opacity:.6">No positions to check.</p>'}

    ${label('Three questions to answer')}
    <ol style="margin:0;padding-left:20px">${questions}</ol>

    ${ideas}
    ${label('What happened in the wider market')}
    ${macro || '<p style="font-size:14px;opacity:.6">Nothing recorded.</p>'}

    ${label('Already consensus — no edge here')}
    <ul style="margin:0;padding-left:20px">${consensus || '<li style="font-size:14px;opacity:.6">Nothing flagged as consensus. Treat that claim with suspicion.</li>'}</ul>

    <div style="border-top:1px solid ${RULE};margin-top:28px;padding-top:12px">
      <p style="margin:0;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;opacity:.6;line-height:1.6">
        Generated by an AI model and stored permanently in the archive, including when it is wrong.<br>
        Nothing here is a recommendation. This app has no brokerage connection.
      </p>
      <p style="margin:10px 0 0"><a href="${escapeHtml(appUrl)}/briefs" style="color:${INK};font:11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em">OPEN THE ARCHIVE →</a></p>
    </div>
  </div>
</body></html>`;
}

/** Plain-text alternative, for clients that prefer it. */
export function renderBriefText(brief: WeeklyBrief, generatedAt: string): string {
  const lines = [`WEEKLY REVIEW — ${generatedAt.slice(0, 10)}`, '', brief.summary, ''];

  if (brief.price_moves.length > 0) {
    lines.push('WHAT MOVED');
    for (const m of brief.price_moves) {
      lines.push(`  ${m.ticker} ${m.pct_change >= 0 ? '+' : ''}${m.pct_change.toFixed(1)}%`);
      lines.push(`    ${m.explanation}`);
      lines.push(`    ${m.source_url}`);
    }
    lines.push('');
  }

  lines.push('INVALIDATION CHECKS');
  for (const c of brief.invalidation_checks) {
    lines.push(`  ${c.ticker} [${STATUS_TEXT[c.status]}]`);
    lines.push(`    condition: ${c.invalidation_condition}`);
    lines.push(`    ${c.reasoning}`);
    for (const e of c.evidence) lines.push(`    - ${e.claim} (${e.source_url})`);
  }

  lines.push('', 'THREE QUESTIONS');
  brief.questions_for_me.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));

  if (brief.ideas.length > 0) {
    lines.push('', 'WORTH RESEARCHING (not ranked, not advice)');
    for (const i of brief.ideas) {
      lines.push(`  ${i.ticker} — ${i.instrument}`);
      lines.push(`    why now: ${i.why_now}`);
      lines.push(`    for: ${i.case_for}`);
      lines.push(`    against: ${i.case_against}`);
      lines.push(`    wrong for: ${i.wrong_for}`);
      lines.push(`    ${i.source_url}`);
    }
  }

  lines.push('', 'MACRO');
  for (const m of brief.macro_developments) {
    lines.push(`  - ${m.claim}`);
    lines.push(`    watch: ${m.data_point_to_watch} (${m.next_release_or_date})`);
    lines.push(`    ${m.source_url}`);
  }

  lines.push('', 'ALREADY CONSENSUS');
  for (const c of brief.already_consensus) lines.push(`  - ${c.point} — ${c.why_consensus}`);

  lines.push('', 'Nothing here is a recommendation. This app has no brokerage connection.');
  return lines.join('\n');
}

export interface EmailOutcome {
  configured: boolean;
  sent: boolean;
  error: string | null;
}

export async function sendBriefEmail(
  brief: WeeklyBrief,
  generatedAt: string,
): Promise<EmailOutcome> {
  if (!isEmailConfigured()) {
    return {
      configured: false,
      sent: false,
      error: 'RESEND_API_KEY, BRIEF_FROM_EMAIL and BRIEF_TO_EMAIL must all be set.',
    };
  }

  const appUrl = env('APP_URL', 'http://localhost:3000');

  try {
    const resend = new Resend(requireEnv('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: requireEnv('BRIEF_FROM_EMAIL'),
      to: requireEnv('BRIEF_TO_EMAIL'),
      subject: `Weekly review — ${generatedAt.slice(0, 10)}`,
      html: renderBriefEmail(brief, generatedAt, appUrl),
      text: renderBriefText(brief, generatedAt),
    });
    if (error) return { configured: true, sent: false, error: error.message };
    return { configured: true, sent: true, error: null };
  } catch (err) {
    return {
      configured: true,
      sent: false,
      error: err instanceof Error ? err.message : 'Send failed.',
    };
  }
}
