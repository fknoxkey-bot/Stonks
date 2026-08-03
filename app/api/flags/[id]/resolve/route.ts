import { resolveFlag } from '@/lib/queries';
import { resolveFlagSchema } from '@/lib/validators';
import { handleError, numericParam, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const id = numericParam((await params).id);
    const { note } = resolveFlagSchema.parse(await readJson(req));
    resolveFlag(id, note);
    return ok({ resolved: true });
  } catch (err) {
    return handleError(err);
  }
}
