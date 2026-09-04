'use client';

// Audit Log — every privileged action with filters.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAdminData, PageHeader, DataTable, Th, Td, SearchInput, LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatDateTime } from '@/lib/store';
import { ScrollText } from 'lucide-react';

interface Log {
  id: string; actor: string; action: string; detail: string | null; ip: string | null; createdAt: string;
  user: { name: string } | null;
}

const ACTION_STYLE: Record<string, string> = {
  LOGIN: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  LOGOUT: 'border-border',
  ADMIN_ADJUSTMENT: 'text-amber-700 border-amber-200 bg-amber-50',
  ADMIN_REVERSE: 'text-purple-700 border-purple-200 bg-purple-50',
  ADMIN_FREEZE_USER: 'text-orange-700 border-orange-200 bg-orange-50',
  ADMIN_UNFREEZE_USER: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  ADMIN_APPROVAL_APPROVED: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  ADMIN_APPROVAL_REJECTED: 'text-red-700 border-red-200 bg-red-50',
  CARD_REVEALED: 'text-red-700 border-red-200 bg-red-50',
  PASSWORD_RESET: 'text-amber-700 border-amber-200 bg-amber-50',
};

export function AuditView() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('ALL');
  const { data, loading, error, reload } = useAdminData<{ logs: Log[]; actions: { action: string; count: number }[] }>(
    `/api/admin/audit?action=${action}&q=${encodeURIComponent(q)}`,
    [action, q]
  );

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Log" subtitle="Immutable record of privileged actions: approvals, adjustments, reversals, card access, settings and auth events." />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Actor, action or detail…" />
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-9 w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {(data?.actions ?? []).map((a) => (
              <SelectItem key={a.action} value={a.action}>{a.action.replace(/_/g, ' ')} ({a.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto self-center">{logs.length} entries</span>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        logs.length === 0 ? <EmptyState title="No audit entries" icon={ScrollText} /> : (
          <DataTable minW={860}>
            <thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Detail</Th><Th>IP</Th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                  <Td className="text-xs font-medium">{l.actor}</Td>
                  <Td>
                    <Badge variant="outline" className={`text-[10px] ${ACTION_STYLE[l.action] ?? ''}`}>
                      {l.action.replace(/_/g, ' ')}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-muted-foreground max-w-[420px]"><div className="truncate">{l.detail ?? '—'}</div></Td>
                  <Td className="text-xs font-mono text-muted-foreground">{l.ip ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
    </div>
  );
}
