import type { ReactNode } from 'react';
import type { Severity, Tier } from '@/lib/types';
import { TIER_NAME, TIER_HELP, SEVERITY_PLAIN } from '@/lib/plain';

/**
 * Tiers run cool → warm → hot. Deliberately not green/red — those belong to
 * gain and loss, and "risky" must never be readable as "losing money".
 */
export const TIER_HEX: Record<Tier, string> = {
  low: '#4DABF7',
  med: '#FFB020',
  high: '#F06595',
};

export const SEVERITY_HEX: Record<Severity, string> = {
  low: '#98A1AE',
  med: '#FFB020',
  high: '#FF5A47',
};

export const UP = '#00C805';
export const DOWN = '#FF5A47';

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>;
}

/** A one-line plain-English explainer. Used under headings and labels. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint mt-1 max-w-prose">{children}</p>;
}

/** The one container in the app. */
export function Panel({
  title,
  hint,
  right,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
          <div>
            <h2 className="label-strong">{title}</h2>
            {hint && <Hint>{hint}</Hint>}
          </div>
          {right}
        </header>
      )}
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}

/** Coloured dot plus the tier's plain name. Native tooltip carries the detail. */
export function TierMark({ tier, showLabel = true }: { tier: Tier; showLabel?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap"
      title={`${TIER_NAME[tier]} — ${TIER_HELP[tier]}`}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: TIER_HEX[tier] }}
      />
      {showLabel && <span className="text-2xs font-medium">{TIER_NAME[tier]}</span>}
    </span>
  );
}

/** "Look now" / "Worth a look" / "Minor" rather than HIGH/MED/LOW. */
export function SeverityMark({ severity }: { severity: Severity }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold"
      style={{
        color: SEVERITY_HEX[severity],
        backgroundColor: `${SEVERITY_HEX[severity]}1F`,
      }}
    >
      {SEVERITY_PLAIN[severity] ?? severity}
    </span>
  );
}

/** The "not configured" state — a normal condition, not an error. */
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
    <div className="rounded-lg border border-dashed border-line px-5 py-4">
      <Label>Not set up yet</Label>
      <p className="prose-chart mt-2 max-w-prose">
        {what} needs a key called <code>{envVar}</code> in the file{' '}
        <code>.env.local</code>. Everything else — your holdings, prices, the checks and their
        history — works exactly as before without it.
      </p>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="label py-8 text-center">{children}</p>;
}

/** Signed figure, green up, red down. */
export function Delta({
  value,
  format,
  className = '',
}: {
  value: number | null;
  format: (n: number) => string;
  className?: string;
}) {
  if (value === null) return <span className="num text-dim">—</span>;
  const colour = value > 0 ? UP : value < 0 ? DOWN : undefined;
  return (
    <span className={`num ${className}`} style={colour ? { color: colour } : undefined}>
      {value > 0 ? '+' : ''}
      {format(value)}
    </span>
  );
}
