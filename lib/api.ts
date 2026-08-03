import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { formatZodError } from './validators';

export const dynamic = 'force-dynamic';

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Turns anything thrown inside a route handler into a legible JSON error.
 * Nothing in this app should ever return an HTML stack trace.
 */
export function handleError(err: unknown): NextResponse {
  if (err instanceof ZodError) return fail(formatZodError(err), 422);
  if (err instanceof Error) return fail(err.message, 400);
  return fail('Unknown error.', 500);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function numericParam(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid id: ${value}`);
  return n;
}
