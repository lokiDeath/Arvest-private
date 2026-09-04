'use client';

// Deposits — mobile check deposit review with check images.
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatCurrency, formatDateTime, useUI } from '@/lib/store';
import { Banknote, Image as ImageIcon, CheckCheck, XCircle, Loader2 } from 'lucide-react';

interface Dep {
  id: string; amount: number; checkNumber: string | null; frontImage: string | null; backImage: string | null;
  status: string; reference: string; memo: string | null; createdAt: string; reviewedBy: string | null; reviewedAt: string | null;
  user: { id: string; name: string; email: string };
  account: { nickname: string; accountNumber: string } | null;
}

export function DepositsView() {
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewImages, setViewImages] = useState<Dep | null>(null);
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ deposits: Dep[] }>(`/api/admin/deposits?status=${status}`, [status]);
  const deposits = (data?.deposits ?? []).filter((d) =>
    !q || [d.reference, d.checkNumber, d.user?.name, d.account?.nickname].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  async function decide(d: Dep, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(d.id);
    // find the queue approval for this deposit
    const qRes = await fetch('/api/admin/approvals?status=PENDING', { cache: 'no-store' });
    const qJson = await qRes.json();
    const approval = (qJson.approvals as { id: string; type: string; payload: string }[] | undefined)?.find((a) => {
      try { return a.type === 'CHECK_DEPOSIT' && JSON.parse(a.payload).depositId === d.id; } catch { return false; }
    });
    if (!approval) {
      setBusyId(null);
      toast.error('Queue item not found — it may already be decided');
      reload();
      return;
    }
    const res = await adminSend(`/api/admin/approvals/${approval.id}`, 'POST', {
      decision,
      note: decision === 'APPROVED' ? 'Check images verified' : 'Check rejected after review',
    });
    setBusyId(null);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Decision failed')); return; }
    toast.success(String(res.data.message ?? `Deposit ${decision.toLowerCase()}`));
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Deposits" subtitle="Mobile check deposits. Approving credits the account through the ledger; rejecting notifies the customer." />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Reference, check #, customer…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        deposits.length === 0 ? <EmptyState title="No deposits" icon={Banknote} /> : (
          <DataTable minW={920}>
            <thead>
              <tr><Th>Submitted</Th><Th>Customer</Th><Th>Account</Th><Th>Check #</Th><Th right>Amount</Th><Th>Status</Th><Th>Reference</Th><Th right>Actions</Th></tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(d.createdAt)}</Td>
                  <Td>
                    <button className="text-xs hover:underline" onClick={() => adminNavigate('customer-detail', { id: d.user.id })}>{d.user.name}</button>
                  </Td>
                  <Td className="text-xs">{d.account ? `${d.account.nickname} ••${d.account.accountNumber.slice(-4)}` : '—'}</Td>
                  <Td className="text-xs">{d.checkNumber ?? '—'}</Td>
                  <Td right className="font-medium text-emerald-700">+{formatCurrency(d.amount)}</Td>
                  <Td><StatusPill status={d.status} /></Td>
                  <Td className="font-mono text-[11px] text-muted-foreground">{d.reference}</Td>
                  <Td right>
                    <div className="flex gap-1.5 justify-end">
                      {(d.frontImage || d.backImage) && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setViewImages(d)}>
                          <ImageIcon className="w-3 h-3 mr-1" /> Images
                        </Button>
                      )}
                      {d.status === 'PENDING' && (
                        <>
                          <Button size="sm" className="h-7 text-xs arvest-gradient text-white" disabled={busyId === d.id} onClick={() => decide(d, 'APPROVED')}>
                            {busyId === d.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCheck className="w-3 h-3 mr-1" />} Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/40 text-destructive" disabled={busyId === d.id} onClick={() => decide(d, 'REJECTED')}>
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

      {/* Check images */}
      <Dialog open={!!viewImages} onOpenChange={(o) => !o && setViewImages(null)}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Check images — {viewImages?.reference}</DialogTitle>
            <DialogDescription>
              {viewImages?.user.name} · {viewImages?.account?.nickname} · {viewImages ? formatCurrency(viewImages.amount) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto arvest-scroll">
            {(['frontImage', 'backImage'] as const).map((key) => {
              const img = viewImages?.[key];
              const label = key === 'frontImage' ? 'Front' : 'Back';
              return (
                <div key={key}>
                  <div className="text-xs font-medium mb-1.5">{label}</div>
                  {img ? (
                    <Card><CardContent className="p-2"><img src={img} alt={`${label} of check`} className="w-full rounded-md border border-border" /></CardContent></Card>
                  ) : (
                    <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-md">Not provided</div>
                  )}
                </div>
              );
            })}
          </div>
          {viewImages?.status === 'PENDING' && (
            <div className="flex justify-end gap-2">
              <Badge variant="outline">Amount {formatCurrency(viewImages.amount)}</Badge>
              <Button size="sm" className="arvest-gradient text-white" onClick={() => { const d = viewImages; setViewImages(null); decide(d, 'APPROVED'); }}>
                <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Approve &amp; credit
              </Button>
              <Button size="sm" variant="outline" className="border-destructive/40 text-destructive" onClick={() => { const d = viewImages; setViewImages(null); decide(d, 'REJECTED'); }}>
                <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
