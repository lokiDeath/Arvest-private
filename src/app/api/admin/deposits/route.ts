// GET /api/admin/deposits — mobile check deposits for review.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const deposits = await db.checkDeposit.findMany({
    where: status && status !== 'ALL' ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
      account: { select: { nickname: true, accountNumber: true } },
    },
  });
  return ok({ deposits });
});
