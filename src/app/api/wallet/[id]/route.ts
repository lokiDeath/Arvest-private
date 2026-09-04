// GET/PATCH/DELETE /api/wallet/[id] — sandbox wallet detail / rename / remove.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/notify';

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const wallet = await db.wallet.findFirst({
    where: { id, userId: user.id },
    include: { transactions: { orderBy: { date: 'desc' }, take: 100 } },
  });
  if (!wallet) return ok({ error: 'Wallet not found' }, { status: 404 });
  return ok({ wallet });
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const wallet = await db.wallet.findFirst({ where: { id, userId: user.id } });
  if (!wallet) return ok({ error: 'Wallet not found' }, { status: 404 });
  const body = await readJson<{ label?: string }>(req);
  const label = (body.label ?? '').trim();
  if (!label) return ok({ error: 'Label is required' }, { status: 422 });
  const updated = await db.wallet.update({ where: { id: wallet.id }, data: { label } });
  return ok({ success: true, wallet: updated });
});

export const DELETE = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireAuth(req);
  const { id } = await ctx.params;
  const wallet = await db.wallet.findFirst({ where: { id, userId: user.id } });
  if (!wallet) return ok({ error: 'Wallet not found' }, { status: 404 });
  await db.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
  await db.wallet.delete({ where: { id: wallet.id } });
  await audit(user.id, user.email, 'WALLET_DELETED', `Sandbox wallet ${wallet.address} removed`);
  return ok({ success: true });
});
