import { runBrief } from '@/lib/brief-runner';
import { latestBrief } from '@/lib/queries';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function GET() {
  return ok({ brief: latestBrief('gaps') });
}

/**
 * Gap analysis, on demand. Deliberately not on a schedule: it names things
 * you do not own, and a weekly drip of those is how a discipline tool turns
 * into a shopping feed.
 */
export async function POST() {
  try {
    return ok(await runBrief('gaps'));
  } catch (err) {
    return handleError(err);
  }
}
