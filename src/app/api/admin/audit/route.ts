// GET /api/admin/audit?action=&q= — audit log with filters.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');
  const q = sp.get('q')?.trim();
  const limit = Math.min(Number.parseInt(sp.get('limit') ?? '300', 10) || 300, 1000);

  const where: Prisma.AuditLogWhereInput = {
    ...(action && action !== 'ALL' ? { action } : {}),
    ...(q
      ? {
          OR: [
            { actor: { contains: q, mode: 'insensitive' as const } },
            { action: { contains: q, mode: 'insensitive' as const } },
            { detail: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [logs, actions] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true } } },
    }),
    db.auditLog.groupBy({ by: ['action'], _count: { _all: true } }),
  ]);

  return ok({
    logs,
    actions: actions.map((a) => ({ action: a.action, count: a._count._all })).sort((a, b) => b.count - a.count),
  });
});
