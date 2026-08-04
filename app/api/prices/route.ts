import { listPositions } from '@/lib/queries';
import { anyPriceProviderConfigured, priceProvidersConfigured, refreshQuotes } from '@/lib/prices';
import { isOpen } from '@/lib/portfolio';
import { handleError, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Which providers are wired up. Drives the "not configured" banner. */
export async function GET() {
  return ok({ providers: priceProvidersConfigured() });
}

/**
 * Refreshes prices for open positions (or an explicit ticker list). Never
 * throws on a provider failure — every ticker comes back with an outcome,
 * and the UI shows which ones did not resolve.
 */
export async function POST(req: Request) {
  try {
    if (!anyPriceProviderConfigured()) {
      return ok({
        configured: false,
        results: [],
        message:
          'No market data provider is configured. Set FINNHUB_API_KEY (or ALPHA_VANTAGE_API_KEY) in .env.local. Positions, rules, and flags all work without it — prices will just stay where they are.',
      });
    }

    const body = (await readJson(req)) as { tickers?: string[] };
    const tickers =
      body.tickers && body.tickers.length > 0
        ? body.tickers
        : listPositions(true).filter(isOpen).map((p) => p.ticker);

    const results = await refreshQuotes(tickers);
    return ok({
      configured: true,
      results,
      updated: results.filter((r) => r.ok && !r.cached).length,
      cached: results.filter((r) => r.ok && r.cached).length,
      failed: results.filter((r) => !r.ok).length,
    });
  } catch (err) {
    return handleError(err);
  }
}
