// GET/POST/PATCH /api/billpay — scheduled bill payments with real
// status handling: SCHEDULED → (due) → PAID / ON_HOLD / CANCELLED / FAILED.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireString, requireDate } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { scheduleBillPay } from '@/lib/banking';
import { db } from '@/lib/db';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });

  return withIdempotency(req, 'billpay', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const accountId = requireString(body.accountId, 'Account');
    const payee = requireString(body.payee, 'Payee', { min: 2, max: 80 });
    const amount = parseAmount(body.amount);
    const payDate = requireDate(body.payDate ?? new Date(), 'Pay date');
    const bill = await scheduleBillPay(user, {
      accountId,
      payee,
      payeeAccount: typeof body.payeeAccount === 'string' ? body.payeeAccount.trim() : undefined,
      amount,
      memo: typeof body.memo === 'string' ? body.memo.trim() : undefined,
      payDate,
    });
    return ok({ success: true, bill });
  });
});

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const bills = await db.billPay.findMany({
    where: { userId: user.id },
    orderBy: [{ payDate: 'asc' }],
    take: 100,
    include: { account: { select: { nickname: true, accountNumber: true } } },
  });
  return ok({ bills });
});

export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<{ id?: string; action?: string }>(req);
  const id = requireString(body.id, 'Bill id');
  const bill = await db.billPay.findFirst({ where: { id, userId: user.id } });
  if (!bill) return ok({ error: 'Bill not found' }, { status: 404 });

  if (body.action === 'CANCEL') {
    if (!['SCHEDULED', 'ON_HOLD', 'FAILED'].includes(bill.status)) {
      return ok({ error: `A ${bill.status.toLowerCase()} payment can no longer be cancelled` }, { status: 409 });
    }
    await db.billPay.update({ where: { id: bill.id }, data: { status: 'CANCELLED' } });
    return ok({ success: true });
  }
  if (body.action === 'PAY_NOW') {
    if (bill.status !== 'SCHEDULED') return ok({ error: 'Only scheduled payments can be paid now' }, { status: 409 });
    await db.billPay.update({ where: { id: bill.id }, data: { payDate: new Date() } });
    const { processBill } = await import('@/lib/banking');
    const result = await processBill(bill.id);
    return ok({ success: true, result });
  }
  return ok({ error: 'Unknown action' }, { status: 422 });
});
