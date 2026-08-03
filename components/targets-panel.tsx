'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { NearTerm, Tier } from '@/lib/types';
import { TIERS } from '@/lib/types';
import { TIER_NAME, TIER_HELP } from '@/lib/plain';
import { TIER_HEX } from './ui';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export interface TargetsView {
  targets: Record<Tier, number>;
  actual: Record<Tier, number>;
  values: Record<Tier, number>;
  cash: number;
  total: number;
  nearTerm: NearTerm[];
  driftThreshold: number;
}

export function TargetsPanel({ view }: { view: TargetsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<Tier, string>>({
    low: String(view.targets.low),
    med: String(view.targets.med),
    high: String(view.targets.high),
  });
  const [cash, setCash] = useState(String(view.cash));
  const [need, setNeed] = useState({ amount: '', need_by: '', label: '' });
  const [error, setError] = useState<string | null>(null);

  const sum = TIERS.reduce((s, t) => s + (Number(draft[t]) || 0), 0);

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? `Request failed (${res.status}).`);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div
          className="card px-3 py-2 font-mono text-xs"
          style={{ borderColor: '#FF5A47', color: '#FF5A47' }}
        >
          {error}
        </div>
      )}

      <div>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Type</th>
              <th className="text-right">You have</th>
              <th className="text-right">% now</th>
              <th className="text-right">% you want</th>
              <th className="text-right">Off by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => {
              const drift = view.actual[t] - view.targets[t];
              const over = Math.abs(drift) >= view.driftThreshold;
              return (
                <tr key={t}>
                  <td>
                    <span className="inline-flex items-center gap-2" title={TIER_HELP[t]}>
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: TIER_HEX[t] }}
                      />
                      <span className="text-sm font-medium">{TIER_NAME[t]}</span>
                    </span>
                  </td>
                  <td className="num text-right">{money(view.values[t])}</td>
                  <td className="num text-right">{view.actual[t].toFixed(1)}%</td>
                  <td className="text-right">
                    <input
                      className="num w-16 text-right"
                      inputMode="decimal"
                      value={draft[t]}
                      onChange={(e) => setDraft({ ...draft, [t]: e.target.value })}
                    />
                  </td>
                  <td
                    className="num text-right"
                    style={{ color: over ? '#FF5A47' : '#98A1AE' }}
                  >
                    {drift >= 0 ? '+' : ''}
                    {drift.toFixed(1)}
                  </td>
                  <td>
                    <DriftBar actual={view.actual[t]} target={view.targets[t]} tier={t} />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="label">Cash</td>
              <td className="num text-right">{money(view.cash)}</td>
              <td className="num text-right">
                {view.total > 0 ? ((view.cash / view.total) * 100).toFixed(1) : '0.0'}%
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              call('/api/targets', 'PUT', {
                low: draft.low,
                med: draft.med,
                high: draft.high,
              })
            }
          >
            Save
          </button>
          <span className="label" style={sum !== 100 ? { color: '#FFB020' } : undefined}>
            Adds up to {sum.toFixed(1)}%
            {sum !== 100 && ' — whatever is left over is your cash target.'}
          </span>
        </div>
      </div>

      <div className="grid gap-5 border-t border-line pt-4 lg:grid-cols-2">
        <div>
          <div className="label-strong mb-2">Cash not invested</div>
          <div className="flex items-end gap-2">
            <input
              className="num w-40"
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
            <button
              className="btn"
              disabled={pending}
              onClick={() => call('/api/targets', 'PUT', { amount: cash })}
            >
              Save
            </button>
          </div>
          <p className="hint mt-2 max-w-prose">
            Money sitting in the account. It counts toward your totals, and toward what you could
            reach without having to sell anything.
          </p>
        </div>

        <div>
          <div className="label-strong mb-2">Money you need soon</div>
          <table className="grid-table">
            <thead>
              <tr>
                <th>Label</th>
                <th className="text-right">Amount</th>
                <th>Need by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {view.nearTerm.length === 0 && (
                <tr>
                  <td colSpan={4} className="label py-3">
                    Nothing yet. Add anything you know you will need to pay for.
                  </td>
                </tr>
              )}
              {view.nearTerm.map((n) => (
                <tr key={n.id}>
                  <td>{n.label || <span className="label">unlabelled</span>}</td>
                  <td className="num text-right">{money(n.amount)}</td>
                  <td className="num text-2xs">{n.need_by.slice(0, 10)}</td>
                  <td className="text-right">
                    <button
                      className="btn-quiet"
                      disabled={pending}
                      onClick={() => call(`/api/near-term?id=${n.id}`, 'DELETE')}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <div className="label mb-1">Label</div>
              <input
                className="w-36"
                value={need.label}
                onChange={(e) => setNeed({ ...need, label: e.target.value })}
              />
            </label>
            <label className="block">
              <div className="label mb-1">Amount</div>
              <input
                className="num w-28"
                inputMode="decimal"
                value={need.amount}
                onChange={(e) => setNeed({ ...need, amount: e.target.value })}
              />
            </label>
            <label className="block">
              <div className="label mb-1">Need by</div>
              <input
                type="date"
                className="num"
                value={need.need_by}
                onChange={(e) => setNeed({ ...need, need_by: e.target.value })}
              />
            </label>
            <button
              className="btn"
              disabled={pending}
              onClick={async () => {
                if (await call('/api/near-term', 'POST', need))
                  setNeed({ amount: '', need_by: '', label: '' });
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Actual as a filled bar, target as a tick. Hairlines only. */
function DriftBar({ actual, target, tier }: { actual: number; target: number; tier: Tier }) {
  const scale = Math.max(100, actual, target);
  return (
    <div className="relative h-3 w-full min-w-[120px] border border-line">
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${(actual / scale) * 100}%`, backgroundColor: TIER_HEX[tier], opacity: 0.35 }}
      />
      <div
        className="absolute inset-y-0 w-px bg-ink"
        style={{ left: `${(target / scale) * 100}%` }}
        title={`target ${target}%`}
      />
    </div>
  );
}
