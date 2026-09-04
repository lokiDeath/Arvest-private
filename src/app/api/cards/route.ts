// GET/POST /api/cards — list cards / add external card / (admin) issue card.
// Card numbers are stored AES-256-GCM encrypted; CVV and PIN are never
// stored in recoverable form (PIN is bcrypt-hashed, CVV is shown once
// at issue time and discarded).
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { handler, ok, requireAuth, readJson, requireEnum, requireString, HttpError } from '@/lib/api';
import { db } from '@/lib/db';
import { encryptField, generateCardNumber, detectNetwork, luhnValid } from '@/lib/crypto';
import { audit, notifyCustomer, notifyAdmins } from '@/lib/notify';
import { getOwnedAccount } from '@/lib/banking';

const COLORS = ['CRIMSON', 'GOLD', 'OBSIDIAN', 'PLATINUM', 'SAPPHIRE', 'EMERALD'] as const;

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const cards = await db.card.findMany({
    where: user.role === 'ADMIN' && req.nextUrl.searchParams.get('all') === 'true' ? {} : { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { nickname: true, accountNumber: true } }, user: { select: { name: true, email: true } } },
  });
  const safe = cards.map((c) => ({
    ...c,
    cardNumberEnc: undefined,
    pinHash: undefined,
    cardNumberMasked: `•••• •••• •••• ${c.cardLast4}`,
  }));
  return ok({ cards: safe });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<Record<string, unknown>>(req);

  if (user.role === 'ADMIN' && body.userId) {
    // Admin issues an Arvest card to any customer.
    const targetId = requireString(body.userId, 'Customer');
    const target = await db.user.findUnique({ where: { id: targetId } });
    if (!target) return ok({ error: 'Customer not found' }, { status: 404 });
    const cardType = requireEnum(body.cardType, 'Card type', ['DEBIT', 'CREDIT'] as const);
    const network = requireEnum(body.network, 'Network', ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'] as const);
    const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : null;
    if (accountId) {
      const acct = await db.account.findFirst({ where: { id: accountId, userId: targetId } });
      if (!acct) return ok({ error: 'Account does not belong to this customer' }, { status: 422 });
    }
    const creditLimit = cardType === 'CREDIT' ? Math.max(500, Number(body.creditLimit) || 25000) : 0;
    const color = requireEnum(body.color ?? 'CRIMSON', 'Color', COLORS);
    const number = generateCardNumber(network);
    const cvv = String(Math.floor(Math.random() * 9000) + 1000).slice(0, network === 'AMEX' ? 4 : 3);
    const pin = String(Math.floor(Math.random() * 9000) + 1000).slice(0, 4);
    const card = await db.card.create({
      data: {
        userId: targetId,
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
        creditLimit,
        dailyLimit: Math.max(500, Number(body.dailyLimit) || 5000),
      },
    });
    await audit(user.id, user.email, 'CARD_ISSUED', `${cardType} ${network} ••••${card.cardLast4} for customer ${target.email}`);
    await notifyCustomer(targetId, 'CARD_ISSUED', 'New card issued', `Your ${network} ${cardType.toLowerCase()} card ending ${card.cardLast4} has been issued and is active.`, targetId);
    // One-time secret display: CVV + PIN are never stored in recoverable form.
    return ok({ success: true, card: { id: card.id }, oneTimeSecrets: { cardNumber: number, cvv, pin } });
  }

  // Customer adds an EXTERNAL card (verified via Luhn).
  if (user.status === 'FROZEN') throw new HttpError(403, 'This account is frozen. Contact your relationship manager.');
  const number = (typeof body.cardNumber === 'string' ? body.cardNumber.replace(/\s/g, '') : '');
  if (!/^\d{12,19}$/.test(number)) return ok({ error: 'Enter a valid card number' }, { status: 422 });
  if (!luhnValid(number)) return ok({ error: 'Card number failed validation (Luhn check)' }, { status: 422 });
  const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : null;
  if (accountId) await getOwnedAccount(accountId, user.id);
  const billingAddress = requireString(body.billingAddress, 'Billing address', { max: 200 });
  const card = await db.card.create({
    data: {
      userId: user.id,
      accountId,
      issuedBy: 'EXTERNAL',
      cardType: 'DEBIT',
      network: requireEnum(detectNetwork(number), 'Network', ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'] as const),
      cardholder: (typeof body.cardholder === 'string' && body.cardholder.trim() ? body.cardholder.trim() : user.name).toUpperCase(),
      cardNumberEnc: encryptField(number),
      cardLast4: number.slice(-4),
      expiryMonth: Math.min(12, Math.max(1, Number.parseInt(String(body.expiryMonth ?? '1'), 10) || 1)),
      expiryYear: Math.max(new Date().getFullYear(), Number.parseInt(String(body.expiryYear ?? '2026'), 10) || 2026),
      color: 'OBSIDIAN',
      billingAddress,
      billingCity: typeof body.billingCity === 'string' ? body.billingCity : null,
      billingState: typeof body.billingState === 'string' ? body.billingState : null,
      billingZip: typeof body.billingZip === 'string' ? body.billingZip : null,
      nickname: typeof body.nickname === 'string' ? body.nickname : null,
    },
  });
  await notifyAdmins('CARD_ADDED', 'External card linked', `${user.name} linked an external ${card.network} card ending ${card.cardLast4}.`, user.id);
  await audit(user.id, user.email, 'CARD_ADDED', `External ${card.network} ••••${card.cardLast4}`);
  return ok({ success: true, card: { id: card.id, cardLast4: card.cardLast4 } });
});
