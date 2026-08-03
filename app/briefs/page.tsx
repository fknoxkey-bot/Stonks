import Link from 'next/link';
import { listBriefs } from '@/lib/queries';
import { isAnthropicConfigured } from '@/lib/anthropic';
import { gapAnalysisSchema, weeklyBriefSchema } from '@/lib/validators';
import { ANTHROPIC_EFFORT, ANTHROPIC_MODEL } from '@/lib/constants';
import { BriefActions } from '@/components/brief-actions';
import { BriefFailure, GapAnalysisView, WeeklyBriefView } from '@/components/brief-view';
import { NotConfigured, Panel } from '@/components/ui';
import type { BriefRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

function parsePayload(row: BriefRow) {
  try {
    const raw = JSON.parse(row.payload_json);
    return row.kind === 'weekly'
      ? weeklyBriefSchema.safeParse(raw)
      : gapAnalysisSchema.safeParse(raw);
  } catch {
    return { success: false as const, error: null };
  }
}

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const configured = isAnthropicConfigured();
  const all = listBriefs();

  const selected =
    (id ? all.find((b) => String(b.id) === id) : undefined) ??
    all.find((b) => b.kind === 'weekly') ??
    all[0];

  return (
    <div className="space-y-5">
      <Panel
        title="Research"
        right={
          <span className="label">
            {ANTHROPIC_MODEL} · effort {ANTHROPIC_EFFORT}
          </span>
        }
      >
        <div className="space-y-3">
          <BriefActions configured={configured} />
          {!configured && (
            <NotConfigured what="Brief generation" envVar="ANTHROPIC_API_KEY">
              <p className="prose-chart mt-2 max-w-prose">
                Briefs already in the archive still render — the archive is a record, not a live
                feature.
              </p>
            </NotConfigured>
          )}
        </div>
      </Panel>

      {selected ? (
        <Panel
          title={`${selected.kind === 'weekly' ? 'Weekly brief' : 'Gap analysis'} · ${selected.generated_at.slice(0, 10)}`}
          right={
            <span className="label">
              {selected.model}
              {selected.status === 'schema_error' && ' · FAILED VALIDATION'}
            </span>
          }
        >
          <BriefBody row={selected} />
        </Panel>
      ) : (
        <Panel title="Nothing generated yet">
          <p className="prose-chart max-w-prose">
            Nothing has been generated. Every brief that ever runs is kept here permanently,
            including the ones that fail — so that in six months you can count how often this thing
            was right and how often it was full of it.
          </p>
        </Panel>
      )}

      <Panel
        title="Everything ever generated"
        hint="Kept forever, including the ones that got it wrong — so you can judge whether it is worth listening to."
      >
        {all.length === 0 ? (
          <p className="label py-4 text-center">Empty.</p>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th>Model</th>
                <th className="text-right">Sources</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {all.map((b) => {
                let sources: string[] = [];
                try {
                  sources = JSON.parse(b.sources_json);
                } catch {
                  sources = [];
                }
                return (
                  <tr key={b.id}>
                    <td className="num text-xs">{b.generated_at.slice(0, 16).replace('T', ' ')}</td>
                    <td className="label-strong">{b.kind}</td>
                    <td>
                      {b.status === 'ok' ? (
                        <span className="label-strong" style={{ color: '#00C805' }}>
                          looks good
                        </span>
                      ) : (
                        <span className="label-strong" style={{ color: '#FF5A47' }}>
                          failed checks
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-2xs">{b.model}</td>
                    <td className="num text-right">{sources.length}</td>
                    <td className="text-right">
                      <Link href={`/briefs?id=${b.id}`} className="label no-underline hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function BriefBody({ row }: { row: BriefRow }) {
  if (row.status === 'schema_error') {
    return <BriefFailure error={row.error} rawText={row.raw_text} />;
  }

  const parsed = parsePayload(row);
  if (!parsed.success) {
    return (
      <BriefFailure
        error="Stored payload no longer matches the current schema."
        rawText={row.payload_json}
      />
    );
  }

  return row.kind === 'weekly' ? (
    <WeeklyBriefView brief={parsed.data as never} />
  ) : (
    <GapAnalysisView analysis={parsed.data as never} />
  );
}
