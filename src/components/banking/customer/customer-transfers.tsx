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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatCurrency, maskAccountNumber, formatDate } from '@/lib/store';
import {
  ArrowLeftRight, ArrowRight, CheckCircle2, AlertCircle, Clock, Loader2,
  User, Building2, Shield, Send,
} from 'lucide-react';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
  routingNumber: string; balance: number; available: number;
}

interface Transaction {
  id: string; amount: number; description: string; counterparty: string | null;
  category: string; status: string; date: string;
  fromAccount: { id: string; nickname: string } | null;
  toAccount: { id: string; nickname: string } | null;
}

export function CustomerTransfers({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [transferType, setTransferType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAccount, setRecipientAccount] = useState('');
  const [recipientRouting, setRecipientRouting] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string; status?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [aRes, tRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/transactions?limit=5'),
        ]);
        const aData = await aRes.json();
        const tData = await tRes.json();
        setAccounts(aData.accounts || []);
        setRecent((tData.transactions || []).filter((t: Transaction) =>
          t.category === 'TRANSFER' ||
          (t.category === 'PAYMENT' && t.counterparty && t.counterparty.includes('(Zelle)'))
        ));
        if (aData.accounts?.[0]) {
          setFromAccountId(aData.accounts[0].id);
          if (aData.accounts[1]) setToAccountId(aData.accounts[1].id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fromAccount = accounts.find(a => a.id === fromAccountId);
  const amountNum = parseFloat(amount) || 0;
  const exceedsBalance = fromAccount ? amountNum > fromAccount.available : false;
  const needsReview = transferType === 'EXTERNAL' && amountNum > 2500;

  function reset() {
    setAmount('');
    setMemo('');
    setRecipientName('');
    setRecipientAccount('');
    setRecipientRouting('');
    setConfirmOpen(false);
    setLastResult(null);
  }

  // When user switches between "Between my accounts" and "To someone else",
  // wipe the shared fields so the two modes never bleed into each other.
  function switchTransferType(v: 'INTERNAL' | 'EXTERNAL') {
    setTransferType(v);
    setAmount('');
    setMemo('');
    setLastResult(null);
  }

  async function submit() {
    if (!fromAccountId || amountNum <= 0) {
      toast.error('Select an account and enter a valid amount.');
      return;
    }
    if (exceedsBalance) {
      toast.error('Insufficient funds in source account.');
      return;
    }
    if (transferType === 'INTERNAL' && (!toAccountId || toAccountId === fromAccountId)) {
      toast.error('Choose a different destination account.');
      return;
    }
    if (transferType === 'EXTERNAL' && (!recipientName || !recipientAccount)) {
      toast.error('Recipient name and account number are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          toAccountId: transferType === 'INTERNAL' ? toAccountId : null,
          amount: amountNum,
          memo,
          recipientName: transferType === 'EXTERNAL' ? recipientName : undefined,
          recipientAccount: transferType === 'EXTERNAL' ? recipientAccount : undefined,
          recipientRouting: transferType === 'EXTERNAL' ? recipientRouting : undefined,
          transferType,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'Transfer failed');
        setLastResult({ ok: false, message: data.error || 'Transfer failed' });
        return;
      }
      const message = data.pending
        ? `Transfer ${data.reference} is pending bank approval — funds are on hold.`
        : `Transfer ${data.reference} completed.`;
      toast.success(message);
      setLastResult({ ok: true, message, status: data.status });
      onSuccess();
      // Refresh recent transfers
      const tRes = await fetch('/api/transactions?limit=5');
      const tData = await tRes.json();
      setRecent((tData.transactions || []).filter((t: Transaction) =>
        t.category === 'TRANSFER' ||
        (t.category === 'PAYMENT' && t.counterparty && t.counterparty.includes('(Zelle)'))
      ));
      setTimeout(() => reset(), 3500);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1">Transfers</h1>
        <p className="text-sm text-muted-foreground">Move money between your accounts or to an external recipient.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transfer form */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" /> New Transfer
            </CardTitle>
            <CardDescription className="text-xs">Internal transfers are instant. External transfers may take 1–3 business days.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={transferType} onValueChange={(v) => switchTransferType(v as 'INTERNAL' | 'EXTERNAL')}>
              <TabsList className="grid w-full grid-cols-2 mb-3 h-10">
                <TabsTrigger value="INTERNAL" className="text-xs">
                  <Building2 className="w-3.5 h-3.5 mr-2" /> Between my accounts
                </TabsTrigger>
                <TabsTrigger value="EXTERNAL" className="text-xs">
                  <User className="w-3.5 h-3.5 mr-2" /> To someone else
                </TabsTrigger>
              </TabsList>

              {/* Visible separator so the two modes never visually overlap */}
              <div className="h-px bg-border mb-4" />

              <TabsContent value="INTERNAL" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>From</Label>
                    <Select value={fromAccountId} onValueChange={setFromAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
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
                    <Label>To</Label>
                    <Select value={toAccountId} onValueChange={setToAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.filter(a => a.id !== fromAccountId).map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nickname} · {formatCurrency(a.balance)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-center my-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90 md:rotate-0" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="EXTERNAL" className="space-y-4">
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>External transfers are simulated. No real funds will be moved. Transfers above the bank's auto-approval limit are held for banker review.</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Recipient name</Label>
                    <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Sarah Johnson" />
                  </div>
                  <div className="space-y-2">
                    <Label>Recipient account number</Label>
                    <Input value={recipientAccount} onChange={(e) => setRecipientAccount(e.target.value)} placeholder="10-digit account number" />
                  </div>
                  <div className="space-y-2">
                    <Label>Recipient routing number</Label>
                    <Input value={recipientRouting} onChange={(e) => setRecipientRouting(e.target.value)} placeholder="9-digit routing number" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>From account</Label>
                  <Select value={fromAccountId} onValueChange={setFromAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nickname} · {formatCurrency(a.balance)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>

            {/* Amount & memo — shared */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
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
                {exceedsBalance && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Insufficient available balance
                  </p>
                )}
                {needsReview && !exceedsBalance && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Requires banker approval — funds will be held until reviewed
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Memo (optional)</Label>
                <Textarea
                  rows={1}
                  placeholder="What's this transfer for?"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground">
                {fromAccount && (
                  <>Available: <span className="font-medium text-foreground">{formatCurrency(fromAccount.available)}</span></>
                )}
              </div>
              <Button onClick={submit} disabled={submitting || !amount || amountNum <= 0 || exceedsBalance} className="arvest-gradient text-white">
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
                ) : (
                  <>Transfer {amountNum > 0 && formatCurrency(amountNum)}</>
                )}
              </Button>
            </div>

            {lastResult && (
              <div className={`mt-4 p-4 rounded-lg border flex items-start gap-3 ${lastResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-destructive/10 border-destructive/30'}`}>
                {lastResult.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-destructive shrink-0" />}
                <div className="flex-1">
                  <div className="text-sm font-medium">{lastResult.ok ? 'Transfer submitted' : 'Transfer failed'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{lastResult.message}</div>
                  {lastResult.status && (
                    <Badge variant="outline" className="mt-2 text-[10px]">{lastResult.status}</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar: recent transfers + tips */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" /> Recent transfers
              </CardTitle>
              <CardDescription className="text-xs">Includes internal, external &amp; Zelle</CardDescription>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6">No recent transfers</div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto arvest-scroll">
                  {recent.slice(0, 8).map(t => {
                    const isZelle = t.counterparty && t.counterparty.includes('(Zelle)');
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-xs p-2 rounded-md hover:bg-muted/50">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isZelle ? 'bg-purple-100' : 'bg-primary/10'}`}>
                          {isZelle
                            ? <Send className="w-3 h-3 text-purple-600" />
                            : <ArrowLeftRight className="w-3 h-3 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{t.description}</div>
                          <div className="text-muted-foreground">{formatDate(t.date)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(t.amount)}</div>
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1">{t.status}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Transfer protection</span>
              </div>
              <ul className="text-[11px] text-muted-foreground space-y-1.5">
                <li>· External transfers above $2,500 are held for banker review</li>
                <li>· Held funds remain visible under “held” on your account</li>
                <li>· Declined requests release held funds immediately</li>
                <li>· All transfers protected by 256-bit encryption</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
