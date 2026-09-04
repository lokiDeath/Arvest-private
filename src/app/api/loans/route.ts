// GET/POST /api/loans — loan products for the signed-in customer.
// Applications create a PENDING loan + Operations Queue approval item;
// the bank manager approves (ledger disbursement) or rejects.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen, readJson, parseAmount, requireEnum, requireString } from '@/lib/api';
import { withIdempotency } from '@/lib/idempotency';
import { applyForLoan, calcMonthlyPayment } from '@/lib/banking';
import { db } from '@/lib/db';

const LOAN_TYPES = ['PERSONAL', 'AUTO', 'HOME', 'STUDENT'] as const;

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const loans = await db.loan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { payments: { orderBy: { createdAt: 'desc' }, take: 10 }, account: { select: { nickname: true, accountNumber: true } } },
  });
  return ok({ loans });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  return withIdempotency(req, 'loan-apply', async () => {
    const body = await readJson<Record<string, unknown>>(req);
    const loanType = requireEnum(body.loanType, 'Loan type', LOAN_TYPES);
    const amount = parseAmount(body.amount);
    const term = Number.parseInt(String(body.term ?? '36'), 10);
    if (!Number.isFinite(term) || term < 6 || term > 84) {
      return ok({ error: 'Term must be between 6 and 84 months' }, { status: 422 });
    }
    const res = await applyForLoan(user, {
      loanType,
      amount,
      term,
      purpose: typeof body.purpose === 'string' ? body.purpose.trim() : undefined,
      employer: typeof body.employer === 'string' ? body.employer.trim() : undefined,
      annualIncome: body.annualIncome !== undefined && body.annualIncome !== '' ? parseAmount(body.annualIncome) : undefined,
      accountId: typeof body.accountId === 'string' && body.accountId ? body.accountId : undefined,
    });
    return ok({ success: true, loan: res.loan, approvalId: res.approvalId });
  });
});
