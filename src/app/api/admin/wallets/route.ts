// GET /api/admin/wallets — sandbox wallet oversight.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const wallets = await db.wallet.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 300,
    include: {
      user: { select: { id: true, name: true, email: true, status: true } },
      transactions: { orderBy: { date: 'desc' }, take: 5 },
    },
  });
  return ok({ wallets });
});
