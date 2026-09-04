'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/store';
import {
  Search, Download, ArrowUpRight, ArrowDownLeft, Filter, X, Wallet,
  PiggyBank, Sparkles, RefreshCw,
} from 'lucide-react';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
  routingNumber: string; balance: number; available: number; held: number; currency: string; status: string;
}

interface Transaction {
  id: string; amount: number; description: string; counterparty: string | null;
  category: string; status: string; date: string; memo: string | null;
  accountId: string | null; accountNickname: string | null;
  direction: 'DEBIT' | 'CREDIT'; balanceAfter: number | null; heldOnly?: boolean;
}

export function CustomerAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allTx, setAllTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const [aRes, tRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/transactions?limit=500'),
      ]);
      const aData = await aRes.json();
      const tData = await tRes.json();
      setAccounts(aData.accounts || []);
      setAllTx(tData.transactions || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredTx = useMemo(() => {
    return allTx.filter((t) => {
      if (selectedAccount !== 'ALL' && t.accountId !== selectedAccount) return false;
      if (category !== 'ALL' && t.category !== category) return false;
      if (status !== 'ALL' && t.status !== status) return false;
      if (from && new Date(t.date) < new Date(from)) return false;
      if (to && new Date(t.date) > new Date(to + 'T23:59:59')) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!t.description.toLowerCase().includes(s) &&
            !(t.counterparty || '').toLowerCase().includes(s) &&
            !(t.memo || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [allTx, selectedAccount, category, status, from, to, search]);

  const totalCredits = filteredTx.filter(t => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0);
  const totalDebits = filteredTx.filter(t => t.direction !== 'CREDIT').reduce((s, t) => s + t.amount, 0);

  function exportCSV() {
    const headers = ['Date', 'Description', 'Counterparty', 'Category', 'Status', 'Amount', 'Direction', 'Memo'];
    const rows = filteredTx.map((t) => [
      formatDate(t.date),
      t.description,
      t.counterparty || '',
      t.category,
      t.status,
      t.amount.toFixed(2),
      t.direction,
      t.memo || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arvest-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setSelectedAccount('ALL');
    setSearch('');
    setCategory('ALL');
    setStatus('ALL');
    setFrom('');
    setTo('');
  }

  const accountTypeIcon: Record<string, any> = {
    CHECKING: Wallet, SAVINGS: PiggyBank, PRIVATE_CLIENT: Sparkles,
  };

  return (
    <div className="space-y-6">
      {/* Account cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)
        ) : (
          accounts.map((acct) => {
            const Icon = accountTypeIcon[acct.type] || Wallet;
            const selected = selectedAccount === acct.id;
            return (
              <Card
                key={acct.id}
                className={`cursor-pointer transition-all ${selected ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/40'}`}
                onClick={() => setSelectedAccount(selected ? 'ALL' : acct.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-[9px] uppercase">{acct.type.replace('_', ' ')}</Badge>
                  </div>
                  <div className="text-sm font-medium">{acct.nickname}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mb-2">••••{acct.accountNumber.slice(-4)}</div>
                  <div className="font-mono-balance text-2xl font-semibold">{formatCurrency(acct.balance)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Available {formatCurrency(acct.available)}
                    {acct.held > 0 && <span className="text-amber-700"> · Held {formatCurrency(acct.held)}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" /> Transactions
              <span className="text-xs font-normal text-muted-foreground">({filteredTx.length} shown)</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredTx.length === 0}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <div className="lg:col-span-2">
              <Label className="text-[11px]">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Description, payee, memo…"
                  className="pl-8 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Account</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All accounts</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="DEPOSIT">Deposit</SelectItem>
                  <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                  <SelectItem value="PAYMENT">Payment</SelectItem>
                  <SelectItem value="FEE">Fee</SelectItem>
                  <SelectItem value="INTEREST">Interest</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="POSTED">Posted</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="FLAGGED">Flagged</SelectItem>
                  <SelectItem value="DECLINED">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">From</Label>
              <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">To</Label>
              <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {(search || selectedAccount !== 'ALL' || category !== 'ALL' || status !== 'ALL' || from || to) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mb-3 h-7 text-xs">
              <X className="w-3 h-3 mr-1" /> Clear filters
            </Button>
          )}

          {/* Summary bar */}
          <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-muted/40 text-xs">
            <div>
              <span className="text-muted-foreground">Total credits: </span>
              <span className="font-medium text-emerald-700">+{formatCurrency(totalCredits)}</span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground">Total debits: </span>
              <span className="font-medium text-foreground">−{formatCurrency(totalDebits)}</span>
            </div>
          </div>

          {/* Transactions table */}
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Account</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}><Skeleton className="h-6" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredTx.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      No transactions match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTx.slice(0, 200).map((t) => {
                    const isCredit = t.direction === 'CREDIT';
                    return (
                      <TableRow key={t.id} className="hover:bg-muted/40">
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(t.date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                              {isCredit ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{t.description}</div>
                              {t.counterparty && <div className="text-[11px] text-muted-foreground truncate">{t.counterparty}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs hidden md:table-cell">{t.accountNickname || '—'}</TableCell>
                        <TableCell className="text-xs hidden md:table-cell">
                          <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'POSTED' ? 'default' : t.status === 'PENDING' ? 'secondary' : 'destructive'} className="text-[10px]">
                            {t.status === 'PENDING' ? 'PENDING · HELD' : t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-sm font-medium text-right ${isCredit ? 'text-emerald-700' : 'text-foreground'}`}>
                          {isCredit ? '+' : '−'}{formatCurrency(t.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredTx.length > 200 && (
            <div className="text-center text-xs text-muted-foreground py-3">
              Showing first 200 of {filteredTx.length} transactions. Refine filters to narrow results.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
