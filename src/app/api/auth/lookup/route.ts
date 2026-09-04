// POST /api/auth/lookup — step 1 of the two-step sign-in.
// Resolves a Login ID to a display identity (name/initials/avatar).
// Admin identification is driven by the ADMIN role in the database —
// no credentials or admin IDs are hard-coded here. Unknown IDs get a
// neutral placeholder so the endpoint cannot enumerate real users.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handler, ok, readJson } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { clientIp } from '@/lib/api';

export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(req);
  rateLimit({ name: 'lookup', limit: RATE_LIMITS.lookup.limit, windowMs: RATE_LIMITS.lookup.windowMs, key: ip });

  const body = await readJson<{ identifier?: string; loginId?: string }>(req);
  const identifier = (body.identifier ?? body.loginId ?? '').trim();
  if (!identifier) return ok({ found: false, isAdmin: false, name: 'Private Client', avatarUrl: null });

  const user = await db.user.findFirst({
    where: {
      OR: [
        { loginId: { equals: identifier, mode: 'insensitive' } },
        { email: { equals: identifier, mode: 'insensitive' } },
      ],
    },
    select: { name: true, role: true, status: true, avatarUrl: true },
  });

  if (!user) {
    return ok({ found: false, isAdmin: false, name: 'Private Client', avatarUrl: null });
  }
  return ok({ found: true, isAdmin: user.role === 'ADMIN', name: user.name, avatarUrl: user.avatarUrl });
});
