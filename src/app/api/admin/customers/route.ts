// GET  /api/admin/customers?q=&status= — customer directory with relationship totals.
// POST /api/admin/customers — CREATE | UPDATE | SET_STATUS | RESET_PASSWORD | DELETE
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { handler, ok, requireAdmin, readJson, requireEnum, requireString, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, notifyCustomer } from '@/lib/notify';
import { openCustomerAccount } from '@/lib/banking';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const status = sp.get('status');

  const users = await db.user.findMany({
    where: {
      role: 'CUSTOMER',
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { loginId: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true, name: true, email: true, loginId: true, phone: true, status: true,
      avatarUrl: true, createdAt: true, lastLoginAt: true,
      accounts: { select: { id: true, type: true, nickname: true, balance: true, available: true, held: true, status: true, accountNumber: true } },
    },
  });

  const customers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    loginId: u.loginId,
    phone: u.phone,
    status: u.status,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    accountCount: u.accounts.length,
    totalBalance: Math.round(u.accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100,
    totalAvailable: Math.round(u.accounts.reduce((s, a) => s + a.available, 0) * 100) / 100,
    totalHeld: Math.round(u.accounts.reduce((s, a) => s + a.held, 0) * 100) / 100,
    accounts: u.accounts,
  }));

  return ok({ customers });
});

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);
  const action = requireString(body.action, 'Action');

  switch (action) {
    case 'CREATE': {
      const name = requireString(body.name, 'Full name', { min: 2, max: 100 });
      const email = requireString(body.email, 'Email', { min: 5, max: 160 }).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email address', 422);
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) return fail('A user with that email already exists', 409);
      const password = typeof body.password === 'string' && body.password.length >= 10
        ? body.password
        : `Arv-${crypto.randomBytes(6).toString('base64url')}`;
      if (password.length < 10) return fail('Password must be at least 10 characters', 422);
      const base = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) || 'client';
      const loginId = `${base}.${crypto.randomInt(1000, 9999)}`;

      const user = await db.user.create({
        data: {
          name,
          email,
          loginId,
          passwordHash: await bcrypt.hash(password, 10),
          role: 'CUSTOMER',
          status: 'ACTIVE',
          phone: typeof body.phone === 'string' ? body.phone : null,
        },
      });

      const accounts: string[] = [];
      const checking = await openCustomerAccount(user, { type: 'CHECKING', initialDeposit: 0 }, { byAdmin: true, admin });
      accounts.push(checking.account.accountNumber);
      await openCustomerAccount(user, { type: 'SAVINGS', initialDeposit: 0 }, { byAdmin: true, admin });

      await audit(admin.id, admin.email, 'ADMIN_USER_CREATE', `Created customer ${email} (loginId ${loginId})`);
      return ok({
        success: true,
        user: { id: user.id, name, email, loginId },
        credentials: { loginId, password },
      });
    }

    case 'UPDATE': {
      const id = requireString(body.id, 'Customer id');
      const data: Record<string, unknown> = {};
      for (const f of ['name', 'phone', 'address', 'city', 'state', 'zip'] as const) {
        if (typeof body[f] === 'string') data[f] = (body[f] as string).trim() || null;
      }
      if (typeof body.email === 'string' && body.email.trim()) {
        const email = body.email.trim().toLowerCase();
        const dupe = await db.user.findFirst({ where: { email, id: { not: id } } });
        if (dupe) return fail('Another account already uses that email', 409);
        data.email = email;
      }
      if (typeof body.loginId === 'string' && body.loginId.trim()) {
        const loginId = body.loginId.trim().toUpperCase();
        const dupe = await db.user.findFirst({ where: { loginId, id: { not: id } } });
        if (dupe) return fail('Another account already uses that Login ID', 409);
        data.loginId = loginId;
      }
      const user = await db.user.update({ where: { id }, data });
      await audit(admin.id, admin.email, 'ADMIN_USER_UPDATE', `${user.email}: ${Object.keys(data).join(', ')}`);
      return ok({ success: true, user: { id: user.id, email: user.email, loginId: user.loginId, name: user.name } });
    }

    case 'SET_STATUS': {
      const id = requireString(body.id, 'Customer id');
      const status = requireEnum(body.status, 'Status', ['ACTIVE', 'FROZEN'] as const);
      const user = await db.user.update({ where: { id }, data: { status } });
      await audit(admin.id, admin.email, status === 'FROZEN' ? 'ADMIN_FREEZE_USER' : 'ADMIN_UNFREEZE_USER', user.email);
      await notifyCustomer(user.id, 'SECURITY', status === 'FROZEN' ? 'Account frozen' : 'Account restored',
        status === 'FROZEN'
          ? 'Your banking access has been suspended by the bank. Contact your relationship manager.'
          : 'Your banking access has been restored.', user.id);
      return ok({ success: true, user: { id: user.id, status: user.status } });
    }

    case 'RESET_PASSWORD': {
      const id = requireString(body.id, 'Customer id');
      const password = typeof body.password === 'string' && body.password.length >= 10
        ? body.password
        : `Arv-${crypto.randomBytes(6).toString('base64url')}`;
      if (password.length < 10) return fail('Password must be at least 10 characters', 422);
      const user = await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
      await audit(admin.id, admin.email, 'ADMIN_RESET_PASSWORD', user.email);
      await notifyCustomer(user.id, 'PASSWORD_RESET', 'Password reset by bank', 'A bank manager reset your password. Use the credentials provided to you and change it after signing in.', user.id);
      return ok({ success: true, password });
    }

    case 'DELETE': {
      const id = requireString(body.id, 'Customer id');
      const user = await db.user.findFirst({ where: { id, role: 'CUSTOMER' } });
      if (!user) return fail('Customer not found', 404);
      const balances = await db.account.aggregate({ where: { userId: id }, _sum: { balance: true } });
      if ((balances._sum.balance ?? 0) !== 0) {
        return fail('Customer still holds funds. Move or reverse all balances before deleting the relationship.', 422);
      }
      await db.user.delete({ where: { id } });
      await audit(admin.id, admin.email, 'ADMIN_USER_DELETE', user.email);
      return ok({ success: true });
    }

    default:
      return fail('Unknown action', 422);
  }
});
