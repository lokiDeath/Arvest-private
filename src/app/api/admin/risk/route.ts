// GET /api/admin/risk — risk & review cockpit.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';
import { getNumber } from '@/lib/settings';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const since24h = new Date(Date.now() - 24 * 3600_000);
  const flagThreshold = await getNumber('risk.largeTxFlagUsd');

  const [flagged, frozen, failedLogins, largeTxns, pendingQueue] = await Promise.all([
    db.ledgerTransaction.findMany({
      where: { status: 'FLAGGED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, email: true } }, entries: { take: 1 } },
    }),
    db.user.findMany({ where: { role: 'CUSTOMER', status: 'FROZEN' }, select: { id: true, name: true, email: true, loginId: true, lastLoginAt: true } }),
    db.securityEvent.findMany({ where: { type: 'LOGIN_FAILED', createdAt: { gte: since24h } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.ledgerTransaction.findMany({
      where: { status: { in: ['POSTED', 'FLAGGED'] }, entries: { some: { amount: { gte: flagThreshold } } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { user: { select: { name: true } }, entries: { take: 1 } },
    }),
    db.approval.count({ where: { status: 'PENDING' } }),
  ]);

  // velocity: customers with > 20 movements in 24h
  const counts = await db.ledgerTransaction.findMany({
    where: { createdAt: { gte: since24h }, userId: { not: null } },
    select: { userId: true },
  });
  const perUser = new Map<string, number>();
  for (const row of counts) if (row.userId) perUser.set(row.userId, (perUser.get(row.userId) ?? 0) + 1);
  const velocityUsers = [...perUser.entries()].filter(([, n]) => n > 20).slice(0, 20);
  const velocityDetails = velocityUsers.length
    ? await db.user.findMany({ where: { id: { in: velocityUsers.map(([id]) => id) } }, select: { id: true, name: true, email: true } })
    : [];

  const failedByIp = new Map<string, number>();
  for (const e of failedLogins) {
    const key = e.ip ?? 'unknown';
    failedByIp.set(key, (failedByIp.get(key) ?? 0) + 1);
  }

  return ok({
    thresholds: { largeTxFlagUsd: flagThreshold },
    pendingQueue,
    flagged: flagged.map((tx) => ({
      id: tx.id,
      reference: tx.reference,
      date: tx.createdAt,
      description: tx.description,
      category: tx.category,
      amount: tx.entries[0]?.amount ?? 0,
      customer: tx.user?.name ?? null,
    })),
    frozen,
    failedLogins24h: failedLogins.length,
    failedByIp: [...failedByIp.entries()].map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    largeTxns: largeTxns.map((tx) => ({
      id: tx.id,
      reference: tx.reference,
      date: tx.createdAt,
      description: tx.description,
      amount: tx.entries[0]?.amount ?? 0,
      status: tx.status,
      customer: tx.user?.name ?? null,
    })),
    velocity: velocityUsers.map(([id, count]) => ({
      customer: velocityDetails.find((u) => u.id === id),
      count,
    })),
  });
});
