import Link from 'next/link';
import { buildPortfolioState, listFlags, syncFlags } from '@/lib/queries';
import { evaluateAll } from '@/lib/rules';
import { RULES } from '@/lib/constants';
import { tierValues, tierWeights, totalValue } from '@/lib/portfolio';
import { FlagsPanel, type FlagView } from '@/components/flags-panel';
import { TargetsPanel } from '@/components/targets-panel';
import { Panel } from '@/components/ui';
import type { FlagDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

function toView(f: ReturnType<typeof listFlags>[number]): FlagView {
  let detail: Partial<FlagDetail> = {};
  try {
    detail = JSON.parse(f.detail_json) as Partial<FlagDetail>;
  } catch {
    detail = {};
  }
  return {
    id: f.id,
    raised_at: f.raised_at,
    rule: f.rule,
    severity: f.severity,
    title: f.title,
    body: f.body,
    arithmetic: detail.arithmetic ?? '—',
    why: detail.why ?? '—',
    question: detail.question ?? '—',
    resolved_at: f.resolved_at,
    resolution_note: f.resolution_note,
  };
}

export default function ReviewPage() {
  const state = buildPortfolioState();

  // Evaluate on load so the page always reflects current numbers rather than
  // whatever the engine last happened to be told to do.
  syncFlags(evaluateAll(state), state.now);

  const open = listFlags({ open: true }).map(toView);
  const recentlyResolved = listFlags({ open: false }).slice(0, 8).map(toView);

  const total = totalValue(state);

  return (
    <div className="space-y-5">
      <Panel
        title="Your plan"
        hint="The mix you want, how much cash you have, and money you know you need soon."
      >
        <TargetsPanel
          view={{
            targets: state.targets,
            actual: tierWeights(state),
            values: tierValues(state),
            cash: state.cash,
            total,
            nearTerm: state.nearTerm,
            driftThreshold: RULES.allocationDrift.points,
          }}
        />
      </Panel>

      <Panel
        title="Things to look at"
        hint="Each one shows the numbers behind it, why it matters, and a question for you."
      >
        <FlagsPanel flags={open} />
      </Panel>

      <Panel
        title="Recently handled"
        right={
          <Link href="/history" className="label no-underline hover:underline">
            See everything →
          </Link>
        }
      >
        {recentlyResolved.length === 0 ? (
          <p className="label py-4 text-center">Nothing handled yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentlyResolved.map((f) => (
              <li key={f.id} className="border-b border-line/60 pb-2 last:border-0">
                <div className="flex items-baseline gap-2">
                  <span className="label whitespace-nowrap">
                    {f.resolved_at?.slice(0, 10)} · {f.rule}
                  </span>
                  <span className="font-sans text-sm">{f.title}</span>
                </div>
                <p className="prose-chart mt-0.5 max-w-prose text-ink/75">
                  {f.resolution_note}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
