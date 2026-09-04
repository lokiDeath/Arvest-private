// GET  /api/admin/transactions — full ledger with filters.
// POST /api/admin/transactions — FLAG / UNFLAG a posted transaction.
// Posted financial history is never edited or deleted; it can only
// be reversed (see /api/admin/transactions/reverse) or flagged for review.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireString, requireEnum, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { setLedgerFlag } from '@/lib/banking';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const type = sp.get('type');
  const status = sp.get('status');
  const userId = sp.get('userId');
  const limit = Math.min(Number.parseInt(sp.get('limit') ?? '200', 10) || 200, 500);

  const txs = await db.ledgerTransaction.findMany({
    where: {
      ...(type && type !== 'ALL' ? { type } : {}),
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(userId ? { userId } : {}),
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: 'insensitive' as const } },
              { reference: { contains: q, mode: 'insensitive' as const } },
              { counterparty: { contains: q, mode: 'insensitive' as const } },
              { user: { name: { contains: q, mode: 'insensitive' as const } } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      entries: { include: { account: { select: { id: true, nickname: true, accountNumber: true, user: { select: { id: true, name: true } } } } } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return ok({ transactions: txs });
});

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);
  const action = requireEnum(body.action, 'Action', ['FLAG', 'UNFLAG'] as const);
  const ledgerTxId = requireString(body.ledgerTxId, 'Transaction id');
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  await setLedgerFlag(admin, ledgerTxId, action === 'FLAG', reason);
  return ok({ success: true });
});
