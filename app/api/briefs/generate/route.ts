import { runBrief } from '@/lib/brief-runner';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

/** On-demand weekly brief. Same code path the cron route uses. */
export async function POST() {
  try {
    return ok(await runBrief('weekly'));
  } catch (err) {
    return handleError(err);
  }
}
