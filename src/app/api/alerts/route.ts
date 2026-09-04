// GET/POST/PATCH/DELETE /api/alerts — alert rule management + triggered events.
// Rules are evaluated server-side by the alerts engine on every ledger
// movement; fired alerts appear as notifications (type ALERT_TRIGGERED).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson, requireEnum, parseAmount, requireString } from '@/lib/api';
import { db } from '@/lib/db';

const TYPES = ['BALANCE_BELOW', 'BALANCE_ABOVE', 'LARGE_TRANSACTION'] as const;

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const alerts = await db.alert.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { nickname: true, accountNumber: true } } },
  });
  const events = await db.notification.findMany({
    where: { recipientId: user.id, type: 'ALERT_TRIGGERED' },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return ok({ alerts, events });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<Record<string, unknown>>(req);
  const type = requireEnum(body.type, 'Alert type', TYPES);
  const threshold = parseAmount(body.threshold);
  const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : null;
  if (type === 'LARGE_TRANSACTION' && accountId) {
    await db.account.findFirstOrThrow({ where: { id: accountId, userId: user.id } });
  }
  const alert = await db.alert.create({
    data: { userId: user.id, type, threshold, accountId },
  });
  return ok({ success: true, alert });
});

export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<{ id?: string; enabled?: boolean; threshold?: number }>(req);
  const id = requireString(body.id, 'Alert id');
  const alert = await db.alert.findFirst({ where: { id, userId: user.id } });
  if (!alert) return ok({ error: 'Alert not found' }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') {
    data.enabled = body.enabled;
    if (body.enabled) data.lastState = false; // re-arm
  }
  if (body.threshold !== undefined) data.threshold = parseAmount(body.threshold);
  const updated = await db.alert.update({ where: { id: alert.id }, data });
  return ok({ success: true, alert: updated });
});

export const DELETE = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const id = requireString(req.nextUrl.searchParams.get('id'), 'Alert id');
  const alert = await db.alert.findFirst({ where: { id, userId: user.id } });
  if (!alert) return ok({ error: 'Alert not found' }, { status: 404 });
  await db.alert.delete({ where: { id: alert.id } });
  return ok({ success: true });
});
