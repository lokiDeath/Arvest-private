// GET/PATCH /api/profile — profile & security for the signed-in user.
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { handler, ok, requireAuth, readJson, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, securityEvent } from '@/lib/notify';
import { clientIp } from '@/lib/api';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const me = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, loginId: true, name: true, role: true, phone: true,
      address: true, city: true, state: true, zip: true, avatarUrl: true, createdAt: true,
      accounts: { select: { accountNumber: true, routingNumber: true, nickname: true } },
    },
  });
  return ok({ user: me });
});

export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<Record<string, unknown>>(req);

  // ---- password change ----
  if (body.action === 'CHANGE_PASSWORD') {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 10) return fail('New password must be at least 10 characters', 422);
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return fail('Password must contain letters and numbers', 422);
    const me = await db.user.findUnique({ where: { id: user.id } });
    if (!me) return fail('User not found', 404);
    const match = await bcrypt.compare(currentPassword, me.passwordHash);
    if (!match) return fail('Current password is incorrect', 422);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    const ip = clientIp(req);
    await securityEvent(user.id, 'PASSWORD_CHANGED', ip, req.headers.get('user-agent') ?? undefined, 'Profile settings');
    await audit(user.id, user.email, 'PASSWORD_CHANGE', 'Password changed in profile settings', { ip });
    return ok({ success: true });
  }

  // ---- profile fields ----
  const data: Record<string, unknown> = {};
  for (const field of ['name', 'phone', 'address', 'city', 'state', 'zip'] as const) {
    if (typeof body[field] === 'string') data[field] = (body[field] as string).trim() || null;
  }
  if (typeof body.loginId === 'string' && body.loginId.trim()) {
    const loginId = body.loginId.trim().toUpperCase();
    if (loginId.length < 4) return fail('Login ID must be at least 4 characters', 422);
    const existing = await db.user.findFirst({ where: { loginId, id: { not: user.id } } });
    if (existing) return fail('That Login ID is already taken', 409);
    data.loginId = loginId;
  }

  const updated = await db.user.update({ where: { id: user.id }, data, select: { id: true, email: true, loginId: true, name: true, role: true, phone: true, address: true, avatarUrl: true } });
  await audit(user.id, user.email, 'PROFILE_UPDATE', `Updated: ${Object.keys(data).join(', ')}`);
  return ok({ success: true, user: updated });
});
