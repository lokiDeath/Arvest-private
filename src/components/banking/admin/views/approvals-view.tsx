'use client';

// Operations Queue — every item waiting on a manager decision.
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { SegmentedTabs } from '../segmented-tabs';
import {
  useAdminData, adminSend, PageHeader, StatusPill, LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatCurrency, formatDateTime, useUI } from '@/lib/store';
import { toast } from 'sonner';
import {
  Smartphone, Landmark, Receipt, PiggyBank, Wallet, CheckCircle2, XCircle,
  Loader2, User, FileImage, ChevronRight,
} from 'lucide-react';

interface Approval {
  id: string;
  type: string;
  reference: string;
  userId: string | null;
  amount: number;
  payload: string;
  status: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; loginId: string | null; status: string } | null;
}

const TYPE_META: Record<string, { label: string; icon: typeof Smartphone; cls: string }> = {
  CHECK_DEPOSIT: { label: 'Mobile deposit', icon: Smartphone, cls: 'bg-emerald-100 text-emerald-700' },
  EXTERNAL_TRANSFER: { label: 'External transfer', icon: Landmark, cls: 'bg-sky-100 text-sky-700' },
  ZELLE: { label: 'Zelle', icon: Smartphone, cls: 'bg-purple-100 text-purple-700' },
  BILLPAY: { label: 'Bill payment', icon: Receipt, cls: 'bg-amber-100 text-amber-700' },
  LOAN: { label: 'Loan application', icon: PiggyBank, cls: 'bg-primary/10 text-primary' },
  WALLET_SEND: { label: 'Sandbox wallet send', icon: Wallet, cls: 'bg-indigo-100 text-indigo-700' },
  ACCOUNT_OPENING: { label: 'Account opening', icon: Landmark, cls: 'bg-teal-100 text-teal-700' },
};

export function ApprovalsView() {
  const [tab, setTab] = useState('PENDING');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openImages, setOpenImages] = useState<string | null>(null);
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ approvals: Approval[]; counts: Record<string, number> }>(
    `/api/admin/approvals?status=${tab}`,
    [tab]
  );

  async function decide(a: Approval, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(a.id);
    const res = await adminSend(`/api/admin/approvals/${a.id}`, 'POST', { decision, note: note.trim() || undefined });
    setBusyId(null);
    if (!res.ok) {
      toast.error(String(res.data.error ?? 'Decision failed'));
      return;
    }
    toast.success(`${decision === 'APPROVED' ? 'Approved' : 'Rejected'}: ${res.data.message ?? a.reference}`);
    setNote('');
    reload();
  }

  async function showCheckImages(a: Approval) {
    if (openImages === a.id) { setOpenImages(null); return; }
    // Check deposits store images on the deposit record — fetch them
    const res = await adminSend(`/api/admin/customers/${a.userId}`, 'GET');
    setOpenImages(a.id);
    void res;
  }

  const approvals = data?.approvals ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operations Queue"
        subtitle="Transfers, deposits, loans and other items awaiting a manager decision. Decisions settle or release held funds atomically."
      />

      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v)}
        items={[
          { value: 'PENDING', label: `Pending${data?.counts?.PENDING ? ` (${data.counts.PENDING})` : ''}` },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'ALL', label: 'All' },
        ]}
      />

      {tab === 'PENDING' && (
        <Card>
          <CardContent className="p-4">
            <label className="text-xs font-medium">Decision note (optional — attached to your next decision)</label>
            <Textarea rows={2} className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Verified with customer by phone" />
          </CardContent>
        </Card>
      )}

      {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState message={error} onRetry={reload} /> :
        approvals.length === 0 ? (
          <EmptyState title={tab === 'PENDING' ? 'Queue is clear' : 'Nothing here'} sub={tab === 'PENDING' ? 'No items awaiting review.' : undefined} icon={CheckCircle2} />
        ) : (
          <div className="space-y-3">
            {approvals.map((a) => {
              const meta = TYPE_META[a.type] ?? { label: a.type, icon: Landmark, cls: 'bg-muted text-muted-foreground' };
              let payload: Record<string, unknown> = {};
              try { payload = JSON.parse(a.payload); } catch { /* ignore */ }
              const Icon = meta.icon;
              const busy = busyId === a.id;
              const recipient = String(payload.recipientName ?? payload.recipient ?? '');
              const kind = String(payload.kind ?? a.type);

              return (
                <Card key={a.id} className={a.status === 'PENDING' ? 'border-amber-200' : ''}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.cls}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{meta.label}</span>
                            <StatusPill status={a.status} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {recipient ? <>To <span className="font-medium text-foreground">{recipient}</span> · </> : null}
                            Ref {a.reference} · {formatDateTime(a.createdAt)}
                          </div>
                          {a.user && (
                            <button
                              className="text-xs text-primary hover:underline mt-0.5 inline-flex items-center gap-0.5"
                              onClick={() => adminNavigate('customer-detail', { id: a.user!.id })}
                            >
                              <User className="w-3 h-3" /> {a.user.name} ({a.user.loginId ?? a.user.email}) <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="md:text-right shrink-0">
                        <div className="text-lg font-semibold font-mono-balance">{formatCurrency(a.amount)}</div>
                        <div className="text-[11px] text-muted-foreground">requested by {a.requestedBy ?? '—'}</div>
                      </div>

                      {a.status === 'PENDING' ? (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" className="arvest-gradient text-white" disabled={busy} onClick={() => decide(a, 'APPROVED')}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => decide(a, 'REJECTED')}>
                            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="md:text-right shrink-0 text-xs text-muted-foreground">
                          <div>by {a.decidedBy ?? '—'}</div>
                          <div>{a.decidedAt ? formatDateTime(a.decidedAt) : ''}</div>
                          {a.decisionNote && <div className="italic max-w-[240px] md:ml-auto">“{a.decisionNote}”</div>}
                        </div>
                      )}
                    </div>

                    {/* payload specifics */}
                    <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {payload.accountMask ? <Badge variant="outline">Account {String(payload.accountMask)}</Badge> : null}
                      {payload.fromAccountMask ? <Badge variant="outline">From {String(payload.fromAccountMask)}</Badge> : null}
                      {payload.recipient ? <Badge variant="outline">Contact {String(payload.recipient)}</Badge> : null}
                      {payload.monthlyPayment ? <Badge variant="outline">≈ {formatCurrency(Number(payload.monthlyPayment))}/mo · {String(payload.term ?? '')} mo · {String(payload.interestRate ?? '')}% APR</Badge> : null}
                      {payload.purpose ? <span className="italic">“{String(payload.purpose)}”</span> : null}
                      {kind === 'CHECK_DEPOSIT' && (
                        <button className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => adminNavigate('deposits')}>
                          <FileImage className="w-3 h-3" /> Review check images
                        </button>
                      )}
                      {a.status === 'PENDING' && kind === 'CHECK_DEPOSIT' && (
                        <button className="text-primary hover:underline" onClick={() => showCheckImages(a)}>
                          {openImages === a.id ? 'Hide details' : 'Quick details'}
                        </button>
                      )}
                    </div>
                    {openImages === a.id && (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Front image received: {payload.hasFront ? 'yes' : 'no'} · Back image received: {payload.hasBack ? 'yes' : 'no'} ·
                        Deposit id: {String(payload.depositId ?? '—')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
