// GET/POST /api/loans/[id] — loan detail with payment schedule;
// POST records a loan payment (ledger-debited, balance synced).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireString } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { makeLoanPayment } from '@/lib/banking';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const loan = await db.loan.findFirst({
    where: { id, userId: user.id },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });
  if (!loan) return ok({ error: 'Loan not found' }, { status: 404 });
  return ok({ loan });
});

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });
  const { id } = await ctx.params;

  return withIdempotency(req, 'loan-payment', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const accountId = requireString(body.accountId, 'Account');
    const amount = parseAmount(body.amount);
    const res = await makeLoanPayment(user, id, accountId, amount);
    return ok({ success: true, ...res });
  });
});
