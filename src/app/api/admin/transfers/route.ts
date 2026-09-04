// GET /api/admin/transfers — all internal & external transfers (ledger TRANSFER rows).
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const limit = Math.min(Number.parseInt(sp.get('limit') ?? '200', 10) || 200, 500);

  const txs = await db.ledgerTransaction.findMany({
    where: {
      type: { in: ['TRANSFER', 'HOLD', 'RELEASE'] },
      ...(status && status !== 'ALL' ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true } },
      entries: { include: { account: { select: { nickname: true, accountNumber: true } } } },
    },
  });

  const approvals = txs.length
    ? await db.approval.findMany({
        where: { type: 'EXTERNAL_TRANSFER', status: 'PENDING' },
        select: { id: true, payload: true },
      })
    : [];
  const approvalByLedger = new Map<string, string>();
  for (const a of approvals) {
    try {
      const p = JSON.parse(a.payload) as { ledgerTxId?: string };
      if (p.ledgerTxId) approvalByLedger.set(p.ledgerTxId, a.id);
    } catch { /* ignore */ }
  }

  const transfers = txs.map((tx) => ({
    id: tx.id,
    reference: tx.reference,
    date: tx.postedAt ?? tx.createdAt,
    description: tx.description,
    counterparty: tx.counterparty,
    memo: tx.memo,
    status: tx.status,
    kind: tx.type,
    meta: (() => { try { return JSON.parse(tx.meta); } catch { return {}; } })(),
    amount: tx.entries[0]?.amount ?? 0,
    account: tx.entries[0]?.account ? `${tx.entries[0].account.nickname} ••${tx.entries[0].account.accountNumber.slice(-4)}` : null,
    customer: tx.user ? { id: tx.user.id, name: tx.user.name, email: tx.user.email } : null,
    approvalId: approvalByLedger.get(tx.id) ?? null,
  }));

  return ok({ transfers });
});
