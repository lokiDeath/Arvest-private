'use client';

// Transfers — internal & external transfer oversight.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAdminData, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatDateTime, useUI } from '@/lib/store';
import { ClipboardCheck, Undo2 } from 'lucide-react';

interface Transfer {
  id: string; reference: string; date: string; description: string;
  counterparty: string | null; memo: string | null; status: string; kind: string;
  meta: Record<string, unknown>;
  amount: number; account: string | null;
  customer: { id: string; name: string; email: string } | null;
  approvalId: string | null;
}

export function TransfersView() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ transfers: Transfer[] }>(
    `/api/admin/transfers?status=${status}`,
    [status]
  );
  const transfers = (data?.transfers ?? []).filter((t) =>
    !q || [t.description, t.counterparty, t.reference, t.customer?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Transfers" subtitle="Internal and external transfers, including holds and releases." />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search transfers…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'POSTED', 'PENDING', 'DECLINED', 'REVERSED', 'FLAGGED'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        transfers.length === 0 ? <EmptyState title="No transfers" /> : (
          <DataTable minW={900}>
            <thead>
              <tr><Th>Date</Th><Th>Customer</Th><Th>Description</Th><Th>To / From</Th><Th>Kind</Th><Th right>Amount</Th><Th>Status</Th><Th>Reference</Th><Th /></tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(t.date)}</Td>
                  <Td>
                    {t.customer ? (
                      <button className="text-xs hover:underline" onClick={() => adminNavigate('customer-detail', { id: t.customer!.id })}>{t.customer.name}</button>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </Td>
                  <Td className="text-[13px] max-w-[220px]"><div className="truncate">{t.description}</div></Td>
                  <Td className="text-xs">{t.counterparty ?? '—'}</Td>
                  <Td><Badge variant="outline" className="text-[10px]">{t.kind}</Badge></Td>
                  <Td right className="font-medium">{t.kind === 'RELEASE' ? '+' : '−'}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.amount)}</Td>
                  <Td><StatusPill status={t.status} /></Td>
                  <Td className="font-mono text-[11px] text-muted-foreground">{t.reference}</Td>
                  <Td>
                    {t.approvalId && t.status === 'PENDING' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => adminNavigate('approvals')}>
                        <ClipboardCheck className="w-3 h-3 mr-1" /> Review
                      </Button>
                    )}
                    {t.status === 'REVERSED' && <Undo2 className="w-3.5 h-3.5 text-purple-500" />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
    </div>
  );
}
