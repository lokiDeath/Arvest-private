// GET /api/admin/loans — loan pipeline with approvals and payment history.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const loans = await db.loan.findMany({
    where: status && status !== 'ALL' ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
      account: { select: { nickname: true, accountNumber: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  return ok({ loans });
});
