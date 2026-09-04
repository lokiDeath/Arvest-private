'use client';

// Zelle — all P2P transfers with ledger-linked status.
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAdminData, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatDateTime, useUI } from '@/lib/store';
import { Smartphone } from 'lucide-react';

interface Zelle {
  id: string; recipientName: string; recipientEmail: string | null; recipientPhone: string | null;
  amount: number; memo: string | null; status: string; reference: string;
  createdAt: string; completedAt: string | null;
  user: { id: string; name: string; email: string };
  account: { nickname: string; accountNumber: string } | null;
}

export function ZelleView() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ zelleTransfers: Zelle[] }>(
    `/api/admin/zelle?status=${status}`,
    [status]
  );
  const items = (data?.zelleTransfers ?? []).filter((z) =>
    !q || [z.recipientName, z.recipientEmail, z.recipientPhone, z.reference, z.user?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Zelle" subtitle="Status is synchronized with the underlying ledger transaction — completed means the money moved." />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Recipient, customer or reference…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'COMPLETED', 'ON_HOLD', 'DECLINED'].map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        items.length === 0 ? <EmptyState title="No Zelle transfers" icon={Smartphone} /> : (
          <DataTable minW={880}>
            <thead>
              <tr><Th>Date</Th><Th>Customer</Th><Th>Recipient</Th><Th>Contact</Th><Th>Account</Th><Th right>Amount</Th><Th>Status</Th><Th>Reference</Th></tr>
            </thead>
            <tbody>
              {items.map((z) => (
                <tr key={z.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(z.createdAt)}</Td>
                  <Td>
                    <button className="text-xs hover:underline" onClick={() => adminNavigate('customer-detail', { id: z.user.id })}>{z.user.name}</button>
                  </Td>
                  <Td className="text-[13px] font-medium">{z.recipientName}</Td>
                  <Td className="text-xs">{z.recipientEmail ?? z.recipientPhone ?? '—'}</Td>
                  <Td className="text-xs">{z.account ? `${z.account.nickname} ••${z.account.accountNumber.slice(-4)}` : '—'}</Td>
                  <Td right className="font-medium">−{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(z.amount)}</Td>
                  <Td><StatusPill status={z.status === 'ON_HOLD' ? 'PENDING' : z.status} /></Td>
                  <Td className="font-mono text-[11px] text-muted-foreground">{z.reference}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
    </div>
  );
}
