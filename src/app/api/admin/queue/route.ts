// GET /api/admin/queue — Operations Queue badge counts.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const [approvals, flagged, frozen, unreadMessages] = await Promise.all([
    db.approval.count({ where: { status: 'PENDING' } }),
    db.ledgerTransaction.count({ where: { status: 'FLAGGED' } }),
    db.user.count({ where: { role: 'CUSTOMER', status: 'FROZEN' } }),
    db.message.count({ where: { fromBank: false, read: false } }),
  ]);
  return ok({ approvals, flagged, frozen, unreadMessages });
});
