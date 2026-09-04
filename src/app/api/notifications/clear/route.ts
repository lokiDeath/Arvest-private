// POST /api/notifications/clear — delete all notifications for the caller.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const isAdmin = user.role === 'ADMIN';
  const base = isAdmin ? { recipientRole: 'ADMIN' } : { recipientId: user.id };
  await db.notification.deleteMany({ where: base });
  return ok({ success: true });
});
