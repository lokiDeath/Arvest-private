// GET /api/admin/customers/[id] — full Customer Control Center bundle.
// Everything the bank manager needs to manage one relationship:
// identity, accounts, ledger activity, transfers, Zelle, bills,
// deposits, cards, loans, wallets, messages, security events.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req);
  const { id } = await ctx.params;

  const customer = await db.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    select: {
      id: true, email: true, loginId: true, name: true, role: true, status: true,
      phone: true, address: true, city: true, state: true, zip: true, avatarUrl: true,
      lastLoginAt: true, createdAt: true,
    },
  });
  if (!customer) return ok({ error: 'Customer not found' }, { status: 404 });

  const accounts = await db.account.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'asc' },
    include: { cards: { select: { id: true, cardLast4: true, cardType: true, network: true, status: true, color: true } } },
  });
  const accountIds = accounts.map((a) => a.id);

  const [
    ledgerTxs,
    zelle,
    bills,
    deposits,
    cards,
    loans,
    wallets,
    messages,
    appointments,
    notifications,
    securityEvents,
    auditLogs,
    alerts,
  ] = await Promise.all([
    db.ledgerTransaction.findMany({
      where: { OR: [{ userId: id }, { entries: { some: { accountId: { in: accountIds } } } }] },
      include: { entries: { where: { accountId: { in: accountIds } } } },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
    db.zelleTransfer.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.billPay.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { account: { select: { nickname: true } } } }),
    db.checkDeposit.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { account: { select: { nickname: true } } } }),
    db.card.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
    db.loan.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, include: { payments: { take: 5, orderBy: { createdAt: 'desc' } } } }),
    db.wallet.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' }, include: { transactions: { take: 5, orderBy: { date: 'desc' } } } }),
    db.message.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' }, take: 100 }),
    db.appointment.findMany({ where: { userId: id }, orderBy: { date: 'desc' }, take: 50 }),
    db.notification.findMany({ where: { recipientId: id }, orderBy: { createdAt: 'desc' }, take: 40 }),
    db.securityEvent.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 25 }),
    db.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 40 }),
    db.alert.findMany({ where: { userId: id }, include: { account: { select: { nickname: true } } } }),
  ]);

  const cardsSafe = cards.map((c) => ({
    id: c.id,
    userId: c.userId,
    accountId: c.accountId,
    issuedBy: c.issuedBy,
    cardType: c.cardType,
    network: c.network,
    cardholder: c.cardholder,
    cardLast4: c.cardLast4,
    cardNumberMasked: `•••• •••• •••• ${c.cardLast4}`,
    expiryMonth: c.expiryMonth,
    expiryYear: c.expiryYear,
    color: c.color,
    status: c.status,
    creditLimit: c.creditLimit,
    creditUsed: c.creditUsed,
    dailyLimit: c.dailyLimit,
    nickname: c.nickname,
    billingAddress: c.issuedBy === 'EXTERNAL' ? c.billingAddress : null,
    billingCity: c.issuedBy === 'EXTERNAL' ? c.billingCity : null,
    billingState: c.issuedBy === 'EXTERNAL' ? c.billingState : null,
    billingZip: c.issuedBy === 'EXTERNAL' ? c.billingZip : null,
    createdAt: c.createdAt,
  }));

  return ok({
    customer,
    accounts,
    transactions: ledgerTxs.map((tx) => ({
      id: tx.id,
      reference: tx.reference,
      date: tx.postedAt ?? tx.createdAt,
      description: tx.description,
      category: tx.category,
      counterparty: tx.counterparty,
      memo: tx.memo,
      status: tx.status,
      type: tx.type,
      direction: tx.entries[0]?.direction ?? 'CREDIT',
      amount: tx.entries[0]?.amount ?? 0,
      accountId: tx.entries[0]?.accountId ?? null,
    })),
    zelle,
    bills,
    deposits,
    cards: cardsSafe,
    loans,
    wallets,
    messages,
    appointments,
    notifications,
    securityEvents,
    auditLogs,
    alerts,
  });
});
