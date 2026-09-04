// GET /api/accounts — the signed-in customer's accounts.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';
import { assertNotFrozen } from '@/lib/api';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  const accounts = await db.account.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { cards: { select: { id: true, cardLast4: true, cardType: true, network: true, status: true } } },
  });
  return ok({ accounts });
});
