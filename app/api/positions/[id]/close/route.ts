import { closePosition, reopenPosition } from '@/lib/queries';
import { positionCloseSchema } from '@/lib/validators';
import { handleError, numericParam, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const id = numericParam((await params).id);
    const { close_price, closed_at } = positionCloseSchema.parse(await readJson(req));
    return ok({ position: closePosition(id, close_price, closed_at) });
  } catch (err) {
    return handleError(err);
  }
}

/** Undo — a mis-clicked close should not require editing the database. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    return ok({ position: reopenPosition(numericParam((await params).id)) });
  } catch (err) {
    return handleError(err);
  }
}
