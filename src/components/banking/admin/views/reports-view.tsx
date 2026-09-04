'use client';

// Statements / Reports — bank-level reporting with CSV export.
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  useAdminData, PageHeader, SectionCard, LoadingBlock, ErrorState,
} from '../admin-primitives';
import { formatCurrency, formatDateTime, useUI } from '@/lib/store';
import { Download, FileBarChart2 } from 'lucide-react';

interface Report {
  windowDays: number;
  generatedAt: string;
  customers: number;
  deposits: {
    total: number; available: number; held: number;
    byAccountType: { type: string; total: number }[];
  };
  activity: {
    credits: number; debits: number; transactionCount: number;
    byCategory: { category: string; count: number; volume: number }[];
  };
  loanPortfolio: {
    activeCount: number; pendingCount: number; outstanding: number; disbursed: number;
    paymentsCollected: number; interestCollected: number;
  };
}

export function ReportsView() {
  const [period, setPeriod] = useState('30');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ report: Report }>(`/api/admin/reports?window=${period}`, [period]);

  const r = data?.report;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Statements / Reports"
        subtitle="Institution-level reporting over the double-entry ledger."
        action={
          <>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 365 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => window.location.assign(`/api/admin/reports?window=${period}&format=csv`)}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </>
        }
      />

      {loading ? <LoadingBlock rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> :
        !r ? <ErrorState message="No report data" /> : (
          <div className="space-y-5">
            <div className="text-xs text-muted-foreground">Generated {formatDateTime(r.generatedAt)} · {r.windowDays}-day window · {r.customers} customers</div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <SectionCard title="Deposits" sub="Book balances vs availability">
                <Row label="Total deposits" value={formatCurrency(r.deposits.total)} strong />
                <Row label="Available" value={formatCurrency(r.deposits.available)} />
                <Row label="Held" value={formatCurrency(r.deposits.held)} />
                <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                  {r.deposits.byAccountType.map((t) => (
                    <Row key={t.type} label={t.type.replace('_', ' ')} value={formatCurrency(t.total)} small />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Activity" sub={`${r.windowDays}-day money movement`}>
                <Row label="Total credits" value={formatCurrency(r.activity.credits)} strong />
                <Row label="Total debits" value={formatCurrency(r.activity.debits)} strong />
                <Row label="Transactions" value={String(r.activity.transactionCount)} />
                <div className="mt-4 pt-3 border-t border-border space-y-1.5 max-h-48 overflow-y-auto arvest-scroll">
                  {r.activity.byCategory.slice(0, 8).map((c) => (
                    <Row key={c.category} label={`${c.category} (${c.count})`} value={formatCurrency(c.volume)} small />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Loan portfolio" sub="Active book & collections">
                <Row label="Active loans" value={String(r.loanPortfolio.activeCount)} />
                <Row label="Pending applications" value={String(r.loanPortfolio.pendingCount)} />
                <Row label="Outstanding principal" value={formatCurrency(r.loanPortfolio.outstanding)} strong />
                <Row label="Disbursed all-time" value={formatCurrency(r.loanPortfolio.disbursed)} />
                <Row label="Payments collected" value={formatCurrency(r.loanPortfolio.paymentsCollected)} />
                <Row label="Interest collected" value={formatCurrency(r.loanPortfolio.interestCollected)} />
              </SectionCard>
            </div>

            <SectionCard title="Statement generation" sub="Customer statements are produced per account with reconciled opening/closing balances">
              <button className="text-sm text-primary hover:underline" onClick={() => adminNavigate('customers')}>
                Open a customer → select an account → generate its statement
              </button>
            </SectionCard>
          </div>
        )}
    </div>
  );
}

function Row({ label, value, strong, small }: { label: string; value: string; strong?: boolean; small?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={`${small ? 'text-[11px]' : 'text-[13px]'} text-muted-foreground`}>{label}</span>
      <span className={`${strong ? 'font-semibold' : 'font-medium'} ${small ? 'text-xs' : 'text-[13px]'} font-mono-balance`}>{value}</span>
    </div>
  );
}
