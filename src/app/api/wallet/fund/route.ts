// POST /api/wallet/fund — SANDBOX demo faucet (clearly labeled in UI).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireString } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { walletFundSandbox } from '@/lib/banking';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });

  return withIdempotency(req, 'wallet-fund', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const amount = parseAmount(body.amount);
    const walletId = requireString(body.walletId, 'Wallet');
    const res = await walletFundSandbox(user, walletId, amount);
    return ok({ success: true, tx: res.tx });
  });
});
