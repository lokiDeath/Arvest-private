// POST /api/auth/logout — clears the session cookie and records the event.
import { NextRequest } from 'next/server';
import { handler, ok, auth, clientIp } from '@/lib/api';
import { clearSessionCookie } from '@/lib/session';
import { audit, securityEvent } from '@/lib/notify';

export const POST = handler(async (req: NextRequest) => {
  const user = await auth(req);
  if (user) {
    const ip = clientIp(req);
    await securityEvent(user.id, 'LOGOUT', ip, req.headers.get('user-agent') ?? undefined);
    await audit(user.id, user.email, 'LOGOUT', undefined, { ip });
  }
  const res = ok({ success: true });
  return clearSessionCookie(res);
});
