import { getCash, listNearTerm, listTargets, setCash, setTarget } from '@/lib/queries';
import { cashSchema, targetsSchema } from '@/lib/validators';
import { handleError, ok, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ targets: listTargets(), cash: getCash(), nearTerm: listNearTerm() });
}

export async function PUT(req: Request) {
  try {
    const body = (await readJson(req)) as Record<string, unknown>;

    if ('amount' in body && !('low' in body)) {
      setCash(cashSchema.parse(body).amount);
      return ok({ cash: getCash() });
    }

    const targets = targetsSchema.parse(body);
    for (const [tier, pct] of Object.entries(targets)) {
      setTarget(tier as 'low' | 'med' | 'high', pct);
    }
    return ok({ targets: listTargets() });
  } catch (err) {
    return handleError(err);
  }
}
