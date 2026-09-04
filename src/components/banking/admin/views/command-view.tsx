'use client';

// Command Center — the bank manager's morning dashboard.
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, Landmark, DollarSign, ClipboardCheck, Flag, PiggyBank, Smartphone,
  MessagesSquare, CalendarClock, Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, TrendingUp,
} from 'lucide-react';
import { useAdminData, KpiCard, PageHeader, SectionCard, StatusPill, ActivityChart, LoadingBlock, ErrorState, EmptyState } from '../admin-primitives';
import { formatCurrency, formatDate, useUI } from '@/lib/store';

interface Stats {
  totals: {
    customers: number; frozen: number; accounts: number;
    totalDeposits: number; totalAvailable: number; totalHeld: number; walletValue: number;
    pendingApprovals: number; pendingTxs: number; flaggedTxs: number;
    loanApps: number; checkDeposits: number; unreadMessages: number; openAppointments: number;
    billsProcessedToday: number;
  };
  activity: { date: string; credits: number; debits: number }[];
  categories: { name: string; value: number }[];
  topCustomers: { id: string; name: string; email: string; status: string; total: number }[];
  recentTxs: { id: string; reference: string; date: string; description: string; category: string; status: string; amount: number; customer: string | null }[];
}

export function CommandCenterView() {
  const { data, loading, error, reload } = useAdminData<Stats>('/api/admin/stats');
  const adminNavigate = useUI((s) => s.adminNavigate);

  if (loading) return <LoadingBlock rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'Failed to load'} onRetry={reload} />;

  const t = data.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        subtitle="Everything needing your attention, in one place."
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Customers" value={t.customers} sub={t.frozen ? `${t.frozen} frozen` : 'all active'} icon={Users} onClick={() => adminNavigate('customers')} />
        <KpiCard label="Deposits (AUM)" value={formatCurrency(t.totalDeposits, { cents: false })} sub={`${t.accounts} accounts`} icon={Landmark} onClick={() => adminNavigate('accounts')} />
        <KpiCard label="Held funds" value={formatCurrency(t.totalHeld, { cents: false })} sub="awaiting decisions" icon={Flag} warn={t.totalHeld > 0} onClick={() => adminNavigate('approvals')} />
        <KpiCard label="Ops queue" value={t.pendingApprovals} sub="items to review" icon={ClipboardCheck} warn={t.pendingApprovals > 0} onClick={() => adminNavigate('approvals')} />
        <KpiCard label="Flagged txs" value={t.flaggedTxs} sub="under review" icon={Flag} warn={t.flaggedTxs > 0} onClick={() => adminNavigate('risk')} />
        <KpiCard label="Loan apps" value={t.loanApps} sub="pending decision" icon={PiggyBank} warn={t.loanApps > 0} onClick={() => adminNavigate('loans')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Mobile deposits" value={t.checkDeposits} sub="to review" icon={Smartphone} warn={t.checkDeposits > 0} onClick={() => adminNavigate('deposits')} />
        <KpiCard label="Client messages" value={t.unreadMessages} sub="unread" icon={MessagesSquare} warn={t.unreadMessages > 0} onClick={() => adminNavigate('messages')} />
        <KpiCard label="Appointments" value={t.openAppointments} sub="scheduled" icon={CalendarClock} onClick={() => adminNavigate('appointments')} />
        <KpiCard label="Sandbox wallets" value={formatCurrency(t.walletValue, { cents: false })} sub="simulated value" icon={WalletIcon} onClick={() => adminNavigate('wallets')} />
        <KpiCard label="Available" value={formatCurrency(t.totalAvailable, { cents: false })} sub="spable client funds" icon={DollarSign} />
        <KpiCard label="Bills processed" value={t.billsProcessedToday} sub="this refresh" icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 14-day activity */}
        <SectionCard title="Money movement" sub="Credits & debits across the bank — last 14 days" className="xl:col-span-2">
          <ActivityChart data={data.activity} />
        </SectionCard>

        {/* Category mix */}
        <SectionCard title="Category mix" sub="By posted volume">
          {data.categories.length === 0 ? <EmptyState title="No activity yet" /> : (
            <div className="space-y-2.5">
              {data.categories.map((c) => {
                const max = data.categories[0]?.value || 1;
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{c.name}</span>
                      <span className="font-mono-balance text-muted-foreground">{formatCurrency(c.value, { cents: false })}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full arvest-gradient" style={{ width: `${Math.max(4, (c.value / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Recent transactions */}
        <SectionCard
          title="Latest ledger activity"
          sub="Newest posted transactions"
          action={<Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => adminNavigate('transactions')}>View all</Button>}
        >
          {data.recentTxs.length === 0 ? <EmptyState title="No transactions" /> : (
            <div className="divide-y divide-border -mx-1">
              {data.recentTxs.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2.5 px-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.amount >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                    {tx.amount >= 0 ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{tx.description}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {tx.customer ?? '—'} · {formatDate(tx.date)} · {tx.reference}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[13px] font-medium font-mono-balance ${tx.amount >= 0 ? 'text-emerald-700' : ''}`}>
                      {tx.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(tx.amount))}
                    </div>
                    <StatusPill status={tx.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Top customers */}
        <SectionCard
          title="Top relationships"
          sub="By total deposits"
          action={<Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => adminNavigate('customers')}>All customers</Button>}
        >
          {data.topCustomers.length === 0 ? <EmptyState title="No customers" /> : (
            <div className="divide-y divide-border -mx-1">
              {data.topCustomers.map((c, i) => (
                <button key={c.id} className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-muted/40 text-left" onClick={() => adminNavigate('customer-detail', { id: c.id })}>
                  <span className="text-[11px] font-semibold text-muted-foreground w-4">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold">
                    {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{c.email}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-semibold font-mono-balance">{formatCurrency(c.total)}</div>
                    {c.status !== 'ACTIVE' && <Badge variant="destructive" className="text-[9px]">{c.status}</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
