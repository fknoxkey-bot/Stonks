import { createPosition, listPositions, latestPrices } from '@/lib/queries';
import { pricePositions } from '@/lib/portfolio';
import { positionCreateSchema } from '@/lib/validators';
import { handleError, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const includeClosed = new URL(req.url).searchParams.get('closed') !== 'false';
    const positions = pricePositions(listPositions(includeClosed), latestPrices());
    return ok({ positions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const input = positionCreateSchema.parse(await readJson(req));
    return ok({ position: createPosition(input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
