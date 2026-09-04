// GET /api/transactions — unified ledger view for the signed-in customer.
// Query: accountId, search, category, status, from, to, limit.
// Each row is the customer-side view of a ledger transaction:
//   { id, date, description, category, counterparty, memo, status,
//     direction, amount, balanceAfter, accountId, reference }
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen } from '@/lib/api';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get('accountId') || undefined;
  const search = sp.get('search') || undefined;
  const category = sp.get('category') || undefined;
  const status = sp.get('status') || undefined;
  const from = sp.get('from');
  const to = sp.get('to');
  const limit = Math.min(Number.parseInt(sp.get('limit') ?? '200', 10) || 200, 500);

  const accounts = await db.account.findMany({
    where: { userId: user.id, ...(accountId ? { id: accountId } : {}) },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (!accountIds.length) return ok({ transactions: [] });

  const where: Prisma.LedgerTransactionWhereInput = {
    entries: { some: { accountId: { in: accountIds } } },
    ...(status ? { status } : {}),
    ...(category && category !== 'ALL' ? { category } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { description: { contains: search, mode: 'insensitive' as const } },
            { counterparty: { contains: search, mode: 'insensitive' as const } },
            { reference: { contains: search, mode: 'insensitive' as const } },
            { memo: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const txs = await db.ledgerTransaction.findMany({
    where,
    include: { entries: { where: { accountId: { in: accountIds } }, include: { account: { select: { nickname: true, accountNumber: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const transactions = txs.map((tx) => {
    const entry = tx.entries[0];
    return {
      id: tx.id,
      reference: tx.reference,
      date: tx.postedAt ?? tx.createdAt,
      description: tx.description,
      category: tx.category,
      counterparty: tx.counterparty,
      memo: tx.memo,
      status: tx.status,
      type: tx.type,
      accountId: entry?.accountId ?? null,
      accountNickname: entry?.account?.nickname ?? null,
      direction: entry?.direction ?? 'CREDIT',
      amount: entry?.amount ?? 0,
      balanceAfter: entry?.balanceAfter ?? null,
      heldOnly: entry ? entry.bucketFrom === 'available' && entry.bucketTo === 'held' : false,
    };
  });

  return ok({ transactions });
});
