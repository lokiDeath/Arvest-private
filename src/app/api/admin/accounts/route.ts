// GET  /api/admin/accounts — every bank account with owner context.
// POST /api/admin/accounts — actions:
//   ADJUST  { accountId, direction CREDIT|DEBIT, amount, reason }  (ledger-adjusted)
//   HOLD    { accountId, amount, reason }          (available → held)
//   RELEASE { accountId, amount, reason }          (held → available)
//   SET_STATUS { accountId, status ACTIVE|FROZEN|CLOSED }
//   OPEN_FOR_CUSTOMER { userId, type, nickname?, initialDeposit? }
//   UPDATE  { accountId, nickname?, type? }
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireString, requireEnum, parseAmount, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { adminAdjustFunds, adminPlaceHold, adminReleaseHold, openCustomerAccount } from '@/lib/banking';
import { audit, notifyCustomer } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const status = sp.get('status');
  const accounts = await db.account.findMany({
    where: {
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(q
        ? {
            OR: [
              { nickname: { contains: q, mode: 'insensitive' as const } },
              { accountNumber: { contains: q } },
              { user: { name: { contains: q, mode: 'insensitive' as const } } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
  });
  return ok({ accounts });
});

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);
  const action = requireString(body.action, 'Action');

  switch (action) {
    case 'ADJUST': {
      const direction = requireEnum(body.direction, 'Direction', ['CREDIT', 'DEBIT'] as const);
      const amount = parseAmount(body.amount);
      const accountId = requireString(body.accountId, 'Account');
      const reason = requireString(body.reason, 'Reason', { min: 3, max: 300 });
      const res = await adminAdjustFunds(admin, { accountId, direction, amount, reason });
      return ok({ success: true, reference: res.reference });
    }
    case 'HOLD': {
      const amount = parseAmount(body.amount);
      const accountId = requireString(body.accountId, 'Account');
      const reason = requireString(body.reason, 'Reason', { min: 3, max: 300 });
      const res = await adminPlaceHold(admin, { accountId, amount, reason });
      return ok({ success: true, reference: res.reference });
    }
    case 'RELEASE': {
      const amount = parseAmount(body.amount);
      const accountId = requireString(body.accountId, 'Account');
      const reason = requireString(body.reason, 'Reason', { min: 3, max: 300 });
      const res = await adminReleaseHold(admin, { accountId, amount, reason });
      return ok({ success: true, reference: res.reference });
    }
    case 'SET_STATUS': {
      const accountId = requireString(body.accountId, 'Account');
      const status = requireEnum(body.status, 'Status', ['ACTIVE', 'FROZEN', 'CLOSED'] as const);
      const account = await db.account.findUnique({ where: { id: accountId } });
      if (!account) return fail('Account not found', 404);
      if (status === 'CLOSED' && (account.balance !== 0 || account.held !== 0)) {
        return fail('Account must have zero balance and zero held funds before closing', 422);
      }
      const updated = await db.account.update({ where: { id: accountId }, data: { status } });
      await audit(admin.id, admin.email, 'ADMIN_ACCOUNT_STATUS', `${account.accountNumber} → ${status}`);
      await notifyCustomer(account.userId, 'ACCOUNT', 'Account status updated', `${account.nickname}: ${status.toLowerCase()}.`, account.userId);
      return ok({ success: true, account: updated });
    }
    case 'OPEN_FOR_CUSTOMER': {
      const userId = requireString(body.userId, 'Customer');
      const type = requireEnum(body.type, 'Account type', ['CHECKING', 'SAVINGS', 'PRIVATE_CLIENT'] as const);
      const initialDeposit = body.initialDeposit === undefined || body.initialDeposit === '' ? 0 : parseAmount(body.initialDeposit);
      const customer = await db.user.findFirst({ where: { id: userId, role: 'CUSTOMER' } });
      if (!customer) return fail('Customer not found', 404);
      const res = await openCustomerAccount(customer, { type, nickname: typeof body.nickname === 'string' ? body.nickname : undefined, initialDeposit }, { byAdmin: true, admin });
      await audit(admin.id, admin.email, 'ADMIN_ACCOUNT_OPEN', `${customer.email}: ${type} ${res.account.accountNumber}`);
      return ok({ success: true, account: res.account, pending: res.pending });
    }
    case 'UPDATE': {
      const accountId = requireString(body.accountId, 'Account');
      const data: Record<string, unknown> = {};
      if (typeof body.nickname === 'string' && body.nickname.trim()) data.nickname = body.nickname.trim();
      if (typeof body.type === 'string' && ['CHECKING', 'SAVINGS', 'PRIVATE_CLIENT'].includes(body.type)) data.type = body.type;
      const updated = await db.account.update({ where: { id: accountId }, data });
      await audit(admin.id, admin.email, 'ADMIN_ACCOUNT_UPDATE', `${updated.accountNumber}: ${Object.keys(data).join(', ')}`);
      return ok({ success: true, account: updated });
    }
    default:
      return fail('Unknown action', 422);
  }
});
