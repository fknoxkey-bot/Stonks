import type { WeeklyBrief, GapAnalysis } from '@/lib/validators';
import { Label } from './ui';

const STATUS_HEX = {
  condition_met: '#FF5A47',
  partial_evidence: '#FFB020',
  no_evidence: '#00C805',
} as const;

const STATUS_LABEL = {
  condition_met: 'CONDITION MET',
  partial_evidence: 'PARTIAL EVIDENCE',
  no_evidence: 'NO EVIDENCE',
} as const;

function Source({ url, title }: { url: string; title?: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* leave the raw string */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono text-2xs tracking-label"
    >
      {title ? `${title} · ${host}` : host}
    </a>
  );
}

export function WeeklyBriefView({ brief }: { brief: WeeklyBrief }) {
  return (
    <div className="space-y-6">
      <p className="prose-chart max-w-prose text-base">{brief.summary}</p>

      {/* The highest-value section, so it goes first. */}
      <section>
        <Label>Invalidation checks — has anything matched what I wrote?</Label>
        <div className="mt-2 space-y-3">
          {brief.invalidation_checks.length === 0 && (
            <p className="label py-2">No positions to check.</p>
          )}
          {brief.invalidation_checks.map((c, i) => (
            <article key={`${c.ticker}-${i}`} className="card px-3 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm">{c.ticker}</span>
                <span
                  className="border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-label"
                  style={{ color: STATUS_HEX[c.status], borderColor: STATUS_HEX[c.status] }}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="prose-chart mt-2 max-w-prose italic text-ink/70">
                “{c.invalidation_condition}”
              </p>
              <p className="prose-chart mt-2 max-w-prose">{c.reasoning}</p>
              {c.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.evidence.map((e, j) => (
                    <li key={j} className="prose-chart">
                      {e.claim} <Source url={e.source_url} title={e.source_title} />
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section>
        <Label>Macro developments, past 7 days</Label>
        <table className="grid-table mt-2">
          <thead>
            <tr>
              <th>Development</th>
              <th>Data point to watch next</th>
              <th>When</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {brief.macro_developments.map((m, i) => (
              <tr key={i}>
                <td className="prose-chart max-w-md">{m.claim}</td>
                <td className="prose-chart">{m.data_point_to_watch}</td>
                <td className="num text-2xs">{m.next_release_or_date}</td>
                <td>
                  <Source url={m.source_url} title={m.source_title} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <Label>Already consensus — these offer no edge</Label>
        <ul className="mt-2 space-y-2">
          {brief.already_consensus.length === 0 && (
            <li className="label">Nothing flagged as consensus. Treat that claim with suspicion.</li>
          )}
          {brief.already_consensus.map((c, i) => (
            <li key={i} className="border-b border-line/60 pb-2">
              <p className="prose-chart max-w-prose">{c.point}</p>
              <p className="prose-chart max-w-prose text-ink/65">{c.why_consensus}</p>
              <Source url={c.source_url} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Label>Three questions for me to answer</Label>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          {brief.questions_for_me.map((q, i) => (
            <li key={i} className="prose-chart max-w-prose font-semibold">
              {q}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function GapAnalysisView({ analysis }: { analysis: GapAnalysis }) {
  return (
    <div className="space-y-6">
      <p className="prose-chart max-w-prose text-base">{analysis.summary}</p>
      <p className="label max-w-prose">
        Order is arbitrary. Nothing here is ranked, and nothing here is a recommendation — every
        candidate has to argue against itself before it appears.
      </p>

      {analysis.gaps.map((gap, i) => (
        <section key={i} className="card px-3 py-3">
          <div className="label-strong">{gap.dimension.replace('_', ' ')}</div>
          <p className="prose-chart mt-1 max-w-prose">{gap.observation}</p>
          <p className="prose-chart max-w-prose text-ink/65">
            Current exposure: {gap.current_exposure}
          </p>

          <div className="mt-3 space-y-3">
            {gap.candidates.map((c, j) => (
              <div key={j} className="border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm">{c.ticker}</span>
                  <span className="font-sans text-sm">{c.instrument}</span>
                  <span className="label">
                    {c.vehicle_type} · {c.expense_ratio}
                  </span>
                  <span className="ml-auto">
                    <Source url={c.source_url} />
                  </span>
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="label mb-1" style={{ color: '#00C805' }}>
                      Case for
                    </div>
                    <p className="prose-chart">{c.case_for}</p>
                  </div>
                  <div>
                    <div className="label mb-1" style={{ color: '#FFB020' }}>
                      Case against
                    </div>
                    <p className="prose-chart">{c.case_against}</p>
                  </div>
                  <div>
                    <div className="label mb-1" style={{ color: '#FF5A47' }}>
                      Wrong for
                    </div>
                    <p className="prose-chart">{c.wrong_for}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** What a failed generation looks like. Shown, not hidden. */
export function BriefFailure({ error, rawText }: { error: string | null; rawText: string | null }) {
  return (
    <div className="space-y-3">
      <div className="card px-3 py-2" style={{ borderColor: '#FF5A47' }}>
        <div className="label-strong" style={{ color: '#FF5A47' }}>
          Schema validation failed
        </div>
        <p className="prose-chart mt-1 max-w-prose">
          The model was asked twice and returned something that did not match the schema both
          times. Nothing was rendered from it, because a claim that fails validation is a claim
          without a usable source. The raw text is below so you can see what it actually said.
        </p>
      </div>
      <div>
        <Label>Validation errors</Label>
        <pre className="mt-1 whitespace-pre-wrap break-words border border-line px-2 py-2 font-mono text-xs">
          {error ?? '(none recorded)'}
        </pre>
      </div>
      <div>
        <Label>Raw model output</Label>
        <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words border border-line px-2 py-2 font-mono text-xs">
          {rawText ?? '(empty)'}
        </pre>
      </div>
    </div>
  );
}
