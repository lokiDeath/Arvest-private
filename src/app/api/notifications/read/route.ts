// POST /api/notifications/read — mark all (or one) notification(s) read.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson } from '@/lib/api';
import { db } from '@/lib/db';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<{ id?: string }>(req).catch(() => ({}) as { id?: string });
  const isAdmin = user.role === 'ADMIN';
  const base = isAdmin ? { recipientRole: 'ADMIN' } : { recipientId: user.id };
  if (body?.id) {
    await db.notification.updateMany({ where: { ...base, id: body.id, read: false }, data: { read: true } });
  } else {
    await db.notification.updateMany({ where: { ...base, read: false }, data: { read: true } });
  }
  return ok({ success: true });
});
