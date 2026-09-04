'use client';

// Risk / Review — flags, frozen accounts, failed logins, velocity.
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useAdminData, PageHeader, StatusPill, LoadingBlock, ErrorState, EmptyState, SectionCard,
} from '../admin-primitives';
import { formatCurrency, formatDateTime, useUI } from '@/lib/store';
import { ShieldAlert, Snowflake, LogIn, Gauge, Flag } from 'lucide-react';

interface Risk {
  thresholds: { largeTxFlagUsd: number };
  pendingQueue: number;
  flagged: { id: string; reference: string; date: string; description: string; category: string; amount: number; customer: string | null }[];
  frozen: { id: string; name: string; email: string; loginId: string | null; lastLoginAt: string | null }[];
  failedLogins24h: number;
  failedByIp: { ip: string; count: number }[];
  largeTxns: { id: string; reference: string; date: string; description: string; amount: number; status: string; customer: string | null }[];
  velocity: { customer: { id: string; name: string; email: string } | undefined; count: number }[];
}

export function RiskView() {
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<Risk>('/api/admin/risk');

  if (loading) return <LoadingBlock rows={6} />;
  if (error || !data) return <ErrorState message={error ?? 'Failed to load'} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Risk / Review"
        subtitle={`Flagged items, large movements (≥ ${formatCurrency(data.thresholds.largeTxFlagUsd, { cents: false })}) and authentication anomalies.`}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Flagged transactions" value={data.flagged.length} warn={data.flagged.length > 0} icon={Flag} />
        <Kpi label="Failed sign-ins (24h)" value={data.failedLogins24h} warn={data.failedLogins24h > 10} icon={LogIn} />
        <Kpi label="Frozen customers" value={data.frozen.length} icon={Snowflake} />
        <Kpi label="Queue pending" value={data.pendingQueue} warn={data.pendingQueue > 0} icon={Gauge} onClick={() => adminNavigate('approvals')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Flagged transactions" sub="Posted movements under compliance review" action={<Button1 onClick={() => adminNavigate('transactions')}>Open ledger</Button1>}>
          {data.flagged.length === 0 ? <EmptyState title="Nothing flagged" icon={ShieldAlert} /> : (
            <div className="divide-y divide-border">
              {data.flagged.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{tx.description}</div>
                    <div className="text-[11px] text-muted-foreground">{tx.customer ?? '—'} · {formatDateTime(tx.date)} · {tx.reference}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-semibold font-mono-balance">{formatCurrency(tx.amount)}</div>
                    <StatusPill status="FLAGGED" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Largest recent movements" sub="Above the large-transaction threshold">
          {data.largeTxns.length === 0 ? <EmptyState title="No large movements" /> : (
            <div className="divide-y divide-border">
              {data.largeTxns.slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{tx.description}</div>
                    <div className="text-[11px] text-muted-foreground">{tx.customer ?? '—'} · {formatDateTime(tx.date)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-semibold font-mono-balance">{formatCurrency(tx.amount)}</div>
                    <StatusPill status={tx.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Failed sign-ins by IP (24h)" sub="Repeated failures may indicate credential stuffing">
          {data.failedByIp.length === 0 ? <EmptyState title="No failed sign-ins" icon={LogIn} /> : (
            <div className="space-y-1.5">
              {data.failedByIp.map((f) => (
                <div key={f.ip} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{f.ip}</span>
                  <Badge variant={f.count > 5 ? 'destructive' : 'outline'}>{f.count} attempts</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Frozen accounts" sub="Access suspended by the bank" action={<Button1 onClick={() => adminNavigate('customers')}>Customers</Button1>}>
          {data.frozen.length === 0 ? <EmptyState title="No frozen accounts" icon={Snowflake} /> : (
            <div className="space-y-2">
              {data.frozen.map((u) => (
                <button key={u.id} className="w-full flex items-center justify-between p-2 rounded-md border border-border hover:bg-muted/40 text-left" onClick={() => adminNavigate('customer-detail', { id: u.id })}>
                  <div>
                    <div className="text-[13px] font-medium">{u.name}</div>
                    <div className="text-[11px] text-muted-foreground">{u.email} · {u.loginId ?? '—'}</div>
                  </div>
                  <StatusPill status="FROZEN" />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, warn, icon: Icon, onClick }: { label: string; value: number; warn?: boolean; icon: typeof Flag; onClick?: () => void }) {
  const W = onClick ? 'button' : 'div';
  return (
    <Card className={onClick ? 'cursor-pointer hover:border-primary/40' : ''} onClick={onClick}>
      <CardContent className={warn ? 'p-4 border-amber-500/40' : 'p-4'}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${warn ? 'text-amber-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Button1({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="text-xs text-primary hover:underline" onClick={onClick}>{children}</button>
  );
}
