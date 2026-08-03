import { buildPortfolioState } from '@/lib/queries';
import {
  drawdownPct,
  effectiveValue,
  isOpen,
  money,
  openPositions,
  pct,
  positionWeight,
  priceAgeDays,
  realizedPL,
  totalBasis,
  totalValue,
} from '@/lib/portfolio';
import { STALE_PRICE_DAYS } from '@/lib/constants';
import { anyPriceProviderConfigured } from '@/lib/prices';
import { PositionsTable, type PositionRow } from '@/components/positions-table';
import { Label, Panel } from '@/components/ui';

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
  const staleCount = rows.filter((r) => r.stale).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-px border border-chart-rule bg-chart-rule sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Portfolio value" value={money(total)} />
        <Stat label="Cost basis" value={money(basis)} />
        <Stat
          label="Unrealized"
          value={`${unrealized >= 0 ? '+' : ''}${money(unrealized)}`}
          tone={unrealized >= 0 ? '#2E7159' : '#A72F6E'}
        />
        <Stat
          label="Return on basis"
          value={basis > 0 ? pct((unrealized / basis) * 100) : '—'}
          tone={unrealized >= 0 ? '#2E7159' : '#A72F6E'}
        />
        <Stat label="Cash" value={money(state.cash)} />
        <Stat label="Open positions" value={String(openPositions(state).length)} />
      </div>

      {!anyPriceProviderConfigured() && (
        <div className="panel border-dashed px-3 py-3">
          <Label>No market data provider configured</Label>
          <p className="prose-chart mt-1 max-w-prose">
            Set <code className="font-mono text-xs">FINNHUB_API_KEY</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to fetch prices. Until then
            positions are valued at cost basis, and every rule that does not need a live price still
            runs.
          </p>
        </div>
      )}

      {staleCount > 0 && (
        <div className="panel px-3 py-2" style={{ borderColor: '#B87A22' }}>
          <span className="label-strong" style={{ color: '#B87A22' }}>
            {staleCount} position{staleCount === 1 ? ' has' : 's have'} a price older than{' '}
            {STALE_PRICE_DAYS} days
          </span>
          <p className="prose-chart mt-1 max-w-prose">
            Those rows are marked below. Weights and returns involving them are provisional — they
            are not being shown to you as current.
          </p>
        </div>
      )}

      <Panel title="Positions">
        <PositionsTable rows={rows} staleDays={STALE_PRICE_DAYS} />
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-chart-paper px-3 py-2">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-lg" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}
