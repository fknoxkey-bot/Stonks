import { buildPortfolioState, listFlags, syncFlags, takeSnapshot } from '@/lib/queries';
import { evaluateAll } from '@/lib/rules';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const param = new URL(req.url).searchParams.get('open');
    const open = param === null ? undefined : param !== 'false';
    return ok({ flags: listFlags({ open }) });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Re-runs the engine and reconciles the flags table. Also takes a snapshot,
 * since "I just looked at the portfolio" is exactly when a history point is
 * worth having.
 */
export async function POST() {
  try {
    const state = buildPortfolioState();
    const evaluated = evaluateAll(state);
    syncFlags(evaluated, state.now);
    takeSnapshot(state, state.now);
    return ok({ raised: evaluated.length, flags: listFlags({ open: true }) });
  } catch (err) {
    return handleError(err);
  }
}
