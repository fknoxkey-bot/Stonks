/**
 * Market data.
 *
 * Finnhub is the primary provider, Alpha Vantage the fallback. The reasoning
 * is in the README; the short version is that Finnhub's free tier allows 60
 * calls/minute against Alpha Vantage's 25/day, which is the difference
 * between "refresh whenever you like" and "rationed".
 *
 * Three things this module guarantees:
 *
 *   1. A ticker is never fetched more than once per hour (PRICE_CACHE_TTL_MS),
 *      no matter how many times you hit refresh.
 *   2. Prices are appended, never updated in place.
 *   3. Failures are returned as data, not thrown. The caller renders them.
 *      A price fetch failing must never take down the page.
 */
import { insertPrice, latestPrice } from './queries';
import { PRICE_CACHE_TTL_MS, PRICE_NEGATIVE_CACHE_TTL_MS } from './constants';
import { envRaw, hasEnv } from './env';

export type QuoteFailure =
  | 'not_configured'
  | 'invalid_ticker'
  | 'rate_limited'
  | 'provider_down'
  | 'no_data';

export type QuoteResult =
  | {
      ok: true;
      ticker: string;
      price: number;
      source: string;
      as_of: string;
      /** True when we served the cached row instead of calling out. */
      cached: boolean;
    }
  | { ok: false; ticker: string; reason: QuoteFailure; message: string };

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Tickers a provider has explicitly rejected, so we stop hammering the API
 * with a symbol that will never resolve. In-memory: it clears on restart,
 * which is the correct behaviour for a typo you have since fixed.
 */
const negativeCache = new Map<string, number>();

export function priceProvidersConfigured(): { finnhub: boolean; alphaVantage: boolean } {
  return {
    finnhub: hasEnv('FINNHUB_API_KEY'),
    alphaVantage: hasEnv('ALPHA_VANTAGE_API_KEY'),
  };
}

export function anyPriceProviderConfigured(): boolean {
  const c = priceProvidersConfigured();
  return c.finnhub || c.alphaVantage;
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/* ------------------------------------------------------------------ *
 * Finnhub — primary
 * ------------------------------------------------------------------ */

interface FinnhubQuote {
  c?: number; // current
  pc?: number; // previous close
  t?: number; // unix seconds
}

async function fetchFinnhub(ticker: string): Promise<QuoteResult> {
  const key = envRaw('FINNHUB_API_KEY');
  if (!key) {
    return { ok: false, ticker, reason: 'not_configured', message: 'FINNHUB_API_KEY is not set.' };
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(key)}`;
  const { status, body } = await getJson(url);

  if (status === 429) {
    return { ok: false, ticker, reason: 'rate_limited', message: 'Finnhub rate limit reached.' };
  }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      ticker,
      reason: 'not_configured',
      message: 'Finnhub rejected the API key.',
    };
  }
  if (status >= 500) {
    return { ok: false, ticker, reason: 'provider_down', message: `Finnhub returned ${status}.` };
  }
  if (status !== 200 || body === null) {
    return { ok: false, ticker, reason: 'provider_down', message: `Finnhub returned ${status}.` };
  }

  const q = body as FinnhubQuote;

  // Finnhub answers an unknown or delisted symbol with an all-zero quote
  // rather than a 404. A real security never has both a zero current price
  // and a zero previous close.
  if (!q.c && !q.pc) {
    return {
      ok: false,
      ticker,
      reason: 'invalid_ticker',
      message: `Finnhub has no data for ${ticker} — unknown symbol or delisted.`,
    };
  }

  // Outside market hours `c` is the last close. That is a real price; it is
  // just not a live one. The as_of timestamp carries that information, and
  // the stalePrice rule is what complains if it gets old.
  const price = q.c && q.c > 0 ? q.c : q.pc!;
  const as_of = q.t && q.t > 0 ? new Date(q.t * 1000).toISOString() : new Date().toISOString();

  return { ok: true, ticker, price, source: 'finnhub', as_of, cached: false };
}

/* ------------------------------------------------------------------ *
 * Alpha Vantage — fallback
 * ------------------------------------------------------------------ */

async function fetchAlphaVantage(ticker: string): Promise<QuoteResult> {
  const key = envRaw('ALPHA_VANTAGE_API_KEY');
  if (!key) {
    return {
      ok: false,
      ticker,
      reason: 'not_configured',
      message: 'ALPHA_VANTAGE_API_KEY is not set.',
    };
  }

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`;
  const { status, body } = await getJson(url);

  if (status !== 200 || body === null || typeof body !== 'object') {
    return {
      ok: false,
      ticker,
      reason: 'provider_down',
      message: `Alpha Vantage returned ${status}.`,
    };
  }

  const obj = body as Record<string, unknown>;

  // Alpha Vantage signals throttling with a 200 and a prose message.
  if ('Note' in obj || 'Information' in obj) {
    return {
      ok: false,
      ticker,
      reason: 'rate_limited',
      message: String(obj.Note ?? obj.Information),
    };
  }
  if ('Error Message' in obj) {
    return {
      ok: false,
      ticker,
      reason: 'invalid_ticker',
      message: String(obj['Error Message']),
    };
  }

  const quote = obj['Global Quote'] as Record<string, string> | undefined;
  const raw = quote?.['05. price'];
  const price = raw === undefined ? NaN : Number(raw);

  if (!quote || Object.keys(quote).length === 0) {
    return {
      ok: false,
      ticker,
      reason: 'invalid_ticker',
      message: `Alpha Vantage has no data for ${ticker}.`,
    };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, ticker, reason: 'no_data', message: `Alpha Vantage returned no price for ${ticker}.` };
  }

  const day = quote['07. latest trading day'];
  const as_of = day ? new Date(`${day}T21:00:00.000Z`).toISOString() : new Date().toISOString();

  return { ok: true, ticker, price, source: 'alphavantage', as_of, cached: false };
}

/* ------------------------------------------------------------------ *
 * orchestration
 * ------------------------------------------------------------------ */

/**
 * One ticker. Serves the cached row when it is under an hour old, otherwise
 * tries Finnhub then Alpha Vantage. A successful fetch is appended to the
 * prices table before returning.
 */
export async function fetchQuote(rawTicker: string, now: Date = new Date()): Promise<QuoteResult> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) {
    return { ok: false, ticker, reason: 'invalid_ticker', message: 'Empty ticker.' };
  }

  const cached = latestPrice(ticker);
  if (cached) {
    const age = now.getTime() - new Date(cached.as_of).getTime();
    if (Number.isFinite(age) && age >= 0 && age < PRICE_CACHE_TTL_MS) {
      return {
        ok: true,
        ticker,
        price: cached.price,
        source: cached.source,
        as_of: cached.as_of,
        cached: true,
      };
    }
  }

  const blockedUntil = negativeCache.get(ticker);
  if (blockedUntil && blockedUntil > now.getTime()) {
    return {
      ok: false,
      ticker,
      reason: 'invalid_ticker',
      message: `${ticker} was rejected by the provider recently; not retrying until ${new Date(blockedUntil).toISOString()}.`,
    };
  }

  const attempts: QuoteResult[] = [];
  for (const provider of [fetchFinnhub, fetchAlphaVantage]) {
    let result: QuoteResult;
    try {
      result = await provider(ticker);
    } catch (err) {
      result = {
        ok: false,
        ticker,
        reason: 'provider_down',
        message: err instanceof Error ? err.message : 'Network error.',
      };
    }

    if (result.ok) {
      insertPrice(ticker, result.price, result.source, result.as_of);
      negativeCache.delete(ticker);
      return result;
    }

    attempts.push(result);
    // A symbol the provider positively rejected will not resolve at the
    // fallback either — stop and remember it.
    if (result.reason === 'invalid_ticker') {
      negativeCache.set(ticker, now.getTime() + PRICE_NEGATIVE_CACHE_TTL_MS);
      return result;
    }
  }

  // Both providers failed for non-symbol reasons. Report the more specific one.
  const configured = attempts.filter((a) => !a.ok && a.reason !== 'not_configured');
  const chosen = (configured[0] ?? attempts[0]) as Extract<QuoteResult, { ok: false }>;
  return {
    ok: false,
    ticker,
    reason: chosen.reason,
    message: attempts
      .map((a) => (a.ok ? '' : a.message))
      .filter(Boolean)
      .join(' · '),
  };
}

/**
 * Refreshes a batch, sequentially. Sequential is deliberate: a burst of
 * parallel requests is the fastest way to trip a free-tier rate limit, and
 * a handful of tickers costs a couple of seconds at worst.
 */
export async function refreshQuotes(
  tickers: string[],
  now: Date = new Date(),
): Promise<QuoteResult[]> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const out: QuoteResult[] = [];
  for (const t of unique) {
    out.push(await fetchQuote(t, now));
  }
  return out;
}

/** Test seam — clears the "do not retry this symbol" memory. */
export function clearNegativeCache(): void {
  negativeCache.clear();
}
