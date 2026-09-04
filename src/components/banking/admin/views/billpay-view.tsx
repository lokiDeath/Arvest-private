'use client';

// Bill Pay — scheduled payments with real status handling.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '../admin-primitives';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatCurrency, formatDateTime, useUI } from '@/lib/store';
import { Receipt, Zap, XCircle } from 'lucide-react';

interface Bill {
  id: string; payee: string; payeeAccount: string | null; amount: number; memo: string | null;
  payDate: string; status: string; reference: string; paidAt: string | null; createdAt: string;
  user: { id: string; name: string; email: string };
  account: { nickname: string; accountNumber: string } | null;
}

export function BillPayView() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelBill, setCancelBill] = useState<Bill | null>(null);
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ bills: Bill[] }>(`/api/admin/billpay?status=${status}`, [status]);
  const bills = (data?.bills ?? []).filter((b) =>
    !q || [b.payee, b.reference, b.user?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  async function processNow(b: Bill) {
    setBusyId(b.id);
    const res = await adminSend('/api/admin/billpay', 'PATCH', { id: b.id, action: 'PROCESS_NOW' });
    setBusyId(null);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(`Processed: ${String(res.data.result ?? 'done')}`);
    reload();
  }

  async function doCancel() {
    if (!cancelBill) return;
    setBusyId(cancelBill.id);
    const res = await adminSend('/api/admin/billpay', 'PATCH', { id: cancelBill.id, action: 'CANCEL' });
    setBusyId(null);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success('Bill payment cancelled');
    setCancelBill(null);
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Bill Pay" subtitle="Scheduled payments become PAID, ON_HOLD (review), CANCELLED or FAILED — nothing silently disappears." />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Payee, customer or reference…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'SCHEDULED', 'PAID', 'ON_HOLD', 'CANCELLED', 'FAILED'].map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        bills.length === 0 ? <EmptyState title="No bill payments" icon={Receipt} /> : (
          <DataTable minW={920}>
            <thead>
              <tr><Th>Due</Th><Th>Customer</Th><Th>Payee</Th><Th>Account</Th><Th right>Amount</Th><Th>Status</Th><Th>Reference</Th><Th right>Actions</Th></tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(b.payDate)}</Td>
                  <Td>
                    <button className="text-xs hover:underline" onClick={() => adminNavigate('customer-detail', { id: b.user.id })}>{b.user.name}</button>
                  </Td>
                  <Td className="text-[13px] font-medium">{b.payee}</Td>
                  <Td className="text-xs">{b.account ? `${b.account.nickname} ••${b.account.accountNumber.slice(-4)}` : '—'}</Td>
                  <Td right className="font-medium">−{formatCurrency(b.amount)}</Td>
                  <Td><StatusPill status={b.status} /></Td>
                  <Td className="font-mono text-[11px] text-muted-foreground">{b.reference}</Td>
                  <Td right>
                    <div className="flex gap-1.5 justify-end">
                      {b.status === 'SCHEDULED' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === b.id} onClick={() => processNow(b)}>
                          <Zap className="w-3 h-3 mr-1" /> Process now
                        </Button>
                      )}
                      {['SCHEDULED', 'ON_HOLD', 'FAILED'].includes(b.status) && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={busyId === b.id} onClick={() => setCancelBill(b)}>
                          <XCircle className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

      <ConfirmDialog
        open={!!cancelBill}
        title={`Cancel payment to ${cancelBill?.payee ?? ''}?`}
        description={cancelBill?.status === 'ON_HOLD'
          ? 'The held funds are released back to the customer\u2019s available balance and the request is closed.'
          : 'The scheduled payment is cancelled and the customer is notified.'}
        confirmLabel="Cancel payment"
        destructive
        busy={busyId === cancelBill?.id}
        onCancel={() => setCancelBill(null)}
        onConfirm={doCancel}
      />
    </div>
  );
}
