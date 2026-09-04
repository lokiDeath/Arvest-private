// POST /api/transfer — internal (instant) and external (threshold-gated) transfers.
// GET returns the customer's transfer history (ledger TRANSFER rows).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireEnum, requireString } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { submitTransfer } from '@/lib/banking';
import { db } from '@/lib/db';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });

  return withIdempotency(req, 'transfer', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const transferType = requireEnum(body.transferType, 'Transfer type', ['INTERNAL', 'EXTERNAL'] as const);
    const amount = parseAmount(body.amount);
    const fromAccountId = requireString(body.fromAccountId, 'Source account');
    if (transferType === 'INTERNAL') {
      const toAccountId = requireString(body.toAccountId, 'Destination account');
      const res = await submitTransfer(user, { fromAccountId, toAccountId, transferType, amount, memo: body.memo as string | undefined });
      return ok({ success: true, ...res });
    }
    const recipientName = requireString(body.recipientName, 'Recipient name', { min: 2, max: 80 });
    const res = await submitTransfer(user, { fromAccountId, transferType, amount, recipientName, memo: body.memo as string | undefined });
    return ok({ success: true, ...res });
  });
});

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const accounts = await db.account.findMany({ where: { userId: user.id }, select: { id: true } });
  const accountIds = accounts.map((a) => a.id);
  const txs = await db.ledgerTransaction.findMany({
    where: { type: { in: ['TRANSFER', 'ZELLE'] }, entries: { some: { accountId: { in: accountIds } } } },
    include: { entries: { where: { accountId: { in: accountIds } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const transfers = txs.map((tx) => {
    const entry = tx.entries[0];
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(tx.meta); } catch { meta = {}; }
    return {
      id: tx.id,
      reference: tx.reference,
      date: tx.postedAt ?? tx.createdAt,
      description: tx.description,
      counterparty: tx.counterparty,
      amount: entry?.amount ?? 0,
      direction: entry?.direction ?? 'DEBIT',
      status: tx.status,
      kind: tx.type,
      meta,
    };
  });
  return ok({ transfers });
});
