'use client';

// Transactions — the institution-wide ledger. Flag for review; reverse
// posted items with mirrored entries. History is never edited or deleted.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState, ReasonDialog, Money,
} from '../admin-primitives';
import { formatDateTime, useUI } from '@/lib/store';
import { Flag, Undo2, Eye, ShieldCheck } from 'lucide-react';

interface Entry {
  id: string; direction: 'DEBIT' | 'CREDIT'; amount: number;
  bucketFrom: string | null; bucketTo: string | null;
  balanceBefore: number; balanceAfter: number; availableBefore: number; availableAfter: number;
  memo: string | null;
  account: { id: string; nickname: string; accountNumber: string; user: { id: string; name: string } | null };
}
interface Tx {
  id: string; reference: string; type: string; category: string; description: string;
  counterparty: string | null; memo: string | null; status: string; meta: string;
  reversalOfId: string | null; postedAt: string | null; createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  entries: Entry[];
}

export function TransactionsView() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ transactions: Tx[] }>(
    `/api/admin/transactions?q=${encodeURIComponent(q)}&type=${type}&status=${status}`,
    [q, type, status]
  );

  const [entriesTx, setEntriesTx] = useState<Tx | null>(null);
  const [reverseTx, setReverseTx] = useState<Tx | null>(null);
  const [busy, setBusy] = useState(false);

  const txs = data?.transactions ?? [];

  async function doReverse(note: string) {
    if (!reverseTx) return;
    setBusy(true);
    const res = await adminSend('/api/admin/transactions/reverse', 'POST', { ledgerTxId: reverseTx.id, reason: note });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Reversal failed')); return; }
    toast.success(`Reversal ${res.data.reversalRef} posted`);
    setReverseTx(null);
    reload();
  }

  async function setFlag(tx: Tx, flag: boolean) {
    setBusy(true);
    const res = await adminSend('/api/admin/transactions', 'POST', {
      action: flag ? 'FLAG' : 'UNFLAG', ledgerTxId: tx.id,
      reason: flag ? 'Flagged for compliance review' : 'Review completed',
    });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(flag ? 'Transaction flagged' : 'Flag removed');
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        subtitle="Double-entry ledger of record. Posted items can be flagged or reversed — never edited or deleted."
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Reference, description, customer…" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'ZELLE', 'BILLPAY', 'LOAN_DISBURSEMENT', 'LOAN_PAYMENT', 'ADJUSTMENT', 'HOLD', 'RELEASE', 'REVERSAL'].map((t) => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'POSTED', 'PENDING', 'FLAGGED', 'REVERSED', 'DECLINED'].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto self-center">{txs.length} shown</span>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        txs.length === 0 ? <EmptyState title="No transactions match" /> : (
          <DataTable minW={960}>
            <thead>
              <tr>
                <Th>Date</Th><Th>Description</Th><Th>Customer</Th><Th>Type</Th>
                <Th right>Amount</Th><Th>Status</Th><Th>Reference</Th><Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => {
                const primary = tx.entries[0];
                const credit = primary?.direction === 'CREDIT';
                return (
                  <tr key={tx.id} className="hover:bg-muted/30">
                    <Td className="text-xs whitespace-nowrap">{formatDateTime(tx.postedAt ?? tx.createdAt)}</Td>
                    <Td className="max-w-[240px]">
                      <div className="truncate text-[13px] font-medium">{tx.description}</div>
                      {tx.counterparty && <div className="text-[11px] text-muted-foreground truncate">{tx.counterparty}</div>}
                    </Td>
                    <Td>
                      {tx.user ? (
                        <button className="text-xs hover:underline text-left" onClick={() => adminNavigate('customer-detail', { id: tx.user!.id })}>
                          {tx.user.name}
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </Td>
                    <Td><Badge variant="outline" className="text-[10px]">{tx.type.replace(/_/g, ' ')}</Badge></Td>
                    <Td right className="font-medium">
                      <Money value={primary?.amount ?? 0} signed credit={credit} />
                    </Td>
                    <Td><StatusPill status={tx.status} /></Td>
                    <Td className="font-mono text-[11px] text-muted-foreground">{tx.reference}</Td>
                    <Td right>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View entries" onClick={() => setEntriesTx(tx)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {(tx.status === 'POSTED') && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Flag for review" onClick={() => setFlag(tx, true)}>
                            <Flag className="w-3.5 h-3.5 text-amber-600" />
                          </Button>
                        )}
                        {tx.status === 'FLAGGED' && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Clear flag" onClick={() => setFlag(tx, false)}>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                        )}
                        {(tx.status === 'POSTED' || tx.status === 'FLAGGED') && tx.type !== 'REVERSAL' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReverseTx(tx)}>
                            <Undo2 className="w-3 h-3 mr-1" /> Reverse
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}

      {/* Entries dialog */}
      <Dialog open={!!entriesTx} onOpenChange={(o) => !o && setEntriesTx(null)}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Ledger entries — {entriesTx?.reference}</DialogTitle>
            <DialogDescription>
              {entriesTx?.description} · {entriesTx?.type.replace(/_/g, ' ')} · balanced movement
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[380px] overflow-y-auto arvest-scroll">
            {entriesTx?.entries.map((e) => (
              <div key={e.id} className="p-3 rounded-md border border-border text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="font-semibold">{e.account.user?.name ?? 'Account'}</span>
                    <span className="text-muted-foreground"> · {e.account.nickname} ••{e.account.accountNumber.slice(-4)}</span>
                  </div>
                  <Badge variant="outline" className={e.direction === 'CREDIT' ? 'text-emerald-700 border-emerald-200' : 'text-red-700 border-red-200'}>
                    {e.direction}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                  <div>From <span className="text-foreground font-medium">{e.bucketFrom}</span></div>
                  <div>To <span className="text-foreground font-medium">{e.bucketTo}</span></div>
                  <div className="text-right font-mono-balance text-foreground font-medium">{formatDateTime(e.availableAfter !== undefined ? entriesTx.createdAt : entriesTx.createdAt)}</div>
                </div>
                <div className="mt-1.5 font-mono-balance">
                  {e.direction === 'DEBIT' ? '−' : '+'}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(e.amount)}
                  <span className="text-muted-foreground"> · available {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(e.availableBefore)} → {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(e.availableAfter)}</span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={!!reverseTx}
        title={`Reverse ${reverseTx?.reference ?? ''}`}
        description="Creates a mirrored REVERSAL entry and marks the original REVERSED. Both records remain in the ledger permanently."
        confirmLabel="Post reversal"
        destructive
        busy={busy}
        noteLabel="Reversal reason (required)"
        onCancel={() => setReverseTx(null)}
        onConfirm={doReverse}
      />
    </div>
  );
}
