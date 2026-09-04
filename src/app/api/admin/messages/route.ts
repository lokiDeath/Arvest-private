// GET/POST /api/admin/messages — bank inbox + reply.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireString } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, notifyCustomer } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const messages = await db.message.findMany({
    orderBy: { createdAt: 'asc' },
    take: 300,
    include: { user: { select: { id: true, name: true, email: true, loginId: true } } },
  });
  return ok({ messages });
});

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);
  const action = typeof body.action === 'string' ? body.action : 'REPLY';

  if (action === 'MARK_READ') {
    const userId = requireString(body.userId, 'Customer');
    await db.message.updateMany({ where: { userId, fromBank: false, read: false }, data: { read: true } });
    return ok({ success: true });
  }

  if (action === 'COMPOSE') {
    const userId = requireString(body.userId, 'Customer');
    const subject = requireString(body.subject, 'Subject', { min: 2, max: 140 });
    const messageBody = requireString(body.body, 'Message', { min: 2, max: 4000 });
    const message = await db.message.create({ data: { userId, subject, body: messageBody, fromBank: true } });
    await notifyCustomer(userId, 'MESSAGE', 'New message from your bank', subject, userId);
    await audit(admin.id, admin.email, 'ADMIN_MESSAGE', `Sent to ${userId}: ${subject}`);
    return ok({ success: true, message });
  }

  // REPLY
  const replyToId = requireString(body.replyToId, 'Message');
  const messageBody = requireString(body.body, 'Message', { min: 2, max: 4000 });
  const original = await db.message.findUnique({ where: { id: replyToId }, include: { user: { select: { id: true, name: true } } } });
  if (!original) return ok({ error: 'Original message not found' }, { status: 404 });
  const message = await db.message.create({
    data: {
      userId: original.userId,
      subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
      body: messageBody,
      fromBank: true,
      replyToId: original.id,
    },
  });
  await db.message.update({ where: { id: original.id }, data: { read: true } });
  await notifyCustomer(original.userId, 'MESSAGE', 'Reply from your bank', original.subject, original.userId);
  await audit(admin.id, admin.email, 'ADMIN_MESSAGE', `Replied to ${original.userId}: ${original.subject}`);
  return ok({ success: true, message });
});
