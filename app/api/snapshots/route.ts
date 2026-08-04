import { listSnapshots, takeSnapshot } from '@/lib/queries';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ snapshots: listSnapshots() });
}

export async function POST() {
  try {
    return ok({ snapshot: takeSnapshot() }, 201);
  } catch (err) {
    return handleError(err);
  }
}
