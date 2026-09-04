// POST /api/auth/reset — verify code + set new password.
// Codes are bcrypt-hashed; verification attempts are limited to 5
// per code; the code must be unused and unexpired.
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { handler, ok, fail, readJson, clientIp } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, notifyCustomer, securityEvent } from '@/lib/notify';

export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(req);
  rateLimit({ name: 'reset', limit: RATE_LIMITS.reset.limit, windowMs: RATE_LIMITS.reset.windowMs, key: ip });

  const body = await readJson<{ identifier?: string; email?: string; code?: string; password?: string }>(req);
  const identifier = (body.identifier ?? body.email ?? '').trim();
  const code = (body.code ?? '').trim();
  const password = body.password ?? '';
  if (!identifier || !code || !password) return fail('All fields are required', 422);
  if (password.length < 10) return fail('New password must be at least 10 characters', 422);
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return fail('Password must contain letters and numbers', 422);
  }

  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: 'insensitive' } },
        { loginId: { equals: identifier, mode: 'insensitive' } },
      ],
    },
  });
  if (!user || user.role === 'ADMIN') return fail('Invalid or expired reset code', 400);

  const reset = await db.resetCode.findFirst({
    where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!reset) return fail('Invalid or expired reset code', 400);
  if (reset.attempts >= 5) {
    await db.resetCode.update({ where: { id: reset.id }, data: { used: true } });
    return fail('Too many incorrect attempts. Request a new code.', 429);
  }

  const match = await bcrypt.compare(code, reset.code);
  if (!match) {
    await db.resetCode.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    return fail('Invalid or expired reset code', 400);
  }

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
    db.resetCode.update({ where: { id: reset.id }, data: { used: true } }),
  ]);

  await securityEvent(user.id, 'PASSWORD_CHANGED', ip, req.headers.get('user-agent') ?? undefined, 'Public reset flow');
  await audit(user.id, user.email, 'PASSWORD_RESET', 'Password changed via public reset flow', { ip });
  await notifyCustomer(user.id, 'PASSWORD_RESET', 'Password changed', 'Your Arvest account password was just changed. If this wasn\u2019t you, contact your relationship manager immediately.', user.id);

  return ok({ success: true });
});
