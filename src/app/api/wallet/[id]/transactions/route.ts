// GET /api/wallet/[id]/transactions — sandbox wallet transaction history.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const wallet = await db.wallet.findFirst({
    where: { id, userId: user.id },
    include: { transactions: { orderBy: { date: 'desc' }, take: 100 } },
  });
  if (!wallet) return ok({ error: 'Wallet not found' }, { status: 404 });
  const { transactions, ...walletMeta } = wallet;
  return ok({ wallet: walletMeta, transactions });
});
