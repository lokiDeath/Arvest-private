'use client';

// Loans — the lending pipeline.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAdminData, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatCurrency, formatDate, formatDateTime, useUI } from '@/lib/store';
import { PiggyBank, ClipboardCheck } from 'lucide-react';

interface Loan {
  id: string; loanType: string; amount: number; term: number; interestRate: number;
  monthlyPayment: number; remainingBalance: number; status: string; purpose: string | null;
  employer: string | null; annualIncome: number | null; approvedBy: string | null;
  approvedAt: string | null; decisionNote: string | null; createdAt: string;
  user: { id: string; name: string; email: string };
  account: { nickname: string; accountNumber: string } | null;
  payments: { id: string; amount: number; principal: number; interest: number; createdAt: string }[];
}

export function LoansView() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ loans: Loan[] }>(`/api/admin/loans?status=${status}`, [status]);
  const loans = (data?.loans ?? []).filter((l) =>
    !q || [l.loanType, l.user?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );
  void loans;

  const all = data?.loans ?? [];
  const filtered = all.filter((l) =>
    !q || [l.loanType, l.user?.name, l.purpose].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Loans"
        subtitle="Applications route through the Operations Queue; approving disburses through the ledger."
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Type, customer or purpose…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'PENDING', 'ACTIVE', 'PAID_OFF', 'REJECTED'].map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        filtered.length === 0 ? <EmptyState title="No loans" icon={PiggyBank} /> : (
          <DataTable minW={980}>
            <thead>
              <tr>
                <Th>Applied</Th><Th>Customer</Th><Th>Type</Th><Th right>Principal</Th>
                <Th>Term / APR</Th><Th right>Monthly</Th><Th right>Outstanding</Th>
                <Th>Status</Th><Th>Payments</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDate(l.createdAt)}</Td>
                  <Td>
                    <button className="text-xs hover:underline text-left" onClick={() => adminNavigate('customer-detail', { id: l.user.id })}>
                      <div className="font-medium text-[13px]">{l.user.name}</div>
                      <div className="text-[11px] text-muted-foreground">{l.purpose ? l.purpose.slice(0, 40) : l.employer ?? ''}</div>
                    </button>
                  </Td>
                  <Td><Badge variant="outline" className="text-[10px]">{l.loanType}</Badge></Td>
                  <Td right className="font-medium">{formatCurrency(l.amount)}</Td>
                  <Td className="text-xs">{l.term} mo · {l.interestRate.toFixed(2)}%</Td>
                  <Td right>{formatCurrency(l.monthlyPayment)}</Td>
                  <Td right className="font-medium">{formatCurrency(l.remainingBalance)}</Td>
                  <Td>
                    <div className="space-y-1">
                      <StatusPill status={l.status} />
                      {l.status === 'PENDING' && (
                        <button className="block text-[11px] text-primary hover:underline" onClick={() => adminNavigate('approvals')}>
                          <ClipboardCheck className="inline w-3 h-3 mr-1" /> Review in queue
                        </button>
                      )}
                      {l.status === 'REJECTED' && l.decisionNote && <div className="text-[10px] text-muted-foreground italic max-w-[140px]">{l.decisionNote}</div>}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {l.payments.length === 0 ? '—' : (
                      <div className="space-y-0.5">
                        {l.payments.slice(0, 2).map((p) => (
                          <div key={p.id}>{formatCurrency(p.amount)} · {formatDateTime(p.createdAt)}</div>
                        ))}
                        {l.payments.length > 2 && <div>+{l.payments.length - 2} more</div>}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
    </div>
  );
}
