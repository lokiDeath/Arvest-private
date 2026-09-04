// GET  /api/admin/cards — every card in the bank (masked).
// POST /api/admin/cards — ISSUE (new Arvest card) / UPDATE (status, limits).
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { handler, ok, requireAdmin, readJson, requireString, requireEnum, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { encryptField, generateCardNumber } from '@/lib/crypto';
import { audit, notifyCustomer } from '@/lib/notify';

const COLORS = ['CRIMSON', 'GOLD', 'OBSIDIAN', 'PLATINUM', 'SAPPHIRE', 'EMERALD'] as const;

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const cards = await db.card.findMany({
    where: q
      ? {
          OR: [
            { cardLast4: { contains: q } },
            { cardholder: { contains: q, mode: 'insensitive' as const } },
            { user: { name: { contains: q, mode: 'insensitive' as const } } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {},
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { user: { select: { id: true, name: true, email: true } }, account: { select: { nickname: true, accountNumber: true } } },
  });
  const safe = cards.map((c) => ({ ...c, cardNumberEnc: undefined, pinHash: undefined }));
  return ok({ cards: safe });
});

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);
  const action = requireString(body.action, 'Action');

  if (action === 'ISSUE') {
    const userId = requireString(body.userId, 'Customer');
    const target = await db.user.findFirst({ where: { id: userId, role: 'CUSTOMER' } });
    if (!target) return fail('Customer not found', 404);
    const cardType = requireEnum(body.cardType, 'Card type', ['DEBIT', 'CREDIT'] as const);
    const network = requireEnum(body.network, 'Network', ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'] as const);
    const color = requireEnum(body.color ?? 'CRIMSON', 'Color', COLORS);
    const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : null;
    if (accountId) {
      const acct = await db.account.findFirst({ where: { id: accountId, userId } });
      if (!acct) return fail('Account does not belong to this customer', 422);
    }
    const number = generateCardNumber(network);
    const cvv = String(Math.floor(Math.random() * 9000) + 1000).slice(0, network === 'AMEX' ? 4 : 3);
    const pin = String(Math.floor(Math.random() * 9000) + 1000).slice(0, 4);
    const card = await db.card.create({
      data: {
        userId,
        accountId,
        issuedBy: 'ARVEST',
        cardType,
        network,
        cardholder: target.name.toUpperCase(),
        cardNumberEnc: encryptField(number),
        cardLast4: number.slice(-4),
        expiryMonth: ((new Date().getMonth() + 1) % 12) + 1,
        expiryYear: new Date().getFullYear() + 4,
        pinHash: await bcrypt.hash(pin, 10),
        color,
        creditLimit: cardType === 'CREDIT' ? Math.max(500, Number(body.creditLimit) || 25000) : 0,
        dailyLimit: Math.max(500, Number(body.dailyLimit) || 5000),
      },
    });
    await audit(admin.id, admin.email, 'CARD_ISSUED', `${cardType} ${network} ••••${card.cardLast4} for ${target.email}`);
    await notifyCustomer(userId, 'CARD_ISSUED', 'New card issued', `Your ${network} ${cardType.toLowerCase()} card ending ${card.cardLast4} has been issued and is active.`, userId);
    return ok({ success: true, card: { id: card.id, cardLast4: card.cardLast4 }, oneTimeSecrets: { cardNumber: number, cvv, pin } });
  }

  if (action === 'UPDATE') {
    const id = requireString(body.id, 'Card id');
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = requireEnum(body.status, 'Status', ['ACTIVE', 'FROZEN', 'LOST', 'CLOSED'] as const);
    if (body.creditLimit !== undefined) data.creditLimit = Math.max(0, Number(body.creditLimit) || 0);
    if (body.dailyLimit !== undefined) data.dailyLimit = Math.max(100, Number(body.dailyLimit) || 1000);
    if (typeof body.color === 'string') data.color = body.color;
    if (typeof body.nickname === 'string') data.nickname = body.nickname.trim() || null;
    const card = await db.card.update({ where: { id }, data });
    await audit(admin.id, admin.email, 'CARD_UPDATE', `••••${card.cardLast4}: ${JSON.stringify(data)}`);
    if (data.status === 'FROZEN') await notifyCustomer(card.userId, 'CARD_UPDATE', 'Card frozen', `Your card ending ${card.cardLast4} was frozen by the bank.`, card.userId);
    if (data.status === 'ACTIVE' && card.status === 'FROZEN') await notifyCustomer(card.userId, 'CARD_UPDATE', 'Card unfrozen', `Your card ending ${card.cardLast4} is active again.`, card.userId);
    return ok({ success: true, card: { ...card, cardNumberEnc: undefined, pinHash: undefined } });
  }

  return fail('Unknown action', 422);
});
