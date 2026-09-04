// GET /api/notifications — role-scoped feed (customer: own; admin: ADMIN feed).
// POST marks one/all read. DELETE clears read/all. DELETE ?id= removes one.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const isAdmin = user.role === 'ADMIN';
  const where = isAdmin ? { recipientRole: 'ADMIN' } : { recipientId: user.id };
  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const unread = notifications.filter((n) => !n.read).length;
  return ok({ notifications, unread });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<{ id?: string; all?: boolean }>(req).catch(() => ({}) as { id?: string; all?: boolean });
  const isAdmin = user.role === 'ADMIN';
  const base = isAdmin ? { recipientRole: 'ADMIN' } : { recipientId: user.id };
  if (body.all || !body.id) {
    await db.notification.updateMany({ where: { ...base, read: false }, data: { read: true } });
  } else {
    await db.notification.updateMany({ where: { ...base, id: body.id }, data: { read: true } });
  }
  return ok({ success: true });
});

export const DELETE = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const id = req.nextUrl.searchParams.get('id');
  const clearAll = req.nextUrl.searchParams.get('all') === 'true';
  const isAdmin = user.role === 'ADMIN';
  const base = isAdmin ? { recipientRole: 'ADMIN' } : { recipientId: user.id };
  if (clearAll) {
    await db.notification.deleteMany({ where: base });
  } else if (id) {
    await db.notification.deleteMany({ where: { ...base, id } });
  }
  return ok({ success: true });
});
