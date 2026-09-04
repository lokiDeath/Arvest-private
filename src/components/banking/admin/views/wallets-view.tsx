'use client';

// Wallets — sandbox wallet oversight (clearly labeled demo module).
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  useAdminData, PageHeader, StatusPill, DataTable, Th, Td, SearchInput, LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatDateTime, useUI } from '@/lib/store';
import { Wallet } from 'lucide-react';

interface WalletRow {
  id: string; walletType: string; address: string; balance: number; label: string | null; status: string; updatedAt: string;
  user: { id: string; name: string; email: string; status: string };
  transactions: { id: string; type: string; amount: number; currency: string; status: string; counterparty: string | null; sandboxRef: string | null; date: string }[];
}

export function WalletsView() {
  const [q, setQ] = useState('');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ wallets: WalletRow[] }>('/api/admin/wallets');
  const wallets = (data?.wallets ?? []).filter((w) =>
    !q || [w.address, w.label, w.walletType, w.user?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Wallets"
        subtitle="Sandbox digital wallets — a clearly labeled demonstration module. Balances live outside the bank ledger."
      />
      <SearchInput value={q} onChange={setQ} placeholder="Handle, type or customer…" />
      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        wallets.length === 0 ? <EmptyState title="No sandbox wallets" icon={Wallet} /> : (
          <DataTable minW={900}>
            <thead>
              <tr><Th>Customer</Th><Th>Wallet</Th><Th>Handle</Th><Th right>Balance</Th><Th>Status</Th><Th>Recent activity</Th><Th>Updated</Th></tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id} className="hover:bg-muted/30">
                  <Td>
                    <button className="text-xs hover:underline text-left" onClick={() => adminNavigate('customer-detail', { id: w.user.id })}>
                      <div className="font-medium text-[13px]">{w.user.name}</div>
                      <div className="text-[11px] text-muted-foreground">{w.user.email}</div>
                    </button>
                  </Td>
                  <Td>
                    <div className="text-[13px] font-medium">{w.label ?? `${w.walletType} Sandbox`}</div>
                    <Badge variant="outline" className="text-[9px] mt-0.5">SANDBOX</Badge>
                  </Td>
                  <Td className="font-mono text-[11px]">{w.address}</Td>
                  <Td right className="font-medium font-mono-balance">{w.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {w.walletType}</Td>
                  <Td><StatusPill status={w.status} /></Td>
                  <Td className="text-[11px] text-muted-foreground">
                    {w.transactions.length === 0 ? '—' : w.transactions.slice(0, 2).map((t) => (
                      <div key={t.id}>{t.type} {t.amount} {t.currency} · {t.status}{t.sandboxRef ? ` · ${t.sandboxRef}` : ''}</div>
                    ))}
                  </Td>
                  <Td className="text-xs text-muted-foreground">{formatDateTime(w.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
    </div>
  );
}
