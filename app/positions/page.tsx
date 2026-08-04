import Link from 'next/link';
import { buildPortfolioState, listFlags } from '@/lib/queries';
import {
  drawdownPct,
  effectiveValue,
  isOpen,
  money,
  openPositions,
  positionWeight,
  priceAgeDays,
  realizedPL,
  totalBasis,
  totalValue,
} from '@/lib/portfolio';
import { STALE_PRICE_DAYS } from '@/lib/constants';
import { anyPriceProviderConfigured } from '@/lib/prices';
import { PositionsTable, type PositionRow } from '@/components/positions-table';
import { Panel, UP, DOWN } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function PositionsPage() {
  const state = buildPortfolioState();

  const rows: PositionRow[] = state.positions.map((p) => {
    const age = priceAgeDays(p, state.now);
    return {
      id: p.id,
      ticker: p.ticker,
      name: p.name,
      tier: p.tier,
      shares: p.shares,
      cost_basis: p.cost_basis,
      thesis: p.thesis,
      invalidation: p.invalidation,
      opened_at: p.opened_at,
      closed_at: p.closed_at,
      close_price: p.close_price,
      price: p.price,
      price_as_of: p.price_as_of,
      price_source: p.price_source,
      weight: isOpen(p) ? positionWeight(state, p) : 0,
      drawdown: drawdownPct(p),
      ageDays: age,
      stale: isOpen(p) && (age === null || age > STALE_PRICE_DAYS),
      unrealized: p.price === null ? null : (p.price - p.cost_basis) * p.shares,
      realized: realizedPL(p),
      value: effectiveValue(p),
    };
  });

  const total = totalValue(state);
  const basis = totalBasis(state);
  const unrealized = total - state.cash - basis;
  const pctChange = basis > 0 ? (unrealized / basis) * 100 : 0;
  const up = unrealized >= 0;
  const staleCount = rows.filter((r) => r.stale).length;
  const openFlags = listFlags({ open: true });

  return (
    <div className="space-y-5">
      {/* The one number that matters, the way a phone app would show it. */}
      <section className="pb-1 pt-2">
        <div className="label">Everything you own</div>
        <div className="num mt-1 text-5xl font-semibold tracking-tight">{money(total)}</div>
        <div className="num mt-2 text-sm font-medium" style={{ color: up ? UP : DOWN }}>
          {up ? '▲' : '▼'} {money(Math.abs(unrealized))} ({Math.abs(pctChange).toFixed(2)}%)
          <span className="ml-2 font-normal text-muted">{up ? 'up' : 'down'} on what you paid</span>
        </div>
        <p className="hint mt-3 max-w-prose">
          That is profit on paper. It only becomes real money when you sell — until then it can go
          back down just as easily.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="You paid, in total"
          value={money(basis)}
          help="Sum of what every holding cost you."
        />
        <Stat
          label="Cash not invested"
          value={money(state.cash)}
          help="Sitting in the account doing nothing."
        />
        <Stat
          label="Holdings"
          value={String(openPositions(state).length)}
          help="Different things you own."
        />
        <Stat
          label="Things to look at"
          value={String(openFlags.length)}
          help="Checks that want your attention."
          href="/review"
          tone={openFlags.length > 0 ? '#FFB020' : undefined}
        />
      </div>

      {!anyPriceProviderConfigured() && (
        <div className="rounded-lg border border-dashed border-line px-5 py-4">
          <div className="label-strong">Prices aren&apos;t updating automatically</div>
          <p className="hint mt-1 max-w-prose">
            Right now each holding is valued at what you paid for it, so the numbers above will not
            move on their own. A free key from finnhub.io fixes that — or you can type prices in by
            hand.
          </p>
        </div>
      )}

      {staleCount > 0 && (
        <div className="rounded-lg px-5 py-4" style={{ backgroundColor: 'rgba(255,176,32,0.09)' }}>
          <div className="label-strong" style={{ color: '#FFB020' }}>
            {staleCount === 1 ? 'One price is' : `${staleCount} prices are`} more than{' '}
            {STALE_PRICE_DAYS} days old
          </div>
          <p className="hint mt-1 max-w-prose">
            Those rows are marked below. We are showing the last price we managed to get, not a
            current one — so treat those totals as rough.
          </p>
        </div>
      )}

      <Panel
        title="Your holdings"
        hint="Click a ticker to see why you bought it and what would change your mind."
      >
        <PositionsTable rows={rows} staleDays={STALE_PRICE_DAYS} />
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  help,
  tone,
  href,
}: {
  label: string;
  value: string;
  help: string;
  tone?: string;
  href?: string;
}) {
  const body = (
    <div className="card h-full px-4 py-3 transition-colors hover:border-line">
      <div className="label">{label}</div>
      <div className="num mt-1 text-xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <p className="hint mt-1">{help}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
