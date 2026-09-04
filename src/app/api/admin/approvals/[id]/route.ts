// POST /api/admin/approvals/[id] — decide a queue item.
// 409 ALREADY_DECIDED on double-approval; ledger settle/release and the
// domain-record status update commit atomically with the decision.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireEnum, requireString, clientIp } from '@/lib/api';
import { decideApproval } from '@/lib/banking';
import { db } from '@/lib/db';

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = await readJson<{ decision?: string; note?: string }>(req);
  const decision = requireEnum(body.decision, 'Decision', ['APPROVED', 'REJECTED'] as const);
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;

  // (re)read images for check deposits so the UI can show them alongside
  const approval = await db.approval.findUnique({ where: { id } });
  if (!approval) return ok({ error: 'Approval not found' }, { status: 404 });

  const res = await decideApproval(admin, id, decision, note, { ip: clientIp(req) });
  return ok({ success: true, ...res });
});
