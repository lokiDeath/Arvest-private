// GET/POST /api/wallet — sandbox digital wallets.
// IMPORTANT: these wallets are an explicitly labeled SANDBOX feature.
// They are not blockchain wallets: addresses are internal sandbox
// handles, no private keys exist or are ever shown, and `sandboxRef`
// replaces fake transaction hashes. Balances live outside the bank
// ledger and are funded only through the labeled demo faucet.
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { handler, ok, requireAuth, assertNotFrozen, readJson, requireEnum, requireString } from '@/lib/api';
import { db } from '@/lib/db';
import { notifyAdmins } from '@/lib/notify';

const TYPES = ['BTC', 'ETH', 'USDC', 'USD'] as const;

function sandboxAddress(type: string): string {
  const rand = crypto.randomBytes(10).toString('hex').toUpperCase();
  const map: Record<string, string> = { BTC: 'SBX-BTC', ETH: 'SBX-ETH', USDC: 'SBX-USDC', USD: 'SBX-USD' };
  return `${map[type] ?? 'SBX'}-${rand}`;
}

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const wallets = await db.wallet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { transactions: { orderBy: { date: 'desc' }, take: 10 } },
  });
  return ok({ wallets });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  const body = await readJson<Record<string, unknown>>(req);

  if (body.action === 'IMPORT') {
    // Import is a sandbox demo affordance: it registers a watch-only handle.
    const address = requireString(body.address, 'Address', { min: 6, max: 120 });
    const count = await db.wallet.count({ where: { userId: user.id } });
    if (count >= 8) return ok({ error: 'Sandbox limit: 8 wallets per customer' }, { status: 422 });
    const wallet = await db.wallet.create({
      data: {
        userId: user.id,
        walletType: requireEnum(body.walletType, 'Wallet type', TYPES),
        address,
        label: typeof body.label === 'string' ? body.label : 'Imported (watch-only)',
        balance: 0,
      },
    });
    await notifyAdmins('WALLET', 'Sandbox wallet imported', `${user.name} imported a watch-only sandbox wallet.`, user.id);
    return ok({ success: true, wallet });
  }

  const walletType = requireEnum(body.walletType, 'Wallet type', TYPES);
  const count = await db.wallet.count({ where: { userId: user.id } });
  if (count >= 8) return ok({ error: 'Sandbox limit: 8 wallets per customer' }, { status: 422 });
  const wallet = await db.wallet.create({
    data: {
      userId: user.id,
      walletType,
      address: sandboxAddress(walletType),
      label: typeof body.label === 'string' && body.label.trim() ? body.label.trim() : `${walletType} Sandbox Wallet`,
    },
  });
  return ok({
    success: true,
    wallet,
    note: 'Sandbox wallet — simulated balances for product demonstration. No cryptographic keys are generated.',
  });
});
