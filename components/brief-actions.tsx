'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Generation can take a few minutes with web search at max effort, so this
 * says so rather than looking hung.
 */
export function BriefActions({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<null | 'weekly' | 'gaps'>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(kind: 'weekly' | 'gaps') {
    setRunning(kind);
    setMessage(null);
    try {
      const res = await fetch(kind === 'weekly' ? '/api/briefs/generate' : '/api/gaps', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (data?.configured === false) setMessage(data.error ?? 'Not configured.');
      else if (data?.ok === false)
        setMessage(
          `Stored with a schema failure after ${data.attempts} attempts — open it below to see what the model returned.`,
        );
      else setMessage('Done.');
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn"
        disabled={!configured || running !== null || pending}
        onClick={() => run('weekly')}
      >
        {running === 'weekly' ? 'Generating…' : 'Generate weekly brief'}
      </button>
      <button
        className="btn-quiet"
        disabled={!configured || running !== null || pending}
        onClick={() => run('gaps')}
      >
        {running === 'gaps' ? 'Analysing…' : 'Run gap analysis'}
      </button>
      {running && (
        <span className="label">
          Searching the web at max effort — this usually takes a few minutes.
        </span>
      )}
      {message && !running && <span className="label">{message}</span>}
    </div>
  );
}
