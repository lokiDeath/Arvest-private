// GET/POST /api/messages — secure messages between customer and bank.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson, requireString } from '@/lib/api';
import { db } from '@/lib/db';
import { notifyAdmins } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const messages = await db.message.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  // mark incoming bank messages read when opened
  await db.message.updateMany({ where: { userId: user.id, fromBank: true, read: false }, data: { read: true } });
  return ok({ messages });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<Record<string, unknown>>(req);
  const subject = requireString(body.subject, 'Subject', { min: 2, max: 140 });
  const messageBody = requireString(body.body, 'Message', { min: 2, max: 4000 });
  const message = await db.message.create({
    data: { userId: user.id, subject, body: messageBody, fromBank: false },
  });
  await notifyAdmins('MESSAGE', 'New client message', `${user.name}: ${subject}`, user.id);
  return ok({ success: true, message });
});
