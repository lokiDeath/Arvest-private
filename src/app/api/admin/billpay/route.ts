// GET/PATCH /api/admin/billpay — all bill payments; PATCH can cancel or force-pay.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireString, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { processBill } from '@/lib/banking';
import { audit, notifyCustomer } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const bills = await db.billPay.findMany({
    where: status && status !== 'ALL' ? { status } : {},
    orderBy: [{ payDate: 'asc' }],
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
      account: { select: { nickname: true, accountNumber: true } },
    },
  });
  return ok({ bills });
});

export const PATCH = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<{ id?: string; action?: string }>(req);
  const id = requireString(body.id, 'Bill id');
  const bill = await db.billPay.findUnique({ where: { id } });
  if (!bill) return fail('Bill not found', 404);

  if (body.action === 'CANCEL') {
    if (!['SCHEDULED', 'ON_HOLD', 'FAILED'].includes(bill.status)) {
      return fail(`A ${bill.status.toLowerCase()} payment can't be cancelled`, 409);
    }
    await db.billPay.update({ where: { id: bill.id }, data: { status: 'CANCELLED' } });
    await audit(admin.id, admin.email, 'ADMIN_BILL_CANCEL', `${bill.reference} → ${bill.payee}`);
    await notifyCustomer(bill.userId, 'BILL_PAY', 'Bill payment cancelled', `Payment to ${bill.payee} (${bill.reference}) was cancelled by the bank.`, bill.userId);
    return ok({ success: true });
  }
  if (body.action === 'PROCESS_NOW') {
    if (bill.status !== 'SCHEDULED') return fail('Only scheduled bills can be processed now', 409);
    await db.billPay.update({ where: { id: bill.id }, data: { payDate: new Date(Date.now() - 1000) } });
    const result = await processBill(bill.id);
    await audit(admin.id, admin.email, 'ADMIN_BILL_PROCESS', `${bill.reference} → ${result}`);
    return ok({ success: true, result });
  }
  return fail('Unknown action', 422);
});
