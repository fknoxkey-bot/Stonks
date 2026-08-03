import type { ReactNode } from 'react';
import type { Severity, Tier } from '@/lib/types';
import { TIER_LABEL } from '@/lib/types';

export const TIER_HEX: Record<Tier, string> = {
  low: '#2E7159',
  med: '#B87A22',
  high: '#A72F6E',
};

export const SEVERITY_HEX: Record<Severity, string> = {
  low: '#12313C',
  med: '#B87A22',
  high: '#A72F6E',
};

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>;
}

/** A titled block with a hairline border. The only container in the app. */
export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-chart-rule px-3 py-2">
          <h2 className="label-strong">{title}</h2>
          {right}
        </header>
      )}
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

/** A small colour chip plus the tier's name. Used everywhere a tier appears. */
export function TierMark({ tier, showLabel = true }: { tier: Tier; showLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0"
        style={{ backgroundColor: TIER_HEX[tier] }}
      />
      {showLabel && (
        <span className="font-mono text-2xs uppercase tracking-annotation">{TIER_LABEL[tier]}</span>
      )}
    </span>
  );
}

export function SeverityMark({ severity }: { severity: Severity }) {
  return (
    <span
      className="inline-block border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-annotation"
      style={{ color: SEVERITY_HEX[severity], borderColor: SEVERITY_HEX[severity] }}
    >
      {severity}
    </span>
  );
}

/**
 * The "not configured" state. Every AI feature degrades to this rather than
 * crashing — a missing key is a normal condition, not an error.
 */
export function NotConfigured({
  what,
  envVar,
  children,
}: {
  what: string;
  envVar: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel border-dashed px-3 py-4">
      <Label>Not configured</Label>
      <p className="prose-chart mt-2 max-w-prose">
        {what} needs <code className="font-mono text-xs">{envVar}</code> in{' '}
        <code className="font-mono text-xs">.env.local</code>. Everything that does not depend on it
        — positions, prices, rules, flags, history — works exactly as before.
      </p>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="label py-6 text-center">{children}</p>;
}

/** Signed number, coloured by direction, monospace, tabular. */
export function Delta({ value, format }: { value: number | null; format: (n: number) => string }) {
  if (value === null) return <span className="num text-chart-ink/40">—</span>;
  const colour = value > 0 ? TIER_HEX.low : value < 0 ? TIER_HEX.high : undefined;
  return (
    <span className="num" style={colour ? { color: colour } : undefined}>
      {value > 0 ? '+' : ''}
      {format(value)}
    </span>
  );
}
