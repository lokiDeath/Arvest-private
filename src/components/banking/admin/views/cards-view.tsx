'use client';

// Cards — issue, freeze, close, inspect (PAN reveal is audited).
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, SearchInput, LoadingBlock, ErrorState, EmptyState, ConfirmDialog,
} from '../admin-primitives';
import { formatCurrency, formatDate, useUI } from '@/lib/store';
import { CreditCard, Plus, Eye, Snowflake, PlayCircle, XCircle } from 'lucide-react';

interface CardT {
  id: string; userId: string; issuedBy: string; cardType: string; network: string; cardholder: string;
  cardLast4: string; cardNumberMasked: string; expiryMonth: number; expiryYear: number; color: string;
  status: string; creditLimit: number; dailyLimit: number; nickname: string | null; createdAt: string;
  user: { id: string; name: string; email: string };
  account: { nickname: string; accountNumber: string } | null;
}

const COLORS = ['CRIMSON', 'GOLD', 'OBSIDIAN', 'PLATINUM', 'SAPPHIRE', 'EMERALD'];

function cardColorClass(color: string): string {
  const map: Record<string, string> = {
    CRIMSON: 'arvest-gradient', GOLD: 'bg-gradient-to-br from-yellow-600 to-amber-800',
    OBSIDIAN: 'bg-gradient-to-br from-zinc-700 to-zinc-900', PLATINUM: 'bg-gradient-to-br from-slate-400 to-slate-600',
    SAPPHIRE: 'bg-gradient-to-br from-blue-700 to-blue-900', EMERALD: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
  };
  return map[color] ?? 'arvest-gradient';
}

export function CardsView() {
  const [q, setQ] = useState('');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ cards: CardT[] }>(`/api/admin/cards?q=${encodeURIComponent(q)}`, [q]);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [form, setForm] = useState({ userId: '', cardType: 'DEBIT', network: 'VISA', color: 'CRIMSON', creditLimit: '25000' });
  const [secrets, setSecrets] = useState<{ cardNumber: string; cvv: string; pin: string } | null>(null);
  const [reveal, setReveal] = useState<CardT | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null);

  async function openIssue() {
    setIssue(true);
    const res = await fetch('/api/admin/customers', { cache: 'no-store' });
    const json = await res.json();
    setCustomers((json.customers ?? []).map((c: { id: string; name: string; email: string }) => ({ id: c.id, name: c.name, email: c.email })));
    setForm({ userId: '', cardType: 'DEBIT', network: 'VISA', color: 'CRIMSON', creditLimit: '25000' });
  }

  async function doIssue() {
    setBusy(true);
    const res = await adminSend('/api/admin/cards', 'POST', {
      action: 'ISSUE', userId: form.userId, cardType: form.cardType, network: form.network,
      color: form.color, creditLimit: parseFloat(form.creditLimit) || 25000,
    });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Issue failed')); return; }
    setSecrets(res.data.oneTimeSecrets as { cardNumber: string; cvv: string; pin: string });
    setIssue(false);
    toast.success('Card issued');
    reload();
  }

  async function doReveal() {
    if (!reveal) return;
    setBusy(true);
    const res = await adminSend(`/api/admin/cards/${reveal.id}/reveal`, 'POST', {});
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Reveal failed')); return; }
    setRevealed(String(res.data.cardNumber));
  }

  async function updateStatus(c: CardT, status: string) {
    setBusy(true);
    const res = await adminSend('/api/admin/cards', 'POST', { action: 'UPDATE', id: c.id, status });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(`Card ••${c.cardLast4} → ${status.toLowerCase()}`);
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cards"
        subtitle="Card numbers are encrypted at rest. Revealing a full PAN is recorded in the audit log; CVV and PIN are never recoverable."
        action={<Button onClick={openIssue} className="arvest-gradient text-white"><Plus className="w-4 h-4 mr-2" /> Issue card</Button>}
      />

      <SearchInput value={q} onChange={setQ} placeholder="Last 4, cardholder or customer…" />

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        data!.cards.length === 0 ? <EmptyState title="No cards" icon={CreditCard} /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data!.cards.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className={`h-28 rounded-xl p-4 flex flex-col justify-between text-white ${cardColorClass(c.color)}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.18em]">Arvest {c.cardType}</span>
                      <span className="text-[11px] font-semibold">{c.network}</span>
                    </div>
                    <div>
                      <div className="font-mono text-sm tracking-[0.14em]">{c.cardNumberMasked}</div>
                      <div className="text-[9.5px] text-white/70 mt-1">{c.cardholder} · EXP {String(c.expiryMonth).padStart(2, '0')}/{c.expiryYear}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <button className="hover:underline text-left" onClick={() => adminNavigate('customer-detail', { id: c.user.id })}>
                      {c.user.name}
                    </button>
                    <StatusPill status={c.status} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {c.issuedBy === 'ARVEST' ? 'Bank-issued' : 'External'} · linked {c.account ? `••${c.account.accountNumber.slice(-4)}` : '—'}
                    {c.creditLimit > 0 ? ` · limit ${formatCurrency(c.creditLimit, { cents: false })}` : ''} · issued {formatDate(c.createdAt)}
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReveal(c); setRevealed(null); }}>
                      <Eye className="w-3 h-3 mr-1" /> Reveal
                    </Button>
                    {c.status === 'ACTIVE' ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(c, 'FROZEN')}>
                        <Snowflake className="w-3 h-3 mr-1" /> Freeze
                      </Button>
                    ) : c.status === 'FROZEN' ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(c, 'ACTIVE')}>
                        <PlayCircle className="w-3 h-3 mr-1" /> Unfreeze
                      </Button>
                    ) : null}
                    {c.status === 'ACTIVE' && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setConfirm({
                        title: `Close card ••${c.cardLast4}?`,
                        description: 'The card becomes permanently unusable. This is recorded in the audit log.',
                        run: () => updateStatus(c, 'CLOSED'),
                      })}>
                        <XCircle className="w-3 h-3 mr-1" /> Close
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      {/* Issue dialog */}
      <Dialog open={issue} onOpenChange={setIssue}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Issue Arvest card</DialogTitle>
            <DialogDescription>The card is active immediately. One-time secrets are shown after issuing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.email})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.cardType} onValueChange={(v) => setForm({ ...form, cardType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="DEBIT">Debit</SelectItem><SelectItem value="CREDIT">Credit</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Network</Label>
                <Select value={form.network} onValueChange={(v) => setForm({ ...form, network: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VISA">Visa</SelectItem><SelectItem value="MASTERCARD">Mastercard</SelectItem>
                    <SelectItem value="AMEX">Amex</SelectItem><SelectItem value="DISCOVER">Discover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Select value={form.color} onValueChange={(v) => setForm({ ...form, color: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Credit limit</Label>
                <Input type="number" min="500" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssue(false)} disabled={busy}>Cancel</Button>
            <Button onClick={doIssue} disabled={busy || !form.userId} className="arvest-gradient text-white">Issue card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time secrets */}
      <Dialog open={!!secrets} onOpenChange={(o) => !o && setSecrets(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader><DialogTitle>One-time card secrets</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {[['Card number', secrets?.cardNumber], ['CVV', secrets?.cvv], ['PIN', secrets?.pin]].map(([label, val]) => (
              <div key={label} className="p-3 rounded-md bg-muted/60 border border-border">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="font-mono text-sm break-all">{val}</div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Shown once — CVV and PIN are never stored in recoverable form.</p>
          </div>
          <DialogFooter><Button className="arvest-gradient text-white" onClick={() => setSecrets(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal PAN */}
      <Dialog open={!!reveal} onOpenChange={(o) => { if (!o) { setReveal(null); setRevealed(null); } }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reveal full card number</DialogTitle>
            <DialogDescription>This view is recorded in the audit log with your identity.</DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="p-3 rounded-md bg-muted/60 border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Full PAN — ••{reveal?.cardLast4}</div>
              <div className="font-mono text-sm break-all">{revealed}</div>
            </div>
          )}
          <DialogFooter>
            {revealed ? (
              <Button className="arvest-gradient text-white" onClick={() => { setReveal(null); setRevealed(null); }}>Done</Button>
            ) : (
              <Button className="arvest-gradient text-white" disabled={busy} onClick={doReveal}>
                <Eye className="w-4 h-4 mr-2" /> Reveal (audited)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="Confirm"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm?.run(); setConfirm(null); }}
      />
    </div>
  );
}
