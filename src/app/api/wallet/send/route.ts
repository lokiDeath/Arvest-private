// POST /api/wallet/send — sandbox wallet send.
// At/below the auto-approval threshold: instant (balance debited).
// Above it: a PENDING wallet transaction + Operations Queue item.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireString } from '@/lib/api';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { walletSend } from '@/lib/banking';

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  rateLimit({ name: 'money', ...RATE_LIMITS.money, key: user.id });

  return withIdempotency(req, 'wallet-send', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const amount = parseAmount(body.amount);
    const walletId = requireString(body.walletId, 'Wallet');
    const counterparty = requireString(body.counterparty ?? body.toAddress, 'Destination address', { min: 4, max: 120 });
    const res = await walletSend(user, { walletId, amount, counterparty, memo: typeof body.memo === 'string' ? body.memo.trim() : undefined });
    return ok({ success: true, ...res });
  });
});
