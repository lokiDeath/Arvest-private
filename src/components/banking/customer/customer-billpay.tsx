'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/store';
import {
  CreditCard, Plus, Zap, Building2, Receipt, Loader2, CheckCircle2,
  Calendar,
} from 'lucide-react';

interface Account {
  id: string; nickname: string; accountNumber: string; balance: number;
}

interface Bill {
  id: string; payee: string; amount: number; memo: string | null;
  payDate: string; status: string; reference: string;
  account: { id: string; nickname: string; accountNumber: string };
}

const popularPayees = [
  { name: 'AT&T Mobility', category: 'Cell Phone', icon: Zap },
  { name: 'American Electric Power', category: 'Utility', icon: Zap },
  { name: 'Cox Communications', category: 'Internet', icon: Zap },
  { name: 'Washington Water Authority', category: 'Utility', icon: Building2 },
  { name: 'State Farm Insurance', category: 'Insurance', icon: Building2 },
  { name: 'Mortgage — Arvest Mortgage', category: 'Mortgage', icon: Building2 },
];

export function CustomerBillPay({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [accountId, setAccountId] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string; reference?: string } | null>(null);

  async function load() {
    try {
      const [aRes, bRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/billpay'),
      ]);
      const aData = await aRes.json();
      const bData = await bRes.json();
      setAccounts(aData.accounts || []);
      setBills(bData.bills || []);
      if (aData.accounts?.[0]) setAccountId(aData.accounts[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    if (!accountId || !payee || !amount || parseFloat(amount) <= 0) {
      toast.error('Account, payee, and amount are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/billpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId, payee, amount: parseFloat(amount), memo, payDate,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'Payment failed');
        return;
      }
      const bill = data.bill as { reference?: string; status?: string } | undefined;
      const msg = bill?.status === 'ON_HOLD'
        ? `Payment ${bill?.reference} scheduled — requires banker review before it posts`
        : bill?.status === 'PAID'
          ? `Payment ${bill?.reference} posted`
          : `Payment ${bill?.reference} scheduled`;
      toast.success(msg);
      setLastResult({ ok: true, message: msg, reference: bill?.reference });
      onSuccess();
      setAmount(''); setPayee(''); setMemo('');
      setPayDate(new Date().toISOString().slice(0, 10));
      load();
      setTimeout(() => setLastResult(null), 4000);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const scheduled = bills.filter(b => b.status === 'SCHEDULED');
  const paid = bills.filter(b => b.status === 'PAID');

  async function cancelBill(id: string) {
    try {
      const res = await fetch('/api/billpay', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'CANCEL' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { toast.error(data.error || 'Cancel failed'); return; }
      toast.success('Payment cancelled');
      load();
    } catch {
      toast.error('Cancel failed');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1">Bill Pay</h1>
        <p className="text-sm text-muted-foreground">Pay any payee — utilities, mortgage, credit cards, individuals. Same-day and scheduled options.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment form */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Payment
            </CardTitle>
            <CardDescription className="text-xs">Payments are deducted from the selected account on the scheduled date.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Payee */}
            <div className="space-y-2">
              <Label>Payee</Label>
              <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Enter payee name (e.g. City Water Dept)" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {popularPayees.map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.name}
                      onClick={() => setPayee(p.name)}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <Icon className="w-3 h-3" /> {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>From account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nickname} · {formatCurrency(a.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment date</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input type="date" className="pl-8" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number" step="0.01" min="0"
                    className="pl-7 h-11 text-lg font-medium"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Memo (optional)</Label>
                <Textarea rows={1} placeholder="Account #, etc." value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
            </div>

            <div className="pt-4 border-t border-border flex justify-end">
              <Button onClick={submit} disabled={submitting || !payee || !amount} className="arvest-gradient text-white">
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
                ) : (
                  <><CreditCard className="w-4 h-4 mr-2" /> Schedule payment</>
                )}
              </Button>
            </div>

            {lastResult && (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{lastResult.message}</div>
                  {lastResult.reference && (
                    <div className="text-xs text-muted-foreground mt-1">Reference: <code className="font-mono">{lastResult.reference}</code></div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground tracking-wider mb-1">SCHEDULED</div>
              <div className="font-serif-display text-3xl">{scheduled.length}</div>
              <div className="text-xs text-muted-foreground">upcoming payment(s)</div>
              {scheduled.length > 0 && (
                <div className="mt-3 text-sm font-medium text-amber-700">
                  Next: {formatCurrency(scheduled[0].amount)} to {scheduled[0].payee} on {formatDate(scheduled[0].payDate)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground tracking-wider mb-1">PAID (LIFETIME)</div>
              <div className="font-serif-display text-3xl">{paid.length}</div>
              <div className="text-xs text-muted-foreground">total payments made</div>
              <div className="mt-3 text-sm font-medium">
                Total paid: {formatCurrency(paid.reduce((s, b) => s + b.amount, 0))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bill history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No payments yet. Schedule one above to get started.</div>
          ) : (
            <div className="space-y-2">
              {bills.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${b.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {b.status === 'PAID' ? <CheckCircle2 className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.payee}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {b.account.nickname} · {formatDate(b.payDate)} {b.memo ? `· ${b.memo}` : ''}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">Ref: {b.reference}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatCurrency(b.amount)}</div>
                    <Badge variant={b.status === 'PAID' ? 'default' : b.status === 'FAILED' || b.status === 'CANCELLED' ? 'destructive' : 'secondary'} className="text-[10px]">{b.status.replace('_', ' ')}</Badge>
                    {(b.status === 'SCHEDULED' || b.status === 'ON_HOLD' || b.status === 'FAILED') && (
                      <button
                        className="block ml-auto mt-1 text-[10px] text-muted-foreground hover:text-destructive underline"
                        onClick={() => cancelBill(b.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
