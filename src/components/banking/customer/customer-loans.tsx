'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/store';
import { apiSend } from '@/lib/safe-fetch';
import { Car, User, Home, GraduationCap, CheckCircle2, Loader2, PiggyBank, Clock, Banknote } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface Loan {
  id: string; loanType: string; amount: number; term: number;
  interestRate: number; monthlyPayment: number; remainingBalance: number;
  status: string; purpose: string | null; employer: string | null;
  annualIncome: number | null; createdAt: string;
  payments?: { id: string; amount: number; principal: number; interest: number; createdAt: string }[];
  account?: { nickname: string } | null;
}

interface Account {
  id: string; nickname: string; available: number; status: string;
}

const LOAN_TYPES = [
  { type: 'AUTO', label: 'Auto Loan', icon: Car, rate: '4.5% APR', desc: 'New or used vehicle financing' },
  { type: 'PERSONAL', label: 'Personal Loan', icon: User, rate: '9.9% APR', desc: 'Flexible-purpose unsecured loan' },
  { type: 'HOME', label: 'Home Loan', icon: Home, rate: '6.5% APR', desc: 'Mortgage or refinance' },
  { type: 'STUDENT', label: 'Student Loan', icon: GraduationCap, rate: '5.5% APR', desc: 'Education financing & refinance' },
];

const TERMS = [12, 24, 36, 48, 60];

export function CustomerLoans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payLoan, setPayLoan] = useState<Loan | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const [loanType, setLoanType] = useState('AUTO');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('36');
  const [purpose, setPurpose] = useState('');
  const [employer, setEmployer] = useState('');
  const [annualIncome, setAnnualIncome] = useState('');

  async function load() {
    try {
      const [lRes, aRes] = await Promise.all([fetch('/api/loans'), fetch('/api/accounts')]);
      const lData = await lRes.json();
      const aData = await aRes.json();
      setLoans(lData.loans || []);
      setAccounts((aData.accounts || []).filter((a: Account) => a.status === 'ACTIVE'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const amountNum = parseFloat(amount) || 0;
  const termNum = parseInt(term) || 36;
  const rate = LOAN_TYPES.find(t => t.type === loanType)?.rate || '';
  const rateNum = loanType === 'AUTO' ? 0.045 : loanType === 'PERSONAL' ? 0.099 : loanType === 'HOME' ? 0.065 : 0.055;
  const r = rateNum / 12;
  const estimatedMonthly = amountNum > 0 && termNum > 0
    ? r > 0 ? (amountNum * r) / (1 - Math.pow(1 + r, -termNum)) : amountNum / termNum
    : 0;

  async function submit() {
    if (amountNum <= 0) { toast.error('Enter a valid amount'); return; }
    if (amountNum > 1_000_000) { toast.error('Max loan amount is $1,000,000'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanType, amount: amountNum, term: termNum,
          purpose: purpose || undefined,
          employer: employer || undefined,
          annualIncome: annualIncome ? parseFloat(annualIncome) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { toast.error(data.error || 'Submission failed'); return; }
      toast.success('Loan application submitted — your banker will review it shortly');
      setAmount(''); setPurpose(''); setEmployer(''); setAnnualIncome('');
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    if (!payLoan) return;
    const amt = parseFloat(payAmount) || 0;
    if (!payAccountId || amt <= 0) { toast.error('Select an account and amount'); return; }
    setPaying(true);
    try {
      const data = await apiSend(`/api/loans/${payLoan.id}`, 'POST', { accountId: payAccountId, amount: amt });
      const err = (data as { error?: string }).error;
      if (err) { toast.error(err); return; }
      toast.success(`Payment posted — remaining balance ${formatCurrency((data as { remaining?: number }).remaining ?? 0)}`);
      setPayLoan(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
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
          <PiggyBank className="w-6 h-6 text-primary" /> Loans
        </h1>
        <p className="text-sm text-muted-foreground">Apply for a loan with competitive rates. All applications are reviewed by a loan officer.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Loan Application</CardTitle>
            <CardDescription className="text-xs">Choose a loan type to see your rate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Loan type</Label>
              <RadioGroup value={loanType} onValueChange={setLoanType} className="grid grid-cols-2 gap-2">
                {LOAN_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <label
                      key={t.type}
                      className={`flex items-start gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        loanType === t.type ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <RadioGroupItem value={t.type} className="sr-only" />
                      <Icon className={`w-5 h-5 mt-0.5 ${loanType === t.type ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                        <div className="text-[10px] text-primary font-medium mt-0.5">{t.rate}</div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25,000" />
              </div>
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map(t => <SelectItem key={t} value={String(t)}>{t} months</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Purpose of loan</Label>
              <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Briefly describe what the loan is for" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Employer</Label>
                <Input value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Company name" />
              </div>
              <div className="space-y-2">
                <Label>Annual income ($)</Label>
                <Input type="number" value={annualIncome} onChange={(e) => setAnnualIncome(e.target.value)} placeholder="75,000" />
              </div>
            </div>

            {estimatedMonthly > 0 && (
              <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                <div className="text-[11px] text-muted-foreground">Estimated monthly payment at {rate}</div>
                <div className="font-serif-display text-xl text-primary">{formatCurrency(estimatedMonthly)}<span className="text-xs text-muted-foreground">/mo</span></div>
              </div>
            )}

            <Button onClick={submit} disabled={submitting} className="w-full arvest-gradient text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Submit application
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">My Loans</CardTitle>
            <CardDescription className="text-xs">Track the status of your loan applications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto arvest-scroll">
              {loans.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <PiggyBank className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No loans yet
                </div>
              ) : loans.map((l) => {
                const meta = LOAN_TYPES.find(t => t.type === l.loanType);
                const Icon = meta?.icon || PiggyBank;
                return (
                  <div key={l.id} className="p-4 rounded-md border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{meta?.label || l.loanType}</div>
                          <div className="text-[11px] text-muted-foreground">{l.term} months · {l.interestRate.toFixed(2)}% APR</div>
                        </div>
                      </div>
                      <Badge
                        variant={l.status === 'ACTIVE' ? 'default' : l.status === 'PENDING' ? 'secondary' : l.status === 'REJECTED' ? 'destructive' : l.status === 'PAID_OFF' ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {l.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Principal</div>
                        <div className="font-medium">{formatCurrency(l.amount)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Monthly payment</div>
                        <div className="font-medium">{formatCurrency(l.monthlyPayment)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Remaining balance</div>
                        <div className="font-medium">{formatCurrency(l.remainingBalance)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Applied</div>
                        <div className="font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(l.createdAt)}</div>
                      </div>
                    </div>
                    {l.status === 'ACTIVE' && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                        <div className="text-[11px] text-muted-foreground">
                          {l.purpose ? `${l.purpose.slice(0, 60)}` : 'No purpose noted'}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setPayLoan(l);
                            setPayAccountId(accounts[0]?.id ?? '');
                            setPayAmount(String(l.monthlyPayment.toFixed(2)));
                          }}
                        >
                          <Banknote className="w-3 h-3 mr-1" /> Make a payment
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loan payment dialog */}
      <Dialog open={!!payLoan} onOpenChange={(open) => !open && setPayLoan(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Loan payment</DialogTitle>
            <DialogDescription>
              Outstanding balance {payLoan ? formatCurrency(payLoan.remainingBalance) : ''} · monthly {payLoan ? formatCurrency(payLoan.monthlyPayment) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pay from</Label>
              <Select value={payAccountId} onValueChange={setPayAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nickname} · {formatCurrency(a.available)} available</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (USD)</Label>
              <Input type="number" step="0.01" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayLoan(null)}>Cancel</Button>
            <Button onClick={submitPayment} disabled={paying} className="arvest-gradient text-white">
              {paying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Banknote className="w-4 h-4 mr-2" />}
              Post payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
