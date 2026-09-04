'use client';

// Accounts — every bank account in the institution.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState, ReasonDialog,
} from '../admin-primitives';
import { formatCurrency, formatDate, useUI } from '@/lib/store';
import { Landmark, ArrowDownLeft, ArrowUpRight, PauseCircle, PlayCircle } from 'lucide-react';

interface Acct {
  id: string; type: string; nickname: string; accountNumber: string; routingNumber: string;
  balance: number; available: number; held: number; status: string; createdAt: string;
  user: { id: string; name: string; email: string; status: string };
}

export function AccountsView() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ accounts: Acct[] }>(
    `/api/admin/accounts?q=${encodeURIComponent(q)}&status=${status}`,
    [q, status]
  );

  const [adjust, setAdjust] = useState<{ acct: Acct; direction: 'CREDIT' | 'DEBIT' } | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const accounts = data?.accounts ?? [];
  const totals = accounts.reduce((s, a) => ({ bal: s.bal + a.balance, avail: s.avail + a.available, held: s.held + a.held }), { bal: 0, avail: 0, held: 0 });

  async function postAdjust(reason: string) {
    if (!adjust) return;
    setBusy(true);
    const res = await adminSend('/api/admin/accounts', 'POST', {
      action: 'ADJUST', accountId: adjust.acct.id, direction: adjust.direction,
      amount: parseFloat(amount), reason,
    });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(`Adjustment ${res.data.reference} posted`);
    setAdjust(null); setAmount('');
    reload();
  }

  async function setAccountStatus(a: Acct, next: string) {
    setBusy(true);
    const res = await adminSend('/api/admin/accounts', 'POST', { action: 'SET_STATUS', accountId: a.id, status: next });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(`${a.nickname} → ${next.toLowerCase()}`);
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        subtitle={`${formatCurrency(totals.bal, { cents: false })} total · ${formatCurrency(totals.held, { cents: false })} held across ${accounts.length} accounts`}
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Account, nickname or owner…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="FROZEN">Frozen</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        accounts.length === 0 ? <EmptyState title="No accounts" icon={Landmark} /> : (
          <DataTable minW={980}>
            <thead>
              <tr>
                <Th>Owner</Th><Th>Account</Th><Th>Type</Th>
                <Th right>Balance</Th><Th right>Available</Th><Th right>Held</Th>
                <Th>Status</Th><Th>Opened</Th><Th className="w-56">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <Td>
                    <button className="text-left hover:underline" onClick={() => adminNavigate('customer-detail', { id: a.user.id })}>
                      <div className="font-medium text-[13px]">{a.user.name}</div>
                      <div className="text-[11px] text-muted-foreground">{a.user.email}</div>
                    </button>
                  </Td>
                  <Td className="font-mono text-xs">••••{a.accountNumber.slice(-4)}</Td>
                  <Td className="text-xs">{a.type.replace('_', ' ')}</Td>
                  <Td right className="font-medium">{formatCurrency(a.balance)}</Td>
                  <Td right className="text-emerald-700">{formatCurrency(a.available)}</Td>
                  <Td right className={a.held > 0 ? 'text-amber-700' : 'text-muted-foreground'}>{formatCurrency(a.held)}</Td>
                  <Td><StatusPill status={a.status} /></Td>
                  <Td className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1.5 flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={a.status === 'CLOSED'} onClick={() => { setAdjust({ acct: a, direction: 'CREDIT' }); }}>
                        <ArrowDownLeft className="w-3 h-3 mr-1 text-emerald-600" /> Credit
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={a.status === 'CLOSED'} onClick={() => setAdjust({ acct: a, direction: 'DEBIT' })}>
                        <ArrowUpRight className="w-3 h-3 mr-1" /> Debit
                      </Button>
                      {a.status === 'ACTIVE' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAccountStatus(a, 'FROZEN')}>
                          <PauseCircle className="w-3 h-3" />
                        </Button>
                      )}
                      {a.status === 'FROZEN' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAccountStatus(a, 'ACTIVE')}>
                          <PlayCircle className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

      <ReasonDialog
        open={!!adjust}
        title={`${adjust?.direction === 'CREDIT' ? 'Credit' : 'Debit'} ${adjust?.acct.nickname ?? ''} (••${adjust?.acct.accountNumber.slice(-4) ?? ''})`}
        description="Posts a double-entry ADJUSTMENT through the ledger — never a silent balance overwrite. The customer is notified and the audit log records your reason."
        confirmLabel={adjust?.direction === 'CREDIT' ? 'Post credit' : 'Post debit'}
        destructive={adjust?.direction === 'DEBIT'}
        busy={busy}
        amountField={{ label: 'Amount (USD)', value: amount, onChange: setAmount, placeholder: '0.00' }}
        noteLabel="Reason (required)"
        onCancel={() => { setAdjust(null); setAmount(''); }}
        onConfirm={postAdjust}
      />
    </div>
  );
}
