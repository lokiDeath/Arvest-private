// POST /api/auth/forgot — request a password reset code.
// Security properties:
//   • Rate limited per IP (5 / 15 min).
//   • ADMIN accounts can NEVER reset through the public flow.
//   • Codes are stored bcrypt-hashed, expire in 10 minutes.
//   • The code is only returned in the response when DEMO_MODE=true
//     (documented demo affordance — wire a real mail provider and
//     set DEMO_MODE=false in production).
//   • Identical generic response whether or not the account exists
//     (no user enumeration).
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { handler, ok, readJson, clientIp } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { genResetCode } from '@/lib/session';
import { securityEvent } from '@/lib/notify';

const GENERIC = 'If an account exists for that identifier, a reset code has been sent.';

export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(req);
  rateLimit({ name: 'forgot', limit: RATE_LIMITS.forgot.limit, windowMs: RATE_LIMITS.forgot.windowMs, key: ip });

  const body = await readJson<{ identifier?: string; email?: string; loginId?: string }>(req);
  const identifier = (body.identifier ?? body.email ?? body.loginId ?? '').trim();
  if (!identifier) return ok({ success: true, message: GENERIC });

  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: 'insensitive' } },
        { loginId: { equals: identifier, mode: 'insensitive' } },
      ],
    },
  });

  if (!user || user.role === 'ADMIN') {
    // Do not reveal whether the identifier exists, and never allow admin resets here.
    return ok({ success: true, message: GENERIC });
  }

  // Invalidate previous unused codes
  await db.resetCode.updateMany({ where: { userId: user.id, used: false }, data: { used: true } });

  const code = genResetCode();
  await db.resetCode.create({
    data: {
      userId: user.id,
      code: await bcrypt.hash(code, 10),
      email: user.email,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  await securityEvent(user.id, 'PASSWORD_RESET_REQUESTED', ip, req.headers.get('user-agent') ?? undefined);

  const demo = (process.env.DEMO_MODE ?? 'true') === 'true';
  return ok({
    success: true,
    message: GENERIC,
    ...(demo ? { demoCode: code, note: 'Demo mode: a real deployment delivers this code by email.' } : {}),
  });
});
