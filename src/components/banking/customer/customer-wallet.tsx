'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Bitcoin, Plus, Trash2, ArrowRight, Loader2, ShieldAlert,
  ChevronRight, ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon, Droplets, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/store';
import { apiSend } from '@/lib/safe-fetch';

interface Wallet {
  id: string; walletType: string; address: string;
  balance: number; label: string | null; status: string; createdAt: string;
  transactions?: WalletTransaction[];
}

interface WalletTransaction {
  id: string; type: string; amount: number; currency: string;
  counterparty: string | null; status: string;
  sandboxRef: string | null; memo: string | null; date: string;
}

const WALLET_TYPES = [
  { type: 'BTC', label: 'Bitcoin', icon: '₿', color: 'bg-amber-500' },
  { type: 'ETH', label: 'Ethereum', icon: 'Ξ', color: 'bg-indigo-500' },
  { type: 'USDC', label: 'USD Coin', icon: '$', color: 'bg-emerald-500' },
  { type: 'USD', label: 'USD Reserve', icon: '$', color: 'bg-primary' },
];

function maskAddress(addr: string): string {
  if (!addr) return '';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export function CustomerWallet() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [fundAmount, setFundAmount] = useState('1000');
  const [funding, setFunding] = useState(false);

  const [newType, setNewType] = useState('BTC');
  const [newLabel, setNewLabel] = useState('');
  const [importAddress, setImportAddress] = useState('');
  const [importLabel, setImportLabel] = useState('');

  // Send form
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendMemo, setSendMemo] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/wallet');
      const data = await res.json();
      setWallets(data.wallets || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openWallet(w: Wallet) {
    setSelectedWallet(w);
    setLoadingTx(true);
    setSendTo(''); setSendAmount(''); setSendMemo('');
    try {
      const res = await fetch(`/api/wallet/${w.id}/transactions`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setSelectedWallet(data.wallet ?? w);
    } finally {
      setLoadingTx(false);
    }
  }

  async function createWallet() {
    setCreating(true);
    try {
      const data = await apiSend('/api/wallet', 'POST', { walletType: newType, label: newLabel || undefined });
      if ((data as { error?: string }).error) { toast.error((data as { error?: string }).error); return; }
      toast.success(`Sandbox ${newType} wallet created`);
      setShowCreateDialog(false);
      setNewLabel('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function importWallet() {
    if (!importAddress.trim()) { toast.error('Enter an address to import'); return; }
    setImporting(true);
    try {
      const data = await apiSend('/api/wallet', 'POST', { action: 'IMPORT', address: importAddress.trim(), walletType: newType, label: importLabel || undefined });
      if ((data as { error?: string }).error) { toast.error((data as { error?: string }).error); return; }
      toast.success('Watch-only sandbox wallet registered');
      setShowImportDialog(false);
      setImportAddress(''); setImportLabel('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function deleteWallet(w: Wallet) {
    if (!window.confirm(`Delete ${w.walletType} sandbox wallet "${w.label || maskAddress(w.address)}" and its history? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/wallet/${w.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Delete failed'); return; }
      toast.success('Wallet deleted');
      if (selectedWallet?.id === w.id) setSelectedWallet(null);
      load();
    } catch {
      toast.error('Delete failed');
    }
  }

  async function fundWallet() {
    if (!selectedWallet) return;
    const amt = parseFloat(fundAmount) || 0;
    if (amt <= 0) { toast.error('Enter a valid amount'); return; }
    setFunding(true);
    try {
      const data = await apiSend('/api/wallet/fund', 'POST', { walletId: selectedWallet.id, amount: amt });
      if ((data as { error?: string }).error) { toast.error((data as { error?: string }).error); return; }
      toast.success(`Sandbox funding complete — ${amt} ${selectedWallet.walletType} added`);
      setShowFundDialog(false);
      openWallet(selectedWallet);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Funding failed');
    } finally {
      setFunding(false);
    }
  }

  async function sendFunds() {
    if (!selectedWallet) return;
    const amt = parseFloat(sendAmount) || 0;
    if (!sendTo.trim()) { toast.error('Enter destination handle'); return; }
    if (amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > selectedWallet.balance) { toast.error('Insufficient sandbox wallet balance'); return; }
    setSending(true);
    try {
      const data = await apiSend('/api/wallet/send', 'POST', {
        walletId: selectedWallet.id,
        counterparty: sendTo.trim(),
        amount: amt,
        memo: sendMemo || undefined,
      });
      const resp = data as { error?: string; pending?: boolean; status?: string };
      if (resp.error) { toast.error(resp.error); return; }
      toast.success(resp.pending ? 'Send submitted — pending banker review' : 'Send completed in the sandbox');
      setSendTo(''); setSendAmount(''); setSendMemo('');
      openWallet(selectedWallet);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
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
          <Bitcoin className="w-6 h-6 text-primary" /> Digital Wallet
          <Badge variant="outline" className="text-[10px] tracking-wider">SANDBOX</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">Simulated wallet for exploring digital-asset workflows — balances live outside your bank accounts.</p>
      </div>

      {/* Sandbox notice */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50/60 border border-blue-200 text-[11px] text-blue-900">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Clearly sandbox:</strong> these wallets are a product demonstration. Addresses are internal sandbox handles (SBX-…),
          no cryptographic keys are ever generated or stored, and “sandbox references” replace transaction hashes. Sends above the
          bank&apos;s auto-approval limit require manager review.
        </span>
      </div>

      {selectedWallet ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <Button variant="ghost" size="sm" className="mb-1 h-7 px-2" onClick={() => setSelectedWallet(null)}>
                  <ChevronRight className="w-3.5 h-3.5 rotate-180 mr-1" /> Back to wallets
                </Button>
                <CardTitle className="text-base flex items-center gap-2">
                  <WalletIcon className="w-4 h-4" /> {selectedWallet.label || selectedWallet.walletType + ' Sandbox Wallet'}
                </CardTitle>
                <CardDescription className="text-xs font-mono mt-1">{selectedWallet.address}</CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px]">{selectedWallet.walletType}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-md bg-muted/40 flex items-end justify-between">
              <div>
                <div className="text-[11px] text-muted-foreground">Sandbox balance</div>
                <div className="font-serif-display text-2xl">
                  {selectedWallet.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {selectedWallet.walletType}
                </div>
              </div>
              {selectedWallet.status === 'ACTIVE' && (
                <Button size="sm" variant="outline" onClick={() => setShowFundDialog(true)}>
                  <Droplets className="w-3.5 h-3.5 mr-1.5" /> Sandbox funding
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="text-sm font-medium">Send {selectedWallet.walletType}</div>
                <div className="space-y-2">
                  <Label>Destination handle</Label>
                  <Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="counterparty handle or address" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" inputMode="decimal" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Memo</Label>
                    <Input value={sendMemo} onChange={(e) => setSendMemo(e.target.value)} placeholder="optional" />
                  </div>
                </div>
                <Button onClick={sendFunds} disabled={sending} className="w-full arvest-gradient text-white">
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpRight className="w-4 h-4 mr-2" />}
                  Send
                </Button>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Sandbox activity</div>
                <div className="space-y-2 max-h-64 overflow-y-auto arvest-scroll">
                  {loadingTx ? (
                    <div className="text-xs text-muted-foreground p-3">Loading…</div>
                  ) : transactions.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-3 text-center">No activity yet — try sandbox funding</div>
                  ) : transactions.map((tx) => {
                    const isSend = tx.type === 'SEND';
                    return (
                      <div key={tx.id} className="flex items-center gap-2 p-2 rounded-md border border-border text-xs">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isSend ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {isSend ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{isSend ? 'Sent' : tx.type === 'FUND' ? 'Funded' : 'Received'} {tx.amount} {tx.currency}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {tx.counterparty ? `${tx.counterparty} · ` : ''}{tx.sandboxRef ?? '—'} · {formatDate(tx.date)}
                          </div>
                        </div>
                        <Badge variant={tx.status === 'COMPLETED' ? 'default' : tx.status === 'PENDING' ? 'secondary' : 'destructive'} className="text-[9px]">{tx.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteWallet(selectedWallet)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete wallet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowCreateDialog(true)} className="arvest-gradient text-white">
              <Plus className="w-4 h-4 mr-1.5" /> New sandbox wallet
            </Button>
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <ArrowRight className="w-4 h-4 mr-1.5" /> Register watch-only handle
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wallets.length === 0 ? (
              <Card className="md:col-span-2">
                <CardContent className="text-center py-12">
                  <Bitcoin className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                  <div className="text-sm font-medium">No sandbox wallets yet</div>
                  <div className="text-xs text-muted-foreground mt-1">Create one and use sandbox funding to explore sends and approvals.</div>
                </CardContent>
              </Card>
            ) : wallets.map((w) => (
              <Card key={w.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <button onClick={() => openWallet(w)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${
                        WALLET_TYPES.find(t => t.type === w.walletType)?.color || 'bg-primary'
                      }`}>
                        {WALLET_TYPES.find(t => t.type === w.walletType)?.icon || '₿'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{w.label || `${w.walletType} Sandbox Wallet`}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">{maskAddress(w.address)}</div>
                      </div>
                    </button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteWallet(w)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{w.walletType}</Badge>
                    <div className="text-sm font-medium">
                      {w.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {w.walletType}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create wallet dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New sandbox wallet</DialogTitle>
            <DialogDescription>
              Creates a simulated wallet with an internal SBX- handle. No keys are generated — nothing here touches a real blockchain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-4 gap-2">
              {WALLET_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => setNewType(t.type)}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-colors ${
                    newType === t.type ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${t.color}`}>
                    {t.icon}
                  </div>
                  <span className="text-[11px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Wallet label (optional)</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Long-term sandbox" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={createWallet} disabled={creating} className="arvest-gradient text-white">
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import (watch-only) dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register watch-only handle</DialogTitle>
            <DialogDescription>
              Registers any handle as a watch-only sandbox wallet with a zero balance — useful for demoing send destinations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Handle</Label>
              <Input value={importAddress} onChange={(e) => setImportAddress(e.target.value)} placeholder="any external handle" className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input value={importLabel} onChange={(e) => setImportLabel(e.target.value)} placeholder="e.g. Custody demo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button onClick={importWallet} disabled={importing} className="arvest-gradient text-white">
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sandbox funding dialog */}
      <Dialog open={showFundDialog} onOpenChange={setShowFundDialog}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-primary" /> Sandbox funding
            </DialogTitle>
            <DialogDescription>
              Adds simulated {selectedWallet?.walletType} to this sandbox wallet for demonstration purposes. Clearly labeled as demo funding in your activity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Amount</Label>
            <Input type="number" min="0" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFundDialog(false)}>Cancel</Button>
            <Button onClick={fundWallet} disabled={funding} className="arvest-gradient text-white">
              {funding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Droplets className="w-4 h-4 mr-2" />}
              Add sandbox funds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border text-[11px] text-muted-foreground">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Sandbox wallets are separate from your deposit accounts and hold no monetary value. Bank ledger guarantees (double-entry, holds, reversals) apply to your deposit accounts, not to this demo module.</span>
      </div>
    </div>
  );
}
