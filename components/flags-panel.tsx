'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Severity } from '@/lib/types';
import { Empty, SeverityMark } from './ui';

export interface FlagView {
  id: number;
  raised_at: string;
  rule: string;
  severity: Severity;
  title: string;
  body: string;
  arithmetic: string;
  why: string;
  question: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

/**
 * Active flags. Each renders the arithmetic that triggered it, why the
 * threshold exists, and the question — and cannot be dismissed without a
 * written note, because "I looked at it and decided X" is the artefact worth
 * keeping.
 */
export function FlagsPanel({ flags }: { flags: FlagView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<number | null>(flags[0]?.id ?? null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: number) {
    setError(null);
    const res = await fetch(`/api/flags/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: notes[id] ?? '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Could not resolve.');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function reevaluate() {
    setError(null);
    await fetch('/api/flags', { method: 'POST' });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn" disabled={pending} onClick={reevaluate}>
          Re-run rules
        </button>
        <span className="label">
          {flags.length} open flag{flags.length === 1 ? '' : 's'}
        </span>
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

      {flags.length === 0 && <Empty>Nothing is flagged. Re-run the rules to check again.</Empty>}

      {flags.map((f) => {
        const isOpen = openId === f.id;
        return (
          <article key={f.id} className="panel">
            <button
              className="flex w-full items-baseline gap-3 px-3 py-2 text-left"
              onClick={() => setOpenId(isOpen ? null : f.id)}
            >
              <SeverityMark severity={f.severity} />
              <span className="font-sans text-sm font-semibold">{f.title}</span>
              <span className="label ml-auto whitespace-nowrap">
                {f.rule} · {f.raised_at.slice(0, 10)}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-chart-rule px-3 py-3">
                <p className="prose-chart max-w-prose">{f.body}</p>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div>
                    <div className="label mb-1">The arithmetic</div>
                    <pre className="num whitespace-pre-wrap break-words border border-chart-rule px-2 py-2 text-xs leading-relaxed">
                      {f.arithmetic}
                    </pre>
                  </div>
                  <div>
                    <div className="label mb-1">Why this threshold exists</div>
                    <p className="prose-chart">{f.why}</p>
                  </div>
                  <div>
                    <div className="label mb-1">Your question to answer</div>
                    <p className="prose-chart font-semibold">{f.question}</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-chart-rule pt-3">
                  <div className="label mb-1">Resolve with a note</div>
                  <textarea
                    className="h-20 w-full"
                    placeholder="What did you decide, and why? This is what you will read in six months."
                    value={notes[f.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="btn"
                      disabled={pending || !(notes[f.id] ?? '').trim()}
                      onClick={() => resolve(f.id)}
                    >
                      Resolve
                    </button>
                    <span className="label">
                      A note is required — the record of what you decided is the point.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
