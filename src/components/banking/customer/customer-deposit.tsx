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
import { formatCurrency, maskAccountNumber, formatDate } from '@/lib/store';
import {
  Smartphone, Camera, CheckCircle2, Clock, Loader2, Image as ImageIcon, X, History,
} from 'lucide-react';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
  balance: number; available: number;
}

interface Deposit {
  id: string; accountId: string; amount: number; checkNumber: string | null;
  status: string; memo: string | null; createdAt: string;
}

// Compress image to JPEG data URL ~800px max, quality 0.7
function compressImage(file: File, maxSize = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CustomerDeposit({ onSuccess }: { onSuccess: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);

  async function load() {
    try {
      const [aRes, dRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/check-deposit'),
      ]);
      const aData = await aRes.json();
      const dData = await dRes.json();
      setAccounts(aData.accounts || []);
      setDeposits(dData.deposits || []);
      if (aData.accounts?.[0]) setAccountId(aData.accounts[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>, which: 'front' | 'back') {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      if (which === 'front') setFrontImage(compressed);
      else setBackImage(compressed);
      toast.success(`${which === 'front' ? 'Front' : 'Back'} photo ready`);
    } catch {
      toast.error('Could not process image');
    } finally {
      e.target.value = '';
    }
  }

  async function submit() {
    const amountNum = parseFloat(amount) || 0;
    if (!accountId) { toast.error('Select a destination account'); return; }
    if (amountNum <= 0) { toast.error('Enter a valid amount'); return; }
    if (amountNum > 50000) { toast.error('Mobile deposit limit is $50,000 per check'); return; }
    if (!frontImage || !backImage) { toast.error('Both check photos are required'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/check-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          amount: amountNum,
          checkNumber: checkNumber || undefined,
          frontImage,
          backImage,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Submission failed'); return; }
      toast.success('Deposit submitted — pending review');
      setAmount(''); setCheckNumber(''); setMemo('');
      setFrontImage(null); setBackImage(null);
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
          <Smartphone className="w-6 h-6 text-primary" /> Mobile Deposit
        </h1>
        <p className="text-sm text-muted-foreground">Deposit checks from your phone. Deposits are reviewed by your banker before funds are released.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Deposit</CardTitle>
            <CardDescription className="text-xs">Take a photo or upload an image of both sides of your check.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Deposit to</Label>
              <Select value={accountId} onValueChange={setAccountId}>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Check # (optional)</Label>
                <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="1001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Front of check</Label>
                {frontImage ? (
                  <div className="relative">
                    <img src={frontImage} alt="Front" className="w-full h-32 object-cover rounded-md border border-border" />
                    <button onClick={() => setFrontImage(null)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1 h-32 rounded-md border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Tap to upload</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageChange(e, 'front')} />
                  </label>
                )}
              </div>
              <div className="space-y-2">
                <Label>Back of check</Label>
                {backImage ? (
                  <div className="relative">
                    <img src={backImage} alt="Back" className="w-full h-32 object-cover rounded-md border border-border" />
                    <button onClick={() => setBackImage(null)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1 h-32 rounded-md border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Tap to upload</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageChange(e, 'back')} />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Memo (optional)</Label>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Birthday gift, freelance invoice" />
            </div>

            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>All mobile deposits are reviewed by your private banker. Funds will be available once approved (typically 1 business day).</span>
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full arvest-gradient text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Submit deposit
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Deposit History</CardTitle>
            <CardDescription className="text-xs">Your recent mobile deposits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto arvest-scroll">
              {deposits.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No deposits yet
                </div>
              ) : deposits.map((d) => {
                const acct = accounts.find(a => a.id === d.accountId);
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-md border border-border">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Smartphone className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{formatCurrency(d.amount)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {acct?.nickname || '—'} · {formatDate(d.createdAt)}
                        {d.checkNumber && ` · #${d.checkNumber}`}
                      </div>
                    </div>
                    <Badge variant={d.status === 'POSTED' || d.status === 'APPROVED' ? 'default' : d.status === 'PENDING' ? 'secondary' : 'outline'} className="text-[10px]">
                      {d.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
