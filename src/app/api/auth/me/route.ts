// GET /api/auth/me — session introspection for the client shell.
import { NextRequest } from 'next/server';
import { handler, ok, auth } from '@/lib/api';

export const GET = handler(async (req: NextRequest) => {
  const user = await auth(req);
  if (!user) return ok({ user: null });
  return ok({ user });
});
