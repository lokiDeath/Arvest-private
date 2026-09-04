// ============================================================
// Arvest Private Banking — Idempotency guard
// Money-movement endpoints accept an `Idempotency-Key` header.
// The first request inserts a lock row (unique constraint);
// concurrent or repeated clicks with the same key receive the
// stored response or a 409 while the first is in flight.
// Rows older than 24h are opportunistically cleaned.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fail } from '@/lib/api';

export async function withIdempotency(
  req: NextRequest,
  endpoint: string,
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  const key = req.headers.get('idempotency-key') ?? req.headers.get('x-idempotency-key');
  if (!key || key.length < 8 || key.length > 128) {
    return fn(); // no key provided — proceed (UI always sends one)
  }

  // Opportunistic cleanup
  try {
    await db.idempotencyKey.deleteMany({ where: { lockedAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  } catch {
    /* non-fatal */
  }

  let lock;
  try {
    lock = await db.idempotencyKey.create({ data: { key, endpoint } });
  } catch {
    const existing = await db.idempotencyKey.findUnique({ where: { key } });
    if (existing?.done && existing.response) {
      return NextResponse.json(JSON.parse(existing.response), { status: existing.statusCode ?? 200 });
    }
    return fail('Duplicate request is already being processed.', 409, 'DUPLICATE_REQUEST');
  }
  void lock;

  try {
    const res = await fn();
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    await db.idempotencyKey
      .update({
        where: { key },
        data: { done: true, response: JSON.stringify(body), statusCode: res.status },
      })
      .catch(() => undefined);
    // Re-wrap since the body stream was consumed.
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    await db.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
    throw e;
  }
}
