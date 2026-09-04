'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, maskAccountNumber, formatDate } from '@/lib/store';
import {
  ArrowUpRight, ArrowDownLeft, Plus, ArrowLeftRight, CreditCard,
  TrendingUp, PiggyBank, Wallet, Eye, EyeOff, ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { CustomerView } from './customer-dashboard';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

interface Account {
  id: string;
  type: string;
  nickname: string;
  accountNumber: string;
  routingNumber: string;
  balance: number;
  available: number;
  currency: string;
  status: string;
}

interface Transaction {
  id: string;
  amount: number;
  description: string;
  counterparty: string | null;
  category: string;
  status: string;
  date: string;
  direction: 'DEBIT' | 'CREDIT';
  balanceAfter: number | null;
  heldOnly?: boolean;
}

export function CustomerHome({ onNavigate }: { onNavigate: (v: CustomerView) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideBalances, setHideBalances] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [aRes, tRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/transactions?limit=6'),
        ]);
        const aData = await aRes.json();
        const tData = await tRes.json();
        setAccounts(aData.accounts || []);
        setTransactions(tData.transactions || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  // Build 7-day trend (last 7 transactions by date)
  const trendData = transactions.slice(0, 7).reverse().map((t) => ({
    day: formatDate(t.date, { month: 'short', day: 'numeric' }),
    amount: t.direction === 'CREDIT' ? t.amount : -t.amount,
  }));

  const accountTypeIcon: Record<string, any> = {
    CHECKING: Wallet,
    SAVINGS: PiggyBank,
    PRIVATE_CLIENT: Sparkles,
  };

  return (
    <div className="space-y-6">
      {/* Hero welcome card */}
      <Card className="overflow-hidden border-0 arvest-gradient text-white">
        <CardContent className="p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-white/70 mb-2">
                <Sparkles className="w-3 h-3" /> TOTAL PRIVATE WEALTH
              </div>
              <div className="flex items-center gap-3 mb-1">
                <div className="font-mono-balance text-4xl lg:text-5xl font-semibold">
                  {hideBalances ? '••••••••' : formatCurrency(totalBalance)}
                </div>
                <button onClick={() => setHideBalances(!hideBalances)} className="text-white/60 hover:text-white">
                  {hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-sm text-white/70">Across {accounts.length} account{accounts.length === 1 ? '' : 's'} · Last updated {formatDate(new Date())}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => onNavigate('transfers')} className="bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm">
                <ArrowLeftRight className="w-4 h-4 mr-2" /> Transfer
              </Button>
              <Button onClick={() => onNavigate('payments')} className="bg-white text-primary hover:bg-white/90">
                <Plus className="w-4 h-4 mr-2" /> Pay Bill
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick action tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: ArrowLeftRight, label: 'Transfer', sub: 'Between accounts or to others', view: 'transfers' as CustomerView },
          { icon: CreditCard, label: 'Pay Bill', sub: 'Schedule payments', view: 'payments' as CustomerView },
          { icon: Wallet, label: 'Activity', sub: 'View transactions', view: 'accounts' as CustomerView },
          { icon: TrendingUp, label: 'Statements', sub: 'Download PDFs', view: 'statements' as CustomerView },
        ].map((q, i) => (
          <button key={i} onClick={() => onNavigate(q.view)} className="text-left p-4 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all group">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15">
              <q.icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="text-sm font-medium text-foreground">{q.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{q.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts list */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Your Accounts</CardTitle>
              <CardDescription className="text-xs">Private banking portfolio</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onNavigate('accounts')}>
              View all <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)
            ) : (
              accounts.map((acct) => {
                const Icon = accountTypeIcon[acct.type] || Wallet;
                return (
                  <div key={acct.id} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/40 transition-all cursor-pointer" onClick={() => onNavigate('accounts')}>
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{acct.nickname}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{acct.type.replace('_', ' ')}</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">••••{acct.accountNumber.slice(-4)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-balance text-lg font-semibold">{hideBalances ? '••••' : formatCurrency(acct.balance)}</div>
                      <div className="text-[10px] text-muted-foreground">Available: {hideBalances ? '••••' : formatCurrency(acct.available)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* 7-day activity chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription className="text-xs">Last 7 transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7a1d1d" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#7a1d1d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d8" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#7a7066' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#7a7066' }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `$${Math.abs(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e6e0d8', fontSize: '12px' }}
                    formatter={(v: any) => [formatCurrency(Number(v)), 'Amount']}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#7a1d1d" strokeWidth={2} fill="url(#colorAmt)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <CardDescription className="text-xs">Your latest account activity</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => onNavigate('accounts')}>
            View all <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No recent transactions</div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((t) => {
                const isCredit = t.direction === 'CREDIT';
                return (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                      {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.description}</div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(t.date)} · {t.category.toLowerCase()}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${isCredit ? 'text-emerald-700' : 'text-foreground'}`}>
                        {isCredit ? '+' : '−'}{formatCurrency(t.amount)}
                      </div>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{t.status === 'PENDING' ? 'PENDING · FUNDS HELD' : t.status}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
