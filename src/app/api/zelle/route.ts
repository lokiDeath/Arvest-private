// GET/POST /api/zelle — P2P transfers with status synchronized to the ledger.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireString } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { submitZelle } from '@/lib/banking';
import { db } from '@/lib/db';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });

  return withIdempotency(req, 'zelle', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const amount = parseAmount(body.amount);
    const fromAccountId = requireString(body.fromAccountId, 'Source account');
    const recipientName = requireString(body.recipientName, 'Recipient name', { min: 2, max: 80 });
    const recipientEmail = typeof body.recipientEmail === 'string' && body.recipientEmail.trim() ? body.recipientEmail.trim() : undefined;
    const recipientPhone = typeof body.recipientPhone === 'string' && body.recipientPhone.trim() ? body.recipientPhone.trim() : undefined;
    if (!recipientEmail && !recipientPhone) {
      return ok({ error: 'Provide a recipient email or phone number' }, { status: 422 });
    }
    const res = await submitZelle(user, { fromAccountId, recipientName, recipientEmail, recipientPhone, amount, memo: body.memo as string | undefined });
    return ok({ success: true, ...res });
  });
});

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const items = await db.zelleTransfer.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { account: { select: { nickname: true, accountNumber: true } } },
  });
  return ok({ zelleTransfers: items });
});
