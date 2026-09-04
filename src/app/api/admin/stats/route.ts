// GET /api/admin/stats — Command Center aggregates.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin } from '@/lib/api';
import { db } from '@/lib/db';
import { processDueBills } from '@/lib/banking';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);

  // Lazy scheduler: settle bills that have come due.
  const billsProcessed = await processDueBills();

  const [
    customers,
    frozen,
    accounts,
    pendingApprovals,
    pendingTxs,
    flaggedTxs,
    loanApps,
    checkDeposits,
    unreadMessages,
    openAppointments,
    wallets,
    ledgerTxs,
  ] = await Promise.all([
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.user.count({ where: { role: 'CUSTOMER', status: 'FROZEN' } }),
    db.account.findMany({ where: { status: { not: 'CLOSED' } }, select: { balance: true, available: true, held: true } }),
    db.approval.count({ where: { status: 'PENDING' } }),
    db.ledgerTransaction.count({ where: { status: 'PENDING' } }),
    db.ledgerTransaction.count({ where: { status: 'FLAGGED' } }),
    db.loan.count({ where: { status: 'PENDING' } }),
    db.checkDeposit.count({ where: { status: 'PENDING' } }),
    db.message.count({ where: { fromBank: false, read: false } }),
    db.appointment.count({ where: { status: 'SCHEDULED' } }),
    db.wallet.findMany({ select: { balance: true } }),
    db.ledgerTransaction.findMany({ where: { status: { in: ['POSTED', 'FLAGGED'] }, postedAt: { not: null } }, orderBy: { createdAt: 'desc' }, take: 400, include: { entries: true } }),
  ]);

  const totalDeposits = accounts.reduce((s, a) => s + a.balance, 0);
  const totalHeld = accounts.reduce((s, a) => s + a.held, 0);
  const totalAvailable = accounts.reduce((s, a) => s + a.available, 0);
  const walletValue = wallets.reduce((s, w) => s + w.balance, 0);

  // 14-day credit/debit activity
  const days: { date: string; credits: number; debits: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), credits: 0, debits: 0 });
  }
  const dayMap = new Map(days.map((d) => [d.date, d]));
  for (const tx of ledgerTxs) {
    if (!tx.postedAt) continue;
    const key = tx.postedAt.toISOString().slice(0, 10);
    const day = dayMap.get(key);
    if (!day) continue;
    for (const e of tx.entries) {
      const inflow = e.bucketTo === 'available';
      const outflow = e.bucketFrom === 'available' || e.bucketFrom === 'held';
      if (inflow) day.credits += e.amount;
      else if (outflow) day.debits += e.amount;
    }
  }

  // category breakdown (last 400 txs)
  const categoryMap = new Map<string, number>();
  for (const tx of ledgerTxs) {
    const total = tx.entries.reduce((s, e) => s + (e.bucketTo === 'available' ? e.amount : 0), 0);
    if (total > 0) categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + total);
  }
  const categories = [...categoryMap.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // top customers by deposits
  const topCustomers = await db.user.findMany({
    where: { role: 'CUSTOMER' },
    select: { id: true, name: true, email: true, loginId: true, status: true, accounts: { select: { balance: true } } },
  });
  const top = topCustomers
    .map((u) => ({ ...u, total: Math.round(u.accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const recentTxs = await db.ledgerTransaction.findMany({
    where: { status: { in: ['POSTED', 'FLAGGED', 'PENDING'] } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { entries: { select: { amount: true, direction: true } }, user: { select: { name: true } } },
  });

  return ok({
    totals: {
      customers,
      frozen,
      accounts: accounts.length,
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      totalAvailable: Math.round(totalAvailable * 100) / 100,
      totalHeld: Math.round(totalHeld * 100) / 100,
      walletValue: Math.round(walletValue * 100) / 100,
      pendingApprovals,
      pendingTxs,
      flaggedTxs,
      loanApps,
      checkDeposits,
      unreadMessages,
      openAppointments,
      billsProcessedToday: billsProcessed,
    },
    activity: days,
    categories,
    topCustomers: top,
    recentTxs: recentTxs.map((tx) => ({
      id: tx.id,
      reference: tx.reference,
      date: tx.createdAt,
      description: tx.description,
      category: tx.category,
      status: tx.status,
      amount: tx.entries.reduce((s, e) => s + (e.direction === 'CREDIT' ? e.amount : -e.amount), 0) || tx.entries[0]?.amount || 0,
      customer: tx.user?.name ?? null,
    })),
  });
});
