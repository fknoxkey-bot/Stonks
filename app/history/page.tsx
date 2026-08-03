import { listFlags, listSnapshots } from '@/lib/queries';
import { money } from '@/lib/portfolio';
import { AllocationChart, ValueChart, type SeriesPoint } from '@/components/charts';
import { Panel, SeverityMark } from '@/components/ui';
import type { Tier } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  const snapshots = listSnapshots();

  const points: SeriesPoint[] = snapshots.map((s) => {
    let byTier: Record<Tier, number> = { low: 0, med: 0, high: 0 };
    let cash = 0;
    try {
      const parsed = JSON.parse(s.by_tier_json) as Partial<Record<Tier, number>> & {
        cash?: number;
      };
      byTier = {
        low: parsed.low ?? 0,
        med: parsed.med ?? 0,
        high: parsed.high ?? 0,
      };
      cash = parsed.cash ?? 0;
    } catch {
      /* a malformed snapshot renders as zeroes rather than breaking the page */
    }
    return {
      t: new Date(s.taken_at).getTime(),
      value: s.total_value,
      // total_value includes cash; total_basis does not. Adding cash to the
      // reference line makes the gap between the two lines exactly the
      // unrealized gain, rather than the gain plus however much cash is
      // sitting idle.
      basis: s.total_basis + cash,
      byTier,
      cash,
    };
  });

  const all = listFlags();
  const resolved = all.filter((f) => f.resolved_at !== null);
  const open = all.length - resolved.length;

  return (
    <div className="space-y-5">
      <Panel
        title="Portfolio value"
        right={<span className="label">{snapshots.length} snapshots</span>}
      >
        <ValueChart points={points} />
      </Panel>

      <Panel title="Tier allocation over time">
        <AllocationChart points={points} />
      </Panel>

      <Panel
        title="Every flag ever raised"
        right={
          <span className="label">
            {all.length} total · {resolved.length} resolved · {open} open
          </span>
        }
      >
        <p className="prose-chart mb-3 max-w-prose text-chart-ink/70">
          This table is the honest one. It is here so you can see whether you followed through on
          what you wrote, or whether you dismissed things. A resolution note that says nothing is
          itself a finding.
        </p>

        {all.length === 0 ? (
          <p className="label py-6 text-center">No flags have ever been raised.</p>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>Raised</th>
                <th>Rule</th>
                <th>Sev</th>
                <th>What was flagged</th>
                <th>Resolved</th>
                <th>How I resolved it</th>
              </tr>
            </thead>
            <tbody>
              {all.map((f) => (
                <tr key={f.id}>
                  <td className="num whitespace-nowrap text-2xs">{f.raised_at.slice(0, 10)}</td>
                  <td className="font-mono text-2xs">{f.rule}</td>
                  <td>
                    <SeverityMark severity={f.severity} />
                  </td>
                  <td className="prose-chart">{f.title}</td>
                  <td className="num whitespace-nowrap text-2xs">
                    {f.resolved_at ? (
                      f.resolved_at.slice(0, 10)
                    ) : (
                      <span className="label-strong" style={{ color: '#A72F6E' }}>
                        open
                      </span>
                    )}
                  </td>
                  <td className="prose-chart max-w-md">
                    {f.resolution_note ?? <span className="label">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Snapshots">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Taken</th>
              <th className="text-right">Value</th>
              <th className="text-right">Basis</th>
              <th className="text-right">Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {[...snapshots].reverse().slice(0, 30).map((s, i) => {
              // Same adjustment as the chart: strip cash out of the value
              // before comparing it to basis.
              const point = points[points.length - 1 - i];
              const unreal = s.total_value - (point?.cash ?? 0) - s.total_basis;
              return (
                <tr key={s.id}>
                  <td className="num text-2xs">{s.taken_at.slice(0, 16).replace('T', ' ')}</td>
                  <td className="num text-right">{money(s.total_value)}</td>
                  <td className="num text-right">{money(s.total_basis)}</td>
                  <td
                    className="num text-right"
                    style={{ color: unreal >= 0 ? '#2E7159' : '#A72F6E' }}
                  >
                    {unreal >= 0 ? '+' : ''}
                    {money(unreal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
