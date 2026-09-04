// GET /api/statements?accountId=&from=&to= — statement data for the
// signed-in customer. Opening/closing balances are derived from the
// ledger so the statement always reconciles with posted history.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, assertNotFrozen } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  assertNotFrozen(user);
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get('accountId');
  const from = sp.get('from');
  const to = sp.get('to');

  const account = await db.account.findFirst({
    where: { id: accountId ?? '', userId: user.id },
  });
  if (!account) return ok({ error: 'Account not found' }, { status: 404 });

  const fromDate = from ? new Date(`${from}T00:00:00.000`) : new Date(Date.now() - 30 * 86400_000);
  const toDate = to ? new Date(`${to}T23:59:59.999`) : new Date();

  // All posted entries for the account, ascending
  const entries = await db.ledgerEntry.findMany({
    where: {
      accountId: account.id,
      ledgerTx: { status: { in: ['POSTED', 'FLAGGED'] }, postedAt: { not: null } },
    },
    include: { ledgerTx: true },
    orderBy: { createdAt: 'asc' },
  });

  const inRange = entries.filter((e) => {
    const d = e.ledgerTx.postedAt ?? e.createdAt;
    return d >= fromDate && d <= toDate;
  });

  const startingBalance = inRange.length ? inRange[0].balanceBefore : account.balance;
  const endingBalance = inRange.length ? inRange[inRange.length - 1].balanceAfter : account.balance;

  let totalCredits = 0;
  let totalDebits = 0;
  const transactions = inRange.map((e) => {
    if (e.direction === 'CREDIT') totalCredits += e.amount;
    else totalDebits += e.amount;
    return {
      id: e.id,
      date: (e.ledgerTx.postedAt ?? e.createdAt).toISOString(),
      description: e.ledgerTx.description,
      counterparty: e.ledgerTx.counterparty,
      memo: e.ledgerTx.memo,
      category: e.ledgerTx.category,
      status: e.ledgerTx.status,
      amount: e.amount,
      direction: e.direction as 'CREDIT' | 'DEBIT',
    };
  });

  return ok({
    account: {
      id: account.id,
      nickname: account.nickname,
      accountNumber: account.accountNumber,
      routingNumber: account.routingNumber,
      type: account.type,
      currency: account.currency,
    },
    customer: {
      id: user.id,
      name: user.name,
      email: user.email,
      address: user.address,
    },
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    startingBalance,
    endingBalance,
    totalCredits: Math.round(totalCredits * 100) / 100,
    totalDebits: Math.round(totalDebits * 100) / 100,
    transactions,
    generatedAt: new Date().toISOString(),
  });
});
