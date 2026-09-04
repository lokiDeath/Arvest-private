// POST /api/open-account — customer opens CHECKING / SAVINGS / PRIVATE_CLIENT.
// Opening deposits above the configured threshold are routed to the
// Operations Queue; below it they post instantly through the ledger.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireEnum } from '@/lib/api';
import { withIdempotency } from '@/lib/idempotency';
import { openCustomerAccount } from '@/lib/banking';

const TYPES = ['CHECKING', 'SAVINGS', 'PRIVATE_CLIENT'] as const;

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  return withIdempotency(req, 'open-account', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const type = requireEnum(body.type, 'Account type', TYPES);
    const initialDeposit = body.initialDeposit === undefined || body.initialDeposit === '' ? 0 : parseAmount(body.initialDeposit);
    const res = await openCustomerAccount(user, {
      type,
      nickname: typeof body.nickname === 'string' ? body.nickname : undefined,
      initialDeposit,
    });
    return ok({
      success: true,
      account: {
        id: res.account.id,
        nickname: res.account.nickname,
        accountNumber: res.account.accountNumber,
        routingNumber: res.account.routingNumber,
        type: res.account.type,
        balance: 0,
        status: res.account.status,
      },
      pending: res.pending,
      ...(res.approvalId ? { approvalId: res.approvalId } : {}),
    });
  });
});
