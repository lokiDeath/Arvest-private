// DELETE /api/notifications/[id] — delete a single notification (owner or admin).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';

export const DELETE = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const isAdmin = user.role === 'ADMIN';
  const base = isAdmin ? { recipientRole: 'ADMIN' } : { recipientId: user.id };
  await db.notification.deleteMany({ where: { ...base, id } });
  return ok({ success: true });
});
