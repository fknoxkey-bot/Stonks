import { deletePosition, getPosition, updatePosition } from '@/lib/queries';
import { positionUpdateSchema } from '@/lib/validators';
import { fail, handleError, numericParam, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const position = getPosition(numericParam((await params).id));
    return position ? ok({ position }) : fail('No such position.', 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const id = numericParam((await params).id);
    const input = positionUpdateSchema.parse(await readJson(req));
    return ok({ position: updatePosition(id, input) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    deletePosition(numericParam((await params).id));
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
