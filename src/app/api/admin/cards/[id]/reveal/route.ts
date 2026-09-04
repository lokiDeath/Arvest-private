// POST /api/admin/cards/[id]/reveal — decrypt a card PAN (audited).
// Every reveal is written to the audit log with the acting manager.
// CVV and PIN are NOT recoverable by design.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, fail } from '@/lib/api';
import { db } from '@/lib/db';
import { decryptField } from '@/lib/crypto';
import { audit } from '@/lib/notify';

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const card = await db.card.findUnique({ where: { id } });
  if (!card) return fail('Card not found', 404);
  if (!card.cardNumberEnc) return fail('Card number is not available', 422);

  const number = decryptField(card.cardNumberEnc);
  await audit(admin.id, admin.email, 'CARD_REVEALED', `Full PAN viewed for card ••••${card.cardLast4} (${card.issuedBy})`);
  return ok({
    cardNumber: number,
    note: 'This view was recorded in the audit log. CVV and PIN are never stored in recoverable form.',
  });
});
