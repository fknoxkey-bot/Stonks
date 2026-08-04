import { runBrief } from '@/lib/brief-runner';
import { sendBriefEmail } from '@/lib/email';
import { buildPortfolioState, syncFlags, takeSnapshot } from '@/lib/queries';
import { evaluateAll } from '@/lib/rules';
import { weeklyBriefSchema } from '@/lib/validators';
import { fail, handleError, ok } from '@/lib/api';
import { envRaw } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

/**
 * Sunday evening. Re-runs the rules, takes a snapshot, generates the brief,
 * and emails it.
 *
 * Auth: a CRON_SECRET bearer token. When CRON_SECRET is unset the route only
 * answers calls from localhost, so local development works without ceremony
 * and a deployed instance is not left open.
 */
function authorised(req: Request): boolean {
  const secret = envRaw('CRON_SECRET');
  const header = req.headers.get('authorization') ?? '';

  if (secret) return header === `Bearer ${secret}`;

  const host = req.headers.get('host') ?? '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
}

async function run() {
  // The snapshot and flag reconciliation happen first and unconditionally.
  // They do not depend on any API key, so a weekly run is still worth
  // something when the AI side is unconfigured or failing.
  const state = buildPortfolioState();
  const flags = evaluateAll(state);
  syncFlags(flags, state.now);
  const snapshot = takeSnapshot(state, state.now);

  const outcome = await runBrief('weekly');

  let email = { configured: false, sent: false, error: null as string | null };
  if (outcome.ok && outcome.brief) {
    const parsed = weeklyBriefSchema.safeParse(JSON.parse(outcome.brief.payload_json));
    if (parsed.success) {
      email = await sendBriefEmail(parsed.data, outcome.brief.generated_at);
    }
  }

  return {
    ran_at: state.now.toISOString(),
    snapshot_id: snapshot.id,
    flags_open: flags.length,
    brief: {
      configured: outcome.configured,
      id: outcome.brief?.id ?? null,
      // A missing API key is not a schema failure. Reporting it as one would
      // make the run log lie about which thing broke.
      status: !outcome.configured ? 'not_configured' : outcome.ok ? 'ok' : 'schema_error',
      attempts: outcome.attempts,
      error: outcome.error,
    },
    email,
  };
}

export async function POST(req: Request) {
  if (!authorised(req)) return fail('Unauthorised.', 401);
  try {
    return ok(await run());
  } catch (err) {
    return handleError(err);
  }
}

/** GET is accepted too, since most hosted schedulers only issue GETs. */
export async function GET(req: Request) {
  if (!authorised(req)) return fail('Unauthorised.', 401);
  try {
    return ok(await run());
  } catch (err) {
    return handleError(err);
  }
}
