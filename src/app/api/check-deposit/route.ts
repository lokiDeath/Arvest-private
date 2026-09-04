// GET/POST /api/check-deposit — mobile check deposit.
// Every submission creates a PENDING deposit + Operations Queue item.
// The bank manager reviews the check images and approves (credits the
// account through the ledger) or rejects (customer notified).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireString } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { submitCheckDeposit } from '@/lib/banking';
import { db } from '@/lib/db';

const MAX_IMAGE_CHARS = 900_000; // ~675KB base64

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });

  return withIdempotency(req, 'check-deposit', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const amount = parseAmount(body.amount);
    const accountId = requireString(body.accountId, 'Account');

    const frontImage = typeof body.frontImage === 'string' ? body.frontImage : undefined;
    const backImage = typeof body.backImage === 'string' ? body.backImage : undefined;
    for (const img of [frontImage, backImage]) {
      if (img && (img.length > MAX_IMAGE_CHARS || !img.startsWith('data:image/'))) {
        return ok({ error: 'Check images must be compressed JPEG/PNG photos' }, { status: 422 });
      }
    }
    if (!frontImage || !backImage) return ok({ error: 'Capture both the front and back of the check' }, { status: 422 });

    const res = await submitCheckDeposit(user, {
      accountId,
      amount,
      checkNumber: typeof body.checkNumber === 'string' ? body.checkNumber.trim() : undefined,
      frontImage,
      backImage,
      memo: typeof body.memo === 'string' ? body.memo.trim() : undefined,
    });
    return ok({
      success: true,
      deposit: { id: res.deposit.id, reference: res.deposit.reference, amount: res.deposit.amount, status: res.deposit.status },
    });
  });
});

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const deposits = await db.checkDeposit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { account: { select: { nickname: true, accountNumber: true } } },
  });
  return ok({ deposits });
});
