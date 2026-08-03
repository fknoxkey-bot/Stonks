/**
 * Hand-rolled SVG charts. No charting library: the whole visual language here
 * is hairlines and monospace annotations, which is faster to draw directly
 * than to talk a general-purpose library out of its own defaults.
 *
 * Server components — no interactivity, no hydration cost.
 */
import type { Tier } from '@/lib/types';
import { TIERS, TIER_LABEL } from '@/lib/types';
import { TIER_HEX } from './ui';

const INK = '#12313C';
const RULE = '#C3CFC9';

/**
 * The value chart's y-axis starts at zero.
 *
 * This is a deliberate choice, not an oversight. A zero-anchored axis makes a
 * 3% wobble look like a 3% wobble; a cropped axis makes it look like a cliff.
 * This app exists to reduce reactivity, so it does not get to draw a chart
 * whose whole job is to manufacture some.
 *
 * The cost is real — normal variation gets compressed into the top of the
 * frame. If you would rather see the shape than the scale, set this to false.
 */
const ANCHOR_VALUE_AXIS_AT_ZERO = true;

export interface SeriesPoint {
  t: number;
  value: number;
  basis: number;
  byTier: Record<Tier, number>;
  cash: number;
}

const W = 1000;
const H = 260;
const PAD = { top: 12, right: 64, bottom: 24, left: 8 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

const shortMoney = (n: number) =>
  Math.abs(n) >= 1000
    ? `$${(n / 1000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}k`
    : `$${n.toFixed(0)}`;

const dateLabel = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Frame({
  points,
  children,
  yMax,
  yMin,
  yFormat,
}: {
  points: SeriesPoint[];
  children: React.ReactNode;
  yMax: number;
  yMin: number;
  yFormat: (n: number) => string;
}) {
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const ticks = niceTicks(yMin, yMax);

  const y = (v: number) =>
    PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={RULE} strokeWidth={1} />
          <text
            x={W - PAD.right + 6}
            y={y(v) + 3}
            fill={INK}
            fillOpacity={0.55}
            fontSize={10}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            letterSpacing="0.08em"
          >
            {yFormat(v)}
          </text>
        </g>
      ))}
      {children}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={H - PAD.bottom}
        y2={H - PAD.bottom}
        stroke={INK}
        strokeWidth={1}
      />
      {[t0, t1].map((t, i) => (
        <text
          key={t}
          x={i === 0 ? PAD.left : W - PAD.right}
          y={H - PAD.bottom + 14}
          textAnchor={i === 0 ? 'start' : 'end'}
          fill={INK}
          fillOpacity={0.55}
          fontSize={10}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="0.08em"
        >
          {dateLabel(t)}
        </text>
      ))}
    </svg>
  );
}

/** Portfolio value against cost basis over time. */
export function ValueChart({ points }: { points: SeriesPoint[] }) {
  if (points.length < 2) {
    return <p className="label py-8 text-center">Not enough snapshots to draw a line yet.</p>;
  }

  const values = points.flatMap((p) => [p.value, p.basis]);
  const yMax = Math.max(...values) * 1.04;
  const yMin = ANCHOR_VALUE_AXIS_AT_ZERO ? 0 : Math.min(...values) * 0.97;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;

  const x = (t: number) =>
    PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);

  const path = (key: 'value' | 'basis') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');

  return (
    <div>
      <Frame points={points} yMax={yMax} yMin={yMin} yFormat={shortMoney}>
        <path d={path('basis')} fill="none" stroke={INK} strokeOpacity={0.35} strokeDasharray="3 3" strokeWidth={1} />
        <path d={path('value')} fill="none" stroke={INK} strokeWidth={1.5} />
      </Frame>
      <div className="mt-1 flex gap-4">
        <Key swatch={<span className="inline-block h-px w-4 bg-chart-ink align-middle" />} text="Portfolio value" />
        <Key
          swatch={
            <span
              className="inline-block h-px w-4 align-middle"
              style={{ backgroundImage: `repeating-linear-gradient(to right, ${INK} 0 3px, transparent 3px 6px)` }}
            />
          }
          text="Capital in — cost basis plus cash"
        />
      </div>
    </div>
  );
}

/** Tier allocation over time, as stacked percentage bands. */
export function AllocationChart({ points }: { points: SeriesPoint[] }) {
  if (points.length < 2) {
    return <p className="label py-8 text-center">Not enough snapshots to draw a band yet.</p>;
  }

  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (p: number) => PAD.top + (1 - p / 100) * (H - PAD.top - PAD.bottom);

  const shares = points.map((p) => {
    const total = TIERS.reduce((s, t) => s + p.byTier[t], 0) + p.cash;
    const denom = total > 0 ? total : 1;
    return {
      t: p.t,
      low: (p.byTier.low / denom) * 100,
      med: (p.byTier.med / denom) * 100,
      high: (p.byTier.high / denom) * 100,
    };
  });

  // Stack from the bottom: preservation, diversified, speculative, then cash
  // fills whatever is left.
  let base = shares.map(() => 0);
  const bands = TIERS.map((tier) => {
    const lower = [...base];
    const upper = shares.map((s, i) => lower[i] + s[tier]);
    base = upper;
    const top = shares.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)} ${y(upper[i]).toFixed(1)}`);
    const bottom = shares
      .map((s, i) => `L${x(s.t).toFixed(1)} ${y(lower[i]).toFixed(1)}`)
      .reverse();
    return { tier, d: `${top.join(' ')} ${bottom.join(' ')} Z` };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)} stroke={RULE} strokeWidth={1} />
            <text
              x={W - PAD.right + 6}
              y={y(p) + 3}
              fill={INK}
              fillOpacity={0.55}
              fontSize={10}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              letterSpacing="0.08em"
            >
              {p}%
            </text>
          </g>
        ))}
        {bands.map((b) => (
          <path key={b.tier} d={b.d} fill={TIER_HEX[b.tier]} fillOpacity={0.4} stroke={TIER_HEX[b.tier]} strokeWidth={1} />
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke={INK} strokeWidth={1} />
        {[t0, t1].map((t, i) => (
          <text
            key={t}
            x={i === 0 ? PAD.left : W - PAD.right}
            y={H - PAD.bottom + 14}
            textAnchor={i === 0 ? 'start' : 'end'}
            fill={INK}
            fillOpacity={0.55}
            fontSize={10}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            letterSpacing="0.08em"
          >
            {dateLabel(t)}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4">
        {TIERS.map((t) => (
          <Key
            key={t}
            swatch={
              <span
                className="inline-block h-2 w-2 align-middle"
                style={{ backgroundColor: TIER_HEX[t] }}
              />
            }
            text={TIER_LABEL[t]}
          />
        ))}
        <Key
          swatch={<span className="inline-block h-2 w-2 border border-chart-rule align-middle" />}
          text="CASH — the unfilled remainder"
        />
      </div>
    </div>
  );
}

function Key({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <span className="label inline-flex items-center gap-1.5">
      {swatch}
      {text}
    </span>
  );
}
