// PATCH/DELETE /api/cards/[id] — freeze/unfreeze, edit, or remove a card.
// Customers: may freeze/unfreeze or delete ONLY their own EXTERNAL cards.
// Admins: may change status, limits, color, nickname on any card.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson, requireEnum } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, notifyCustomer } from '@/lib/notify';

const STATUSES = ['ACTIVE', 'FROZEN', 'LOST', 'CLOSED'] as const;

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const card = await db.card.findUnique({ where: { id } });
  if (!card) return ok({ error: 'Card not found' }, { status: 404 });

  const isAdmin = user.role === 'ADMIN';
  if (!isAdmin && card.userId !== user.id) return ok({ error: 'Card not found' }, { status: 404 });

  const body = await readJson<Record<string, unknown>>(req);
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = requireEnum(body.status, 'Status', STATUSES);
    if (!isAdmin && (status === 'LOST' || status === 'CLOSED')) {
      return ok({ error: 'Contact your relationship manager to close or report a lost card' }, { status: 422 });
    }
    data.status = status;
  }
  if (isAdmin) {
    if (body.creditLimit !== undefined) data.creditLimit = Math.max(0, Number(body.creditLimit) || 0);
    if (body.dailyLimit !== undefined) data.dailyLimit = Math.max(100, Number(body.dailyLimit) || 1000);
    if (typeof body.nickname === 'string') data.nickname = body.nickname.trim() || null;
    if (typeof body.color === 'string') data.color = body.color;
  }
  if (!Object.keys(data).length) return ok({ error: 'Nothing to update' }, { status: 422 });

  const updated = await db.card.update({ where: { id: card.id }, data });
  if (isAdmin && card.userId !== user.id) {
    await audit(user.id, user.email, 'CARD_UPDATE', `Card ••••${card.cardLast4} → ${JSON.stringify(data)}`);
    if (data.status === 'FROZEN') await notifyCustomer(card.userId, 'CARD_UPDATE', 'Card frozen', `Your card ending ${card.cardLast4} was frozen by the bank.`, card.userId);
    if (data.status === 'ACTIVE' && card.status === 'FROZEN') await notifyCustomer(card.userId, 'CARD_UPDATE', 'Card unfrozen', `Your card ending ${card.cardLast4} is active again.`, card.userId);
  }
  return ok({ success: true, card: { ...updated, cardNumberEnc: undefined, pinHash: undefined } });
});

export const DELETE = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const card = await db.card.findUnique({ where: { id } });
  if (!card) return ok({ error: 'Card not found' }, { status: 404 });
  if (user.role !== 'ADMIN' && card.userId !== user.id) return ok({ error: 'Card not found' }, { status: 404 });
  if (card.issuedBy === 'ARVEST' && user.role !== 'ADMIN') {
    return ok({ error: 'Bank-issued cards must be closed by your relationship manager' }, { status: 422 });
  }
  await db.card.delete({ where: { id: card.id } });
  await audit(user.id, user.email, 'CARD_DELETED', `Removed card ••••${card.cardLast4} (${card.issuedBy})`);
  return ok({ success: true });
});
