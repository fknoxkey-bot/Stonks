import { listBriefs } from '@/lib/queries';
import type { BriefKind } from '@/lib/types';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const kind = new URL(req.url).searchParams.get('kind') as BriefKind | null;
    return ok({ briefs: listBriefs(kind ?? undefined) });
  } catch (err) {
    return handleError(err);
  }
}
