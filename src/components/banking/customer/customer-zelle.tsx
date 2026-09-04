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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatCurrency, maskAccountNumber, formatDate } from '@/lib/store';
import { Send, CheckCircle2, Loader2, History, Mail, Phone, Zap } from 'lucide-react';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
  balance: number; available: number;
}

interface ZelleTransfer {
  id: string; recipientName: string; recipientEmail: string | null;
  recipientPhone: string | null; amount: number; status: string; createdAt: string;
}

export function CustomerZelle({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<ZelleTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [fromAccountId, setFromAccountId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [contactType, setContactType] = useState<'email' | 'phone'>('email');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  async function load() {
    try {
      const [aRes, zRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/zelle'),
      ]);
      const aData = await aRes.json();
      const zData = await zRes.json();
      setAccounts(aData.accounts || []);
      setTransfers(zData.transfers || []);
      if (aData.accounts?.[0]) setFromAccountId(aData.accounts[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const fromAccount = accounts.find(a => a.id === fromAccountId);
  const amountNum = parseFloat(amount) || 0;
  const exceedsBalance = fromAccount ? amountNum > fromAccount.balance : false;

  async function submit() {
    if (!fromAccountId) { toast.error('Select an account'); return; }
    if (!recipientName.trim()) { toast.error('Enter recipient name'); return; }
    if (contactType === 'email' && !recipientEmail.trim()) { toast.error('Enter recipient email'); return; }
    if (contactType === 'phone' && !recipientPhone.trim()) { toast.error('Enter recipient phone'); return; }
    if (amountNum <= 0) { toast.error('Enter a valid amount'); return; }
    if (amountNum > 5000) { toast.error('Zelle daily limit is $5,000'); return; }
    if (exceedsBalance) { toast.error('Insufficient funds'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/zelle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          recipientName: recipientName.trim(),
          recipientEmail: contactType === 'email' ? recipientEmail.trim() : undefined,
          recipientPhone: contactType === 'phone' ? recipientPhone.trim() : undefined,
          amount: amountNum,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { toast.error(data.error || 'Submission failed'); return; }
      toast.success(data.pending
        ? `Zelle ${data.reference} is pending banker review — funds are on hold`
        : `Zelle ${data.reference} sent`);
      setRecipientName(''); setRecipientEmail(''); setRecipientPhone(''); setAmount(''); setMemo('');
      onSuccess();
      load();
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
        <h1 className="font-serif-display text-2xl mb-1 flex items-center gap-2">
          <Zap className="w-6 h-6 text-primary" /> Zelle
        </h1>
        <p className="text-sm text-muted-foreground">Send money to friends and family in minutes. All Zelle transfers require banker approval.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Send with Zelle</CardTitle>
            <CardDescription className="text-xs">Daily limit: $5,000 · Pending approval</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>From account</Label>
              <Select value={fromAccountId} onValueChange={setFromAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nickname} · {maskAccountNumber(a.accountNumber)} ({formatCurrency(a.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Recipient name</Label>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Jane Smith" />
            </div>

            <div className="space-y-2">
              <Label>Contact method</Label>
              <Tabs value={contactType} onValueChange={(v) => setContactType(v as 'email' | 'phone')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email" className="text-xs"><Mail className="w-3 h-3 mr-1" /> Email</TabsTrigger>
                  <TabsTrigger value="phone" className="text-xs"><Phone className="w-3 h-3 mr-1" /> Mobile</TabsTrigger>
                </TabsList>
              </Tabs>
              {contactType === 'email' ? (
                <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="jane@example.com" />
              ) : (
                <Input type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="+1 (555) 123-4567" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                {exceedsBalance && <p className="text-[11px] text-destructive">Exceeds available balance</p>}
              </div>
              <div className="space-y-2">
                <Label>Memo (optional)</Label>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Dinner, rent, gift" />
              </div>
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full arvest-gradient text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send money
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Zelle Activity</CardTitle>
            <CardDescription className="text-xs">Your recent Zelle transfers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto arvest-scroll">
              {transfers.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No Zelle transfers yet
                </div>
              ) : transfers.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-md border border-border">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Send className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.recipientName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.recipientEmail || t.recipientPhone} · {formatDate(t.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-primary">−{formatCurrency(t.amount)}</div>
                    <Badge variant={t.status === 'POSTED' || t.status === 'APPROVED' ? 'default' : 'secondary'} className="text-[10px]">{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
