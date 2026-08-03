'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Tier } from '@/lib/types';
import { TIER_LABEL, TIERS } from '@/lib/types';
import { Delta, Empty, TierMark } from './ui';

export interface PositionRow {
  id: number;
  ticker: string;
  name: string;
  tier: Tier;
  shares: number;
  cost_basis: number;
  thesis: string;
  invalidation: string;
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  price: number | null;
  price_as_of: string | null;
  price_source: string | null;
  weight: number;
  drawdown: number | null;
  ageDays: number | null;
  stale: boolean;
  unrealized: number | null;
  realized: number | null;
  value: number;
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(1)}%`;

interface Draft {
  ticker: string;
  name: string;
  tier: Tier;
  shares: string;
  cost_basis: string;
  thesis: string;
  invalidation: string;
}

const blankDraft: Draft = {
  ticker: '',
  name: '',
  tier: 'med',
  shares: '',
  cost_basis: '',
  thesis: '',
  invalidation: '',
};

export function PositionsTable({ rows, staleDays }: { rows: PositionRow[]; staleDays: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closePrice, setClosePrice] = useState('');

  const open = rows.filter((r) => !r.closed_at);
  const closed = rows.filter((r) => r.closed_at);

  async function send(url: string, method: string, body?: unknown) {
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

  function beginEdit(r: PositionRow) {
    setAdding(false);
    setClosingId(null);
    setEditingId(r.id);
    setDraft({
      ticker: r.ticker,
      name: r.name,
      tier: r.tier,
      shares: String(r.shares),
      cost_basis: String(r.cost_basis),
      thesis: r.thesis,
      invalidation: r.invalidation,
    });
  }

  async function saveEdit() {
    if (editingId === null) return;
    const okDone = await send(`/api/positions/${editingId}`, 'PATCH', draft);
    if (okDone) setEditingId(null);
  }

  async function saveNew() {
    const okDone = await send('/api/positions', 'POST', draft);
    if (okDone) {
      setAdding(false);
      setDraft(blankDraft);
    }
  }

  async function doClose(id: number) {
    const okDone = await send(`/api/positions/${id}/close`, 'POST', { close_price: closePrice });
    if (okDone) {
      setClosingId(null);
      setClosePrice('');
    }
  }

  async function refreshPrices() {
    setError(null);
    const res = await fetch('/api/prices', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (data?.configured === false) setError(data.message);
    else if (data?.failed > 0) {
      const failures = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setError(
        `${data.updated} updated, ${data.cached} already fresh, ${data.failed} failed — ` +
          failures.map((f: { ticker: string; message: string }) => `${f.ticker}: ${f.message}`).join(' · '),
      );
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={pending}
          onClick={() => {
            setEditingId(null);
            setDraft(blankDraft);
            setAdding((a) => !a);
          }}
        >
          {adding ? 'Cancel' : 'Add position'}
        </button>
        <button className="btn-quiet" disabled={pending} onClick={refreshPrices}>
          Refresh prices
        </button>
        {pending && <span className="label">Working…</span>}
      </div>

      {error && (
        <div
          className="panel px-3 py-2 font-mono text-xs"
          style={{ borderColor: '#A72F6E', color: '#A72F6E' }}
        >
          {error}
        </div>
      )}

      {adding && (
        <DraftForm
          draft={draft}
          setDraft={setDraft}
          onSave={saveNew}
          onCancel={() => setAdding(false)}
          pending={pending}
          heading="New position"
        />
      )}

      <table className="grid-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Tier</th>
            <th className="text-right">Shares</th>
            <th className="text-right">Basis</th>
            <th className="text-right">Price</th>
            <th className="text-right">Value</th>
            <th className="text-right">Weight</th>
            <th className="text-right">Unreal.</th>
            <th className="text-right">vs Cost</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {open.length === 0 && (
            <tr>
              <td colSpan={10}>
                <Empty>No open positions.</Empty>
              </td>
            </tr>
          )}
          {open.map((r) => (
            <PositionRowView
              key={r.id}
              r={r}
              staleDays={staleDays}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              onEdit={() => beginEdit(r)}
              onCloseStart={() => {
                setClosingId(r.id);
                setClosePrice(r.price !== null ? String(r.price) : '');
              }}
              pending={pending}
            />
          ))}
        </tbody>
      </table>

      {editingId !== null && (
        <DraftForm
          draft={draft}
          setDraft={setDraft}
          onSave={saveEdit}
          onCancel={() => setEditingId(null)}
          pending={pending}
          heading={`Edit ${draft.ticker}`}
        />
      )}

      {closingId !== null && (
        <div className="panel px-3 py-3">
          <div className="label-strong mb-2">Close position</div>
          <p className="prose-chart mb-3 max-w-prose">
            Closing records the realized result and keeps the position visible in the table. It does
            not place an order — this app has no brokerage connection.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Proceeds per share">
              <input
                className="num w-36"
                value={closePrice}
                inputMode="decimal"
                onChange={(e) => setClosePrice(e.target.value)}
              />
            </Field>
            <button className="btn" disabled={pending} onClick={() => doClose(closingId)}>
              Close
            </button>
            <button className="btn-quiet" onClick={() => setClosingId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <section>
        <div className="label-strong mb-2">Closed positions</div>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Tier</th>
              <th className="text-right">Shares</th>
              <th className="text-right">Basis</th>
              <th className="text-right">Exit</th>
              <th className="text-right">Realized P/L</th>
              <th>Closed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {closed.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Empty>Nothing closed yet.</Empty>
                </td>
              </tr>
            )}
            {closed.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">{r.ticker}</td>
                <td>
                  <TierMark tier={r.tier} showLabel={false} />
                </td>
                <td className="num text-right">{r.shares}</td>
                <td className="num text-right">{money(r.cost_basis)}</td>
                <td className="num text-right">
                  {r.close_price === null ? '—' : money(r.close_price)}
                </td>
                <td className="text-right">
                  <Delta value={r.realized} format={money} />
                </td>
                <td className="num text-2xs">{r.closed_at?.slice(0, 10)}</td>
                <td className="text-right">
                  <button
                    className="btn-quiet"
                    disabled={pending}
                    onClick={() => send(`/api/positions/${r.id}/close`, 'DELETE')}
                  >
                    Reopen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PositionRowView({
  r,
  staleDays,
  expanded,
  onToggle,
  onEdit,
  onCloseStart,
  pending,
}: {
  r: PositionRow;
  staleDays: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCloseStart: () => void;
  pending: boolean;
}) {
  return (
    <>
      <tr>
        <td>
          <button className="font-mono underline-offset-2 hover:underline" onClick={onToggle}>
            {r.ticker}
          </button>
          {r.name && <div className="label mt-0.5">{r.name}</div>}
        </td>
        <td>
          <TierMark tier={r.tier} showLabel={false} />
        </td>
        <td className="num text-right">{r.shares}</td>
        <td className="num text-right">{money(r.cost_basis)}</td>
        <td className="text-right">
          {r.price === null ? (
            <span className="label">never priced</span>
          ) : (
            <>
              <span className="num">{money(r.price)}</span>
              {r.stale && (
                <div className="label" style={{ color: '#B87A22' }}>
                  {r.ageDays === null ? 'no date' : `${Math.floor(r.ageDays)}d old`} · &gt;{staleDays}d
                </div>
              )}
            </>
          )}
        </td>
        <td className="num text-right">
          {money(r.value)}
          {r.price === null && <div className="label">at cost</div>}
        </td>
        <td className="num text-right">{pct(r.weight)}</td>
        <td className="text-right">
          <Delta value={r.unrealized} format={money} />
        </td>
        <td className="text-right">
          <Delta value={r.drawdown} format={(n) => `${n.toFixed(1)}%`} />
        </td>
        <td className="whitespace-nowrap text-right">
          <button className="btn-quiet mr-1" disabled={pending} onClick={onEdit}>
            Edit
          </button>
          <button className="btn-quiet" disabled={pending} onClick={onCloseStart}>
            Close
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className="bg-chart-ink/[0.03]">
            <div className="grid gap-4 py-1 md:grid-cols-2">
              <div>
                <div className="label mb-1">Thesis</div>
                <p className="prose-chart">{r.thesis}</p>
              </div>
              <div>
                <div className="label mb-1">Invalidation — what would prove me wrong</div>
                <p className="prose-chart">{r.invalidation}</p>
              </div>
            </div>
            <div className="label pb-1">
              Opened {r.opened_at.slice(0, 10)}
              {r.price_as_of && ` · price ${r.price_as_of.slice(0, 10)} via ${r.price_source}`}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="label mb-1">{label}</div>
      {children}
    </label>
  );
}

function DraftForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
  heading,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  heading: string;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const missingInvalidation = !draft.invalidation.trim();

  return (
    <div className="panel px-3 py-3">
      <div className="label-strong mb-3">{heading}</div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Ticker">
          <input
            className="w-full font-mono uppercase"
            value={draft.ticker}
            onChange={(e) => set('ticker', e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Name">
          <input
            className="w-full"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Tier">
          <select
            className="w-full font-mono text-xs"
            value={draft.tier}
            onChange={(e) => set('tier', e.target.value as Tier)}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Shares">
            <input
              className="num w-full"
              inputMode="decimal"
              value={draft.shares}
              onChange={(e) => set('shares', e.target.value)}
            />
          </Field>
          <Field label="Cost basis">
            <input
              className="num w-full"
              inputMode="decimal"
              value={draft.cost_basis}
              onChange={(e) => set('cost_basis', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Thesis — why do you own this?">
          <textarea
            className="h-24 w-full"
            value={draft.thesis}
            onChange={(e) => set('thesis', e.target.value)}
          />
        </Field>
        <Field label="Invalidation — what would prove you wrong? (required)">
          <textarea
            className="h-24 w-full"
            style={missingInvalidation ? { borderColor: '#A72F6E' } : undefined}
            value={draft.invalidation}
            onChange={(e) => set('invalidation', e.target.value)}
          />
        </Field>
      </div>

      <p className="prose-chart mt-2 max-w-prose text-chart-ink/70">
        A position without a written invalidation cannot be exited on evidence, only on emotion.
        This field is required, and the database will refuse the row without it.
      </p>

      <div className="mt-3 flex gap-2">
        <button className="btn" disabled={pending} onClick={onSave}>
          Save
        </button>
        <button className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
