import { createNearTerm, deleteNearTerm, listNearTerm } from '@/lib/queries';
import { nearTermSchema } from '@/lib/validators';
import { fail, handleError, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ nearTerm: listNearTerm() });
}

export async function POST(req: Request) {
  try {
    const { amount, need_by, label } = nearTermSchema.parse(await readJson(req));
    return ok({ nearTerm: createNearTerm(amount, need_by, label) }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return fail('An id query parameter is required.');
    deleteNearTerm(id);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
