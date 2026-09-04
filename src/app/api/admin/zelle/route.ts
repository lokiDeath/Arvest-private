// GET /api/admin/zelle — all Zelle transfers with ledger linkage.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const items = await db.zelleTransfer.findMany({
    where: status && status !== 'ALL' ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
      account: { select: { nickname: true, accountNumber: true } },
    },
  });
  return ok({ zelleTransfers: items });
});
