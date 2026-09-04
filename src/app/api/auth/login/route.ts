// POST /api/auth/login
// Authenticates customers AND the bank manager (ADMIN). The initial
// admin account is bootstrapped exactly once from ADMIN_EMAIL /
// ADMIN_INITIAL_PASSWORD environment variables — there are no
// credentials hard-coded in source. Seed also provisions the admin.
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { handler, ok, fail, readJson, clientIp } from '@/lib/api';
import { createToken, setSessionCookie } from '@/lib/session';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, securityEvent, notifyAdmins, notifyCustomer } from '@/lib/notify';

const GENERIC_INVALID = 'Invalid credentials. Please check your Login ID and password.';

async function ensureAdminBootstrapped(): Promise<void> {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!email || !password) {
    console.error('[auth] No admin exists. Run `npm run db:seed` or set ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD.');
    return;
  }
  await db.user.create({
    data: {
      email,
      loginId: null,
      name: 'Bank Administrator',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('[auth] Admin account provisioned from environment. Rotate the password after first login.');
}

export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(req);
  const userAgent = req.headers.get('user-agent') ?? undefined;
  const body = await readJson<{ identifier?: string; loginId?: string; email?: string; password?: string }>(req);
  const identifier = (body.identifier ?? body.loginId ?? body.email ?? '').trim();
  const password = body.password ?? '';
  if (!identifier || !password) return fail('Login ID / email and password are required', 422);

  rateLimit({ name: 'login', limit: RATE_LIMITS.login.limit, windowMs: RATE_LIMITS.login.windowMs, key: `${ip}:${identifier.toLowerCase()}` });

  await ensureAdminBootstrapped();

  const user = await db.user.findFirst({
    where: {
      OR: [
        { loginId: { equals: identifier, mode: 'insensitive' } },
        { email: { equals: identifier, mode: 'insensitive' } },
      ],
    },
  });

  if (!user) {
    await securityEvent(null, 'LOGIN_FAILED', ip, userAgent, `Unknown identifier: ${identifier.slice(0, 64)}`);
    return fail(GENERIC_INVALID, 401);
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await securityEvent(user.id, 'LOGIN_FAILED', ip, userAgent);
    return fail(GENERIC_INVALID, 401);
  }

  if (user.status === 'FROZEN') {
    await securityEvent(user.id, 'FROZEN_LOGIN', ip, userAgent);
    return fail('This account is frozen. Please contact your relationship manager.', 403, 'FROZEN');
  }

  const { token } = createToken({
    userId: user.id,
    email: user.email,
    role: user.role as 'CUSTOMER' | 'ADMIN',
    name: user.name,
  });

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await securityEvent(user.id, 'LOGIN', ip, userAgent);
  await audit(user.id, user.email, 'LOGIN', user.role === 'ADMIN' ? 'Bank manager signed in' : 'Customer signed in', { ip, userAgent });

  if (user.role === 'CUSTOMER') {
    await notifyAdmins('LOGIN', 'Customer sign-in', `${user.name} (${user.loginId ?? user.email}) signed in.`, user.id);
    await notifyCustomer(user.id, 'LOGIN', 'New sign-in', `A new sign-in to your Arvest account was detected from ${ip === 'unknown' ? 'an unrecognized device' : `IP ${ip}`}.`, user.id);
  }

  const res = ok({
    token,
    user: {
      id: user.id,
      email: user.email,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    redirectTo: user.role === 'ADMIN' ? 'admin' : 'client',
  });
  return setSessionCookie(res, token);
});
