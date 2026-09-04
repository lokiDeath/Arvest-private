// GET /api/admin/approvals?status=&type= — the Operations Queue.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? 'PENDING';
  const type = sp.get('type');

  const approvals = await db.approval.findMany({
    where: {
      ...(status !== 'ALL' ? { status } : {}),
      ...(type && type !== 'ALL' ? { type } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: { user: { select: { id: true, name: true, email: true, loginId: true, status: true } } },
  });

  const counts = await db.approval.groupBy({ by: ['status'], _count: { _all: true } });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return ok({ approvals, counts: countMap });
});
