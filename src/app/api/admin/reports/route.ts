// GET /api/admin/reports?window=&format=json|csv — statements & reports.
// Bank-level report: deposit totals, held funds, volumes by category,
// loan portfolio, 30-day activity, plus a CSV export for the ledger.
import { NextRequest, NextResponse } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format') ?? 'json';
  const window = sp.get('window') ?? '30';
  const days = Math.max(1, Math.min(365, Number.parseInt(window, 10) || 30));
  const since = new Date(Date.now() - days * 86400_000);

  if (format === 'csv') {
    const txs = await db.ledgerTransaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { entries: { include: { account: { include: { user: { select: { name: true } } } } } } },
    });
    const rows = [['reference', 'date', 'type', 'category', 'status', 'description', 'counterparty', 'customer', 'account', 'direction', 'amount', 'balanceAfter']];
    for (const tx of txs) {
      for (const e of tx.entries) {
        rows.push([
          tx.reference,
          (tx.postedAt ?? tx.createdAt).toISOString(),
          tx.type,
          tx.category,
          tx.status,
          tx.description.replace(/"/g, "'"),
          tx.counterparty ?? '',
          e.account.user?.name ?? '',
          `${e.account.nickname} ${e.account.accountNumber.slice(-4)}`,
          e.direction,
          e.amount.toFixed(2),
          e.balanceAfter.toFixed(2),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c)}"`).join(',')).join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="arvest-ledger-${days}d.csv"`,
      },
    });
  }

  const [accounts, ledgerTxs, loans, loanPayments, customers] = await Promise.all([
    db.account.findMany({ where: { status: { not: 'CLOSED' } }, select: { balance: true, available: true, held: true, type: true } }),
    db.ledgerTransaction.findMany({ where: { createdAt: { gte: since } }, include: { entries: true } }),
    db.loan.findMany({ where: { status: { in: ['ACTIVE', 'PENDING'] } }, select: { amount: true, remainingBalance: true, status: true, interestRate: true, loanType: true } }),
    db.loanPayment.findMany({ where: { createdAt: { gte: since } }, select: { amount: true, principal: true, interest: true } }),
    db.user.count({ where: { role: 'CUSTOMER' } }),
  ]);

  let credits = 0;
  let debits = 0;
  const byCategory = new Map<string, { count: number; volume: number }>();
  for (const tx of ledgerTxs) {
    if (tx.status === 'PENDING' || tx.status === 'DECLINED') continue;
    for (const e of tx.entries) {
      if (e.bucketTo === 'available') credits += e.amount;
      if (e.bucketFrom === 'available' && e.bucketTo !== 'held') debits += e.amount;
    }
    const entry = byCategory.get(tx.category) ?? { count: 0, volume: 0 };
    entry.count += 1;
    entry.volume += tx.entries.reduce((s, e) => s + (e.bucketTo === 'available' ? e.amount : 0), 0);
    byCategory.set(tx.category, entry);
  }

  const byType = new Map<string, number>();
  for (const a of accounts) byType.set(a.type, (byType.get(a.type) ?? 0) + a.balance);

  const loanPortfolio = {
    activeCount: loans.filter((l) => l.status === 'ACTIVE').length,
    pendingCount: loans.filter((l) => l.status === 'PENDING').length,
    outstanding: Math.round(loans.filter((l) => l.status === 'ACTIVE').reduce((s, l) => s + l.remainingBalance, 0) * 100) / 100,
    disbursed: Math.round(loans.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    paymentsCollected: Math.round(loanPayments.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    interestCollected: Math.round(loanPayments.reduce((s, p) => s + p.interest, 0) * 100) / 100,
  };

  return ok({
    report: {
      windowDays: days,
      generatedAt: new Date(),
      customers,
      deposits: {
        total: Math.round(accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100,
        available: Math.round(accounts.reduce((s, a) => s + a.available, 0) * 100) / 100,
        held: Math.round(accounts.reduce((s, a) => s + a.held, 0) * 100) / 100,
        byAccountType: [...byType.entries()].map(([type, total]) => ({ type, total: Math.round(total * 100) / 100 })),
      },
      activity: {
        credits: Math.round(credits * 100) / 100,
        debits: Math.round(debits * 100) / 100,
        transactionCount: ledgerTxs.length,
        byCategory: [...byCategory.entries()].map(([category, v]) => ({ category, count: v.count, volume: Math.round(v.volume * 100) / 100 })).sort((a, b) => b.volume - a.volume),
      },
      loanPortfolio,
    },
  });
});
