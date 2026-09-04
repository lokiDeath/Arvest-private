'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/store';
import { Wallet, PiggyBank, Plus, CheckCircle2, Loader2, Building2, Copy } from 'lucide-react';

const ACCOUNT_TYPES = [
  { type: 'CHECKING', label: 'Private Checking', icon: Wallet, desc: 'Everyday spending with no monthly fees' },
  { type: 'SAVINGS', label: 'Premier Savings', icon: PiggyBank, desc: 'Interest-bearing savings account' },
];

export function CustomerOpenAccount({ onSuccess }: { onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ accountNumber: string; routingNumber: string; nickname: string; balance: number } | null>(null);

  const [type, setType] = useState('CHECKING');
  const [nickname, setNickname] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('');

  async function submit() {
    const deposit = parseFloat(initialDeposit) || 0;
    if (deposit < 0 || deposit > 1_000_000) { toast.error('Initial deposit must be between $0 and $1,000,000'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/open-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, nickname: nickname || undefined, initialDeposit: deposit }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to open account'); return; }
      toast.success('Account opened successfully');
      setSuccess({
        accountNumber: data.account.accountNumber,
        routingNumber: data.account.routingNumber,
        nickname: data.account.nickname,
        balance: data.account.balance,
      });
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSuccess(null);
    setNickname('');
    setInitialDeposit('');
    setType('CHECKING');
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-serif-display text-2xl mb-1">Open an Account</h1>
          <p className="text-sm text-muted-foreground">Your new account is ready to use.</p>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="font-serif-display text-2xl mb-1">Welcome aboard!</h2>
            <p className="text-sm text-muted-foreground mb-6">Your {success.nickname} account has been opened.</p>

            <div className="max-w-md mx-auto space-y-3 text-left">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 border border-border">
                <div>
                  <div className="text-[11px] text-muted-foreground tracking-wider">ACCOUNT NUMBER</div>
                  <div className="font-mono text-sm">{success.accountNumber}</div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => { navigator.clipboard.writeText(success.accountNumber); toast.success('Account number copied'); }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 border border-border">
                <div>
                  <div className="text-[11px] text-muted-foreground tracking-wider">ROUTING NUMBER</div>
                  <div className="font-mono text-sm">{success.routingNumber}</div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => { navigator.clipboard.writeText(success.routingNumber); toast.success('Routing number copied'); }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border border-primary/20">
                <div>
                  <div className="text-[11px] text-muted-foreground tracking-wider">OPENING BALANCE</div>
                  <div className="font-serif-display text-lg text-primary">{formatCurrency(success.balance)}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 text-left">
              <Building2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Your private banker will reach out within 1 business day to welcome you and discuss debit card options, online banking setup, and any other questions you may have.</span>
            </div>

            <Button onClick={reset} className="mt-6 arvest-gradient text-white">
              <Plus className="w-4 h-4 mr-2" /> Open another account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1">Open an Account</h1>
        <p className="text-sm text-muted-foreground">Open a new checking or savings account in minutes.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Choose your account</CardTitle>
          <CardDescription className="text-xs">Both accounts are FDIC-insured up to $250,000.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={type} onValueChange={setType} className="space-y-2">
            {ACCOUNT_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <label
                  key={t.type}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    type === t.type ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value={t.type} className="sr-only" />
                  <Icon className={`w-6 h-6 mt-0.5 ${type === t.type ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.desc}</div>
                  </div>
                </label>
              );
            })}
          </RadioGroup>

          <div className="space-y-2">
            <Label>Account nickname (optional)</Label>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={`My ${ACCOUNT_TYPES.find(t => t.type === type)?.label}`} />
          </div>

          <div className="space-y-2">
            <Label>Initial deposit ($)</Label>
            <Input type="number" inputMode="decimal" value={initialDeposit} onChange={(e) => setInitialDeposit(e.target.value)} placeholder="500" />
            <p className="text-[11px] text-muted-foreground">You can also fund the account later via transfer or mobile deposit.</p>
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full arvest-gradient text-white">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Open account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
