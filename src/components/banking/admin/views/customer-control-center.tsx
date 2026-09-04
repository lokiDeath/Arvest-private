'use client';

// ============================================================
// Customer Control Center — one bank manager, one customer,
// the entire relationship. Reached from Customers / Accounts /
// Queue with adminParams.id.
// ============================================================
import { useState } from 'react';
import { useParamsFromStore } from '../use-params';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, StatusPill, LoadingBlock, ErrorState, EmptyState,
  ReasonDialog, ConfirmDialog, SectionCard, DataTable, Th, Td,
} from '../admin-primitives';
import { formatCurrency, formatDate, formatDateTime, useUI } from '@/lib/store';
import {
  ArrowLeft, Snowflake, Unlock, KeyRound, Wallet as WalletIcon, PiggyBank, Sparkles, CreditCard,
  Plus, Landmark, Smartphone, Receipt, Banknote, MessagesSquare, ShieldCheck, ScrollText,
  ChevronRight, Eye, Send, RefreshCw, ArrowDownLeft, ArrowUpRight, FileBarChart2,
} from 'lucide-react';

interface Bundle {
  customer: {
    id: string; name: string; email: string; loginId: string | null; status: string;
    phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null;
    lastLoginAt: string | null; createdAt: string;
  };
  accounts: Acct[];
  transactions: Tx[];
  zelle: Zelle[];
  bills: Bill[];
  deposits: Dep[];
  cards: CardT[];
  loans: LoanT[];
  wallets: WalletT[];
  messages: Msg[];
  appointments: Appt[];
  notifications: Note[];
  securityEvents: Sec[];
  auditLogs: AuditE[];
  alerts: AlertT[];
}
interface Acct { id: string; type: string; nickname: string; accountNumber: string; routingNumber: string; balance: number; available: number; held: number; status: string; }
interface Tx { id: string; reference: string; date: string; description: string; category: string; type: string; counterparty: string | null; memo: string | null; status: string; direction: string; amount: number; }
interface Zelle { id: string; recipientName: string; recipientEmail: string | null; recipientPhone: string | null; amount: number; status: string; reference: string; createdAt: string; }
interface Bill { id: string; payee: string; amount: number; status: string; reference: string; payDate: string; account: { nickname: string } | null; }
interface Dep { id: string; amount: number; status: string; reference: string; createdAt: string; account: { nickname: string } | null; checkNumber: string | null; }
interface CardT { id: string; cardType: string; network: string; cardLast4: string; cardholder: string; status: string; issuedBy: string; color: string; creditLimit: number; expiryMonth: number; expiryYear: number; }
interface LoanT { id: string; loanType: string; amount: number; term: number; interestRate: number; monthlyPayment: number; remainingBalance: number; status: string; createdAt: string; }
interface WalletT { id: string; walletType: string; address: string; balance: number; label: string | null; }
interface Msg { id: string; subject: string; body: string; fromBank: boolean; read: boolean; createdAt: string; }
interface Appt { id: string; type: string; topic: string; date: string; status: string; }
interface Note { id: string; title: string; body: string; createdAt: string; read: boolean; }
interface Sec { id: string; type: string; ip: string | null; detail: string | null; createdAt: string; }
interface AuditE { id: string; actor: string; action: string; detail: string | null; createdAt: string; }
interface AlertT { id: string; type: string; threshold: number | null; enabled: boolean; account: { nickname: string } | null; }

const TABS = [
  ['overview', 'Overview'], ['accounts', 'Accounts'], ['transactions', 'Transactions'],
  ['transfers', 'Transfers'], ['zelle', 'Zelle'], ['bills', 'Bill Pay'], ['deposits', 'Deposits'],
  ['cards', 'Cards'], ['loans', 'Loans'], ['wallets', 'Wallets'], ['messages', 'Messages'],
  ['security', 'Security'], ['activity', 'Activity'],
] as const;

const ACCT_ICON: Record<string, typeof WalletIcon> = { CHECKING: WalletIcon, SAVINGS: PiggyBank, PRIVATE_CLIENT: Sparkles };

export function CustomerControlCenter() {
  const customerId = useParamsFromStore('customer-detail');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const [tab, setTab] = useState<string>('overview');
  const { data, loading, error, reload } = useAdminData<Bundle>(customerId ? `/api/admin/customers/${customerId}` : null, [customerId]);
  const [busy, setBusy] = useState(false);

  // dialog state
  const [adjust, setAdjust] = useState<{ acct: Acct; direction: 'CREDIT' | 'DEBIT' } | null>(null);
  const [amount, setAmount] = useState('');
  const [hold, setHold] = useState<{ acct: Acct; mode: 'HOLD' | 'RELEASE' } | null>(null);
  const [openAcct, setOpenAcct] = useState(false);
  const [openForm, setOpenForm] = useState({ type: 'CHECKING', nickname: '', initialDeposit: '' });
  const [issueCard, setIssueCard] = useState(false);
  const [cardForm, setCardForm] = useState({ cardType: 'DEBIT', network: 'VISA', color: 'CRIMSON', creditLimit: '25000', accountId: '' });
  const [oneTime, setOneTime] = useState<{ cardNumber: string; cvv: string; pin: string } | null>(null);
  const [compose, setCompose] = useState(false);
  const [msgForm, setMsgForm] = useState({ subject: '', body: '' });
  const [reply, setReply] = useState<Msg | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [confirmPw, setConfirmPw] = useState(false);
  const [newPw, setNewPw] = useState<string | null>(null);
  const [freeze, setFreeze] = useState(false);
  const [loanDecide, setLoanDecide] = useState<{ loan: LoanT; decision: 'APPROVED' | 'REJECTED' } | null>(null);

  if (!customerId) return <ErrorState message="No customer selected" />;
  if (loading) return <LoadingBlock rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'Failed to load'} onRetry={reload} />;

  const c = data.customer;
  const totals = {
    balance: data.accounts.reduce((s, a) => s + a.balance, 0),
    available: data.accounts.reduce((s, a) => s + a.available, 0),
    held: data.accounts.reduce((s, a) => s + a.held, 0),
  };

  async function run(fn: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, okMsg: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Action failed')); return false; }
    toast.success(okMsg);
    reload();
    return true;
  }

  const adjustDialog = (
    <ReasonDialog
      open={!!adjust}
      title={`${adjust?.direction === 'CREDIT' ? 'Credit' : 'Debit'} ${adjust?.acct.nickname ?? ''}`}
      description={`Posts a double-entry ADJUSTMENT through the ledger — never a silent balance overwrite. Customer is notified.`}
      confirmLabel={`Post ${adjust?.direction === 'CREDIT' ? 'credit' : 'debit'}`}
      busy={busy}
      amountField={{ label: 'Amount (USD)', value: amount, onChange: setAmount, placeholder: '0.00' }}
      noteLabel="Reason (required)"
      onCancel={() => { setAdjust(null); setAmount(''); }}
      onConfirm={async (note) => {
        if (!adjust) return;
        const done = await run(
          () => adminSend('/api/admin/accounts', 'POST', { action: 'ADJUST', accountId: adjust.acct.id, direction: adjust.direction, amount: parseFloat(amount), reason: note }),
          'Adjustment posted'
        );
        if (done) { setAdjust(null); setAmount(''); }
      }}
    />
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" className="mt-1" onClick={() => adminNavigate('customers')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
              <StatusPill status={c.status} />
            </div>
            <div className="text-[13px] text-muted-foreground mt-0.5">
              {c.email} · Login ID <span className="font-mono">{c.loginId ?? '—'}</span>
              {c.phone ? ` · ${c.phone}` : ''}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Client since {formatDate(c.createdAt)} · last sign-in {c.lastLoginAt ? formatDateTime(c.lastLoginAt) : 'never'}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {c.status === 'ACTIVE' ? (
            <Button variant="outline" size="sm" onClick={() => setFreeze(true)}>
              <Snowflake className="w-3.5 h-3.5 mr-1.5" /> Freeze
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => run(() => adminSend('/api/admin/customers', 'POST', { action: 'SET_STATUS', id: c.id, status: 'ACTIVE' }), 'Customer restored')}>
              <Unlock className="w-3.5 h-3.5 mr-1.5" /> Unfreeze
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setConfirmPw(true); setNewPw(null); }}>
            <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Reset password
          </Button>
          <Button size="sm" className="arvest-gradient text-white" onClick={() => setOpenAcct(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Open account
          </Button>
        </div>
      </div>

      {/* Money summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total deposits</div>
          <div className="text-lg font-semibold font-mono-balance">{formatCurrency(totals.balance)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Available</div>
          <div className="text-lg font-semibold font-mono-balance text-emerald-700">{formatCurrency(totals.available)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Held</div>
          <div className="text-lg font-semibold font-mono-balance text-amber-700">{formatCurrency(totals.held)}</div>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto arvest-scroll -mx-1 px-1">
          <TabsList className="h-9">
            {TABS.map(([v, l]) => <TabsTrigger key={v} value={v} className="text-xs">{l}</TabsTrigger>)}
          </TabsList>
        </div>
      </Tabs>

      {/* -------- OVERVIEW -------- */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Accounts" sub={`${data.accounts.length} open products`}>
            <div className="space-y-2">
              {data.accounts.map((a) => {
                const Icon = ACCT_ICON[a.type] ?? Landmark;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.nickname} <span className="font-mono text-[11px] text-muted-foreground">••{a.accountNumber.slice(-4)}</span></div>
                      <div className="text-[11px] text-muted-foreground">{a.type.replace('_', ' ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium font-mono-balance">{formatCurrency(a.balance)}</div>
                      <StatusPill status={a.status} />
                    </div>
                  </div>
                );
              })}
              {data.accounts.length === 0 && <EmptyState title="No accounts" icon={Landmark} />}
            </div>
          </SectionCard>

          <SectionCard title="Active loans" sub={`${data.loans.filter((l) => l.status === 'ACTIVE').length} active · ${data.loans.filter((l) => l.status === 'PENDING').length} pending`}>
            {data.loans.length === 0 ? <EmptyState title="No loans" icon={PiggyBank} /> : (
              <div className="space-y-2">
                {data.loans.slice(0, 5).map((l) => (
                  <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border">
                    <PiggyBank className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{l.loanType} · {formatCurrency(l.amount)}</div>
                      <div className="text-[11px] text-muted-foreground">{l.term} mo @ {l.interestRate.toFixed(2)}%</div>
                    </div>
                    <div className="text-right"><StatusPill status={l.status} /></div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Cards" sub={`${data.cards.length} issued/linked`}>
            {data.cards.length === 0 ? <EmptyState title="No cards" icon={CreditCard} /> : (
              <div className="space-y-2">
                {data.cards.slice(0, 5).map((cd) => (
                  <div key={cd.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border">
                    <CreditCard className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{cd.network} {cd.cardType} ••{cd.cardLast4}</div>
                      <div className="text-[11px] text-muted-foreground">{cd.issuedBy === 'ARVEST' ? 'Bank-issued' : 'External'}</div>
                    </div>
                    <StatusPill status={cd.status} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Latest security events" sub="Sign-ins and password changes">
            {data.securityEvents.length === 0 ? <EmptyState title="No events" icon={ShieldCheck} /> : (
              <div className="space-y-1.5">
                {data.securityEvents.slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.type === 'LOGIN' ? 'bg-emerald-500' : s.type === 'LOGIN_FAILED' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <span className="font-medium w-32 shrink-0">{s.type.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground truncate flex-1">{s.ip ?? ''} {s.detail ?? ''}</span>
                    <span className="text-muted-foreground shrink-0">{formatDateTime(s.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* -------- ACCOUNTS -------- */}
      {tab === 'accounts' && (
        <div className="space-y-3">
          {data.accounts.map((a) => {
            const Icon = ACCT_ICON[a.type] ?? Landmark;
            return (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-5 h-5 text-primary" /></div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{a.nickname} <Badge variant="outline" className="text-[9px]">{a.type.replace('_', ' ')}</Badge></div>
                        <div className="text-[11px] text-muted-foreground font-mono">••••{a.accountNumber.slice(-4)} · Routing {a.routingNumber}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-muted-foreground">Balance</div>
                        <div className="text-sm font-semibold font-mono-balance">{formatCurrency(a.balance)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-muted-foreground">Available</div>
                        <div className="text-sm font-semibold font-mono-balance text-emerald-700">{formatCurrency(a.available)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-muted-foreground">Held</div>
                        <div className="text-sm font-semibold font-mono-balance text-amber-700">{formatCurrency(a.held)}</div>
                      </div>
                      <StatusPill status={a.status} />
                    </div>
                    <div className="flex gap-2 flex-wrap shrink-0">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setAdjust({ acct: a, direction: 'CREDIT' }); }}>
                        <ArrowDownLeft className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Credit
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdjust({ acct: a, direction: 'DEBIT' })}>
                        <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Debit
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setHold({ acct: a, mode: 'HOLD' })}>Hold</Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={a.held <= 0} onClick={() => setHold({ acct: a, mode: 'RELEASE' })}>Release</Button>
                      {a.status !== 'CLOSED' && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => run(
                          () => adminSend('/api/admin/accounts', 'POST', { action: 'SET_STATUS', accountId: a.id, status: a.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN' }),
                          a.status === 'FROZEN' ? 'Account unfrozen' : 'Account frozen'
                        )}>
                          {a.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {data.accounts.length === 0 && <EmptyState title="No accounts yet" sub="Use “Open account” to create one." icon={Landmark} />}
        </div>
      )}

      {/* -------- TRANSACTIONS -------- */}
      {tab === 'transactions' && (
        <DataTable minW={820}>
          <thead>
            <tr><Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Reference</Th><Th>Status</Th><Th right>Amount</Th><Th right>Direction</Th></tr>
          </thead>
          <tbody>
            {data.transactions.slice(0, 80).map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <Td className="text-xs whitespace-nowrap">{formatDate(t.date)}</Td>
                <Td className="max-w-[260px]"><div className="truncate font-medium text-[13px]">{t.description}</div>{t.counterparty && <div className="text-[11px] text-muted-foreground truncate">{t.counterparty}</div>}</Td>
                <Td><Badge variant="outline" className="text-[10px]">{t.category}</Badge></Td>
                <Td className="font-mono text-[11px] text-muted-foreground">{t.reference}</Td>
                <Td><StatusPill status={t.status} /></Td>
                <Td right className={`font-medium ${t.direction === 'CREDIT' ? 'text-emerald-700' : ''}`}>{t.direction === 'CREDIT' ? '+' : '−'}{formatCurrency(t.amount)}</Td>
                <Td right className="text-xs">{t.direction}</Td>
              </tr>
            ))}
            {data.transactions.length === 0 && <tr><Td><EmptyState title="No transactions" /></Td></tr>}
          </tbody>
        </DataTable>
      )}

      {/* -------- TRANSFERS / ZELLE -------- */}
      {tab === 'transfers' && (
        <DataTable minW={760}>
          <thead><tr><Th>Date</Th><Th>Description</Th><Th>Counterparty</Th><Th>Reference</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {data.transactions.filter((t) => ['TRANSFER', 'ZELLE', 'HOLD', 'RELEASE'].includes(t.type ?? t.category)).length === 0 && data.transactions.slice(0, 40).length === 0 && (
              <tr><Td><EmptyState title="No transfers" /></Td></tr>
            )}
            {data.transactions.filter((t) => ['TRANSFER', 'ZELLE'].includes(t.category) || t.description.toLowerCase().includes('transfer')).slice(0, 50).map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <Td className="text-xs whitespace-nowrap">{formatDate(t.date)}</Td>
                <Td className="text-[13px]">{t.description}</Td>
                <Td className="text-xs">{t.counterparty ?? '—'}</Td>
                <Td className="font-mono text-[11px] text-muted-foreground">{t.reference}</Td>
                <Td><StatusPill status={t.status} /></Td>
                <Td right className={`font-medium ${t.direction === 'CREDIT' ? 'text-emerald-700' : ''}`}>{t.direction === 'CREDIT' ? '+' : '−'}{formatCurrency(t.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {tab === 'zelle' && (
        <DataTable minW={720}>
          <thead><tr><Th>Date</Th><Th>Recipient</Th><Th>Contact</Th><Th>Reference</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {data.zelle.map((z) => (
              <tr key={z.id} className="hover:bg-muted/30">
                <Td className="text-xs whitespace-nowrap">{formatDate(z.createdAt)}</Td>
                <Td className="text-[13px] font-medium">{z.recipientName}</Td>
                <Td className="text-xs">{z.recipientEmail ?? z.recipientPhone ?? '—'}</Td>
                <Td className="font-mono text-[11px] text-muted-foreground">{z.reference}</Td>
                <Td><StatusPill status={z.status === 'ON_HOLD' ? 'PENDING' : z.status} /></Td>
                <Td right className="font-medium">−{formatCurrency(z.amount)}</Td>
              </tr>
            ))}
            {data.zelle.length === 0 && <tr><Td><EmptyState title="No Zelle activity" icon={Smartphone} /></Td></tr>}
          </tbody>
        </DataTable>
      )}

      {/* -------- BILLS / DEPOSITS -------- */}
      {tab === 'bills' && (
        <DataTable minW={720}>
          <thead><tr><Th>Due</Th><Th>Payee</Th><Th>Account</Th><Th>Reference</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {data.bills.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <Td className="text-xs whitespace-nowrap">{formatDate(b.payDate)}</Td>
                <Td className="text-[13px] font-medium">{b.payee}</Td>
                <Td className="text-xs">{b.account?.nickname ?? '—'}</Td>
                <Td className="font-mono text-[11px] text-muted-foreground">{b.reference}</Td>
                <Td><StatusPill status={b.status} /></Td>
                <Td right className="font-medium">−{formatCurrency(b.amount)}</Td>
              </tr>
            ))}
            {data.bills.length === 0 && <tr><Td><EmptyState title="No bill payments" icon={Receipt} /></Td></tr>}
          </tbody>
        </DataTable>
      )}

      {tab === 'deposits' && (
        <DataTable minW={720}>
          <thead><tr><Th>Date</Th><Th>Check #</Th><Th>Account</Th><Th>Reference</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {data.deposits.map((d) => (
              <tr key={d.id} className="hover:bg-muted/30">
                <Td className="text-xs whitespace-nowrap">{formatDate(d.createdAt)}</Td>
                <Td className="text-xs">{d.checkNumber ?? '—'}</Td>
                <Td className="text-xs">{d.account?.nickname ?? '—'}</Td>
                <Td className="font-mono text-[11px] text-muted-foreground">{d.reference}</Td>
                <Td><StatusPill status={d.status} /></Td>
                <Td right className="font-medium text-emerald-700">+{formatCurrency(d.amount)}</Td>
              </tr>
            ))}
            {data.deposits.length === 0 && <tr><Td><EmptyState title="No mobile deposits" icon={Banknote} /></Td></tr>}
          </tbody>
        </DataTable>
      )}

      {/* -------- CARDS -------- */}
      {tab === 'cards' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="arvest-gradient text-white" onClick={() => { setIssueCard(true); setCardForm({ ...cardForm, accountId: data.accounts[0]?.id ?? '' }); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Issue card
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.cards.map((cd) => (
              <Card key={cd.id}>
                <CardContent className="p-4">
                  <div className={`h-24 rounded-xl p-3.5 flex flex-col justify-between text-white ${cardColorClass(cd.color)}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.16em]">Arvest {cd.cardType}</span>
                      <span className="text-[10px] font-semibold">{cd.network}</span>
                    </div>
                    <div>
                      <div className="font-mono text-[13px] tracking-widest">•••• •••• •••• {cd.cardLast4}</div>
                      <div className="text-[9px] text-white/70 mt-0.5">{cd.cardholder} · exp {String(cd.expiryMonth).padStart(2, '0')}/{cd.expiryYear}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-[11px] text-muted-foreground">{cd.issuedBy === 'ARVEST' ? 'Bank-issued' : 'External'}{cd.creditLimit > 0 ? ` · limit ${formatCurrency(cd.creditLimit, { cents: false })}` : ''}</div>
                    <StatusPill status={cd.status} />
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => run(
                      () => adminSend('/api/admin/cards', 'POST', { action: 'UPDATE', id: cd.id, status: cd.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN' }),
                      cd.status === 'FROZEN' ? 'Card unfrozen' : 'Card frozen'
                    )}>
                      {cd.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                    </Button>
                    {cd.status === 'ACTIVE' && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 text-destructive" onClick={() => run(
                        () => adminSend('/api/admin/cards', 'POST', { action: 'UPDATE', id: cd.id, status: 'CLOSED' }),
                        'Card closed'
                      )}>Close</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {data.cards.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="No cards" sub="Issue an Arvest card to this customer." icon={CreditCard} /></div>}
          </div>
        </div>
      )}

      {/* -------- LOANS -------- */}
      {tab === 'loans' && (
        <DataTable minW={820}>
          <thead><tr><Th>Date</Th><Th>Type</Th><Th right>Principal</Th><Th>Term / APR</Th><Th right>Monthly</Th><Th right>Outstanding</Th><Th>Status</Th><Th>Action</Th></tr></thead>
          <tbody>
            {data.loans.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <Td className="text-xs whitespace-nowrap">{formatDate(l.createdAt)}</Td>
                <Td className="text-[13px] font-medium">{l.loanType}</Td>
                <Td right>{formatCurrency(l.amount)}</Td>
                <Td className="text-xs">{l.term} mo · {l.interestRate.toFixed(2)}%</Td>
                <Td right>{formatCurrency(l.monthlyPayment)}</Td>
                <Td right className="font-medium">{formatCurrency(l.remainingBalance)}</Td>
                <Td><StatusPill status={l.status} /></Td>
                <Td>
                  {l.status === 'PENDING' ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs arvest-gradient text-white" onClick={() => setLoanDecide({ loan: l, decision: 'APPROVED' })}>Approve</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/40 text-destructive" onClick={() => setLoanDecide({ loan: l, decision: 'REJECTED' })}>Reject</Button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </Td>
              </tr>
            ))}
            {data.loans.length === 0 && <tr><Td><EmptyState title="No loans" icon={PiggyBank} /></Td></tr>}
          </tbody>
        </DataTable>
      )}

      {/* -------- WALLETS / MESSAGES -------- */}
      {tab === 'wallets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.wallets.map((w) => (
            <Card key={w.id}><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{w.label ?? `${w.walletType} Sandbox`}</span>
                <Badge variant="outline" className="text-[9px]">SANDBOX</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{w.address}</div>
              <div className="text-lg font-semibold font-mono-balance mt-2">{w.balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {w.walletType}</div>
            </CardContent></Card>
          ))}
          {data.wallets.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="No sandbox wallets" icon={WalletIcon} /></div>}
        </div>
      )}

      {tab === 'messages' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="arvest-gradient text-white" onClick={() => setCompose(true)}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> Compose
            </Button>
          </div>
          {data.messages.length === 0 ? <EmptyState title="No messages" icon={MessagesSquare} /> : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto arvest-scroll">
              {[...data.messages].reverse().map((m) => (
                <Card key={m.id} className={m.fromBank ? '' : 'border-l-4 border-l-primary'}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium">{m.subject}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                    </div>
                    <p className="text-[13px] text-foreground/90 whitespace-pre-wrap">{m.body}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="outline" className="text-[9px]">{m.fromBank ? 'Bank' : 'Customer'}</Badge>
                      {!m.fromBank && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReply(m); setReplyBody(''); }}>
                          Reply
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------- SECURITY / ACTIVITY -------- */}
      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Security events" sub="Authentication activity">
            {data.securityEvents.length === 0 ? <EmptyState title="No events" icon={ShieldCheck} /> : (
              <div className="space-y-1.5">
                {data.securityEvents.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.type === 'LOGIN' ? 'bg-emerald-500' : s.type === 'LOGIN_FAILED' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <span className="font-medium w-36 shrink-0">{s.type.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground truncate flex-1">{s.ip ?? ''} {s.detail ?? ''}</span>
                    <span className="text-muted-foreground shrink-0">{formatDateTime(s.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard title="Alert rules" sub="Server-evaluated on every movement">
            {data.alerts.length === 0 ? <EmptyState title="No alert rules" /> : (
              <div className="space-y-2">
                {data.alerts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 text-xs p-2 rounded-md border border-border">
                    <span className="font-medium flex-1">{a.type.replace(/_/g, ' ')} {a.threshold != null ? `· $${a.threshold.toFixed(2)}` : ''}</span>
                    <span className="text-muted-foreground">{a.account?.nickname ?? 'all accounts'}</span>
                    <Badge variant="outline" className="text-[9px]">{a.enabled ? 'armed' : 'off'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'activity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Manager audit trail" sub="Actions performed on this relationship" action={<ScrollText className="w-4 h-4 text-muted-foreground" />}>
            {data.auditLogs.length === 0 ? <EmptyState title="No audit entries" icon={ScrollText} /> : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto arvest-scroll">
                {data.auditLogs.map((l) => (
                  <div key={l.id} className="text-xs flex items-start gap-2">
                    <Badge variant="outline" className="text-[9px] shrink-0">{l.action}</Badge>
                    <span className="flex-1 text-muted-foreground">{l.detail}</span>
                    <span className="text-muted-foreground shrink-0">{formatDateTime(l.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard title="Notifications sent" sub="In-app messages delivered to the customer" action={<RefreshCw className="w-4 h-4 text-muted-foreground" />}>
            {data.notifications.length === 0 ? <EmptyState title="No notifications" icon={FileBarChart2} /> : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto arvest-scroll">
                {data.notifications.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-md border border-border">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{n.title}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{n.body}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ============ dialogs ============ */}
      {adjustDialog}

      <ReasonDialog
        open={!!hold}
        title={hold?.mode === 'HOLD' ? `Place hold on ${hold?.acct.nickname}` : `Release hold on ${hold?.acct.nickname}`}
        description={hold?.mode === 'HOLD'
          ? 'Moves funds from available to held. The customer cannot spend held funds.'
          : 'Returns held funds to available.'}
        confirmLabel={hold?.mode === 'HOLD' ? 'Place hold' : 'Release funds'}
        busy={busy}
        amountField={{ label: 'Amount (USD)', value: amount, onChange: setAmount, placeholder: '0.00' }}
        onCancel={() => { setHold(null); setAmount(''); }}
        onConfirm={async () => {
          if (!hold) return;
          const action = hold.mode;
          const done = await run(
            () => adminSend('/api/admin/accounts', 'POST', {
              action, accountId: hold.acct.id, amount: parseFloat(amount),
              reason: `${action.toLowerCase()} via control center`,
            }),
            action === 'HOLD' ? 'Hold placed' : 'Funds released'
          );
          if (done) { setHold(null); setAmount(''); }
        }}
      />

      {/* Open account */}
      <Dialog1 open={openAcct} onClose={() => setOpenAcct(false)} busy={busy} onSubmit={async () => {
        const done = await run(
          () => adminSend('/api/admin/accounts', 'POST', { action: 'OPEN_FOR_CUSTOMER', userId: c.id, type: openForm.type, nickname: openForm.nickname || undefined, initialDeposit: openForm.initialDeposit ? parseFloat(openForm.initialDeposit) : 0 }),
          'Account opened'
        );
        if (done) setOpenAcct(false);
      }}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={openForm.type} onValueChange={(v) => setOpenForm({ ...openForm, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CHECKING">Checking</SelectItem>
                <SelectItem value="SAVINGS">Savings</SelectItem>
                <SelectItem value="PRIVATE_CLIENT">Private Client Reserve</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nickname (optional)</Label>
            <Input value={openForm.nickname} onChange={(e) => setOpenForm({ ...openForm, nickname: e.target.value })} placeholder="e.g. Operating Account" />
          </div>
          <div className="space-y-1.5">
            <Label>Initial deposit (USD)</Label>
            <Input type="number" min="0" step="0.01" value={openForm.initialDeposit} onChange={(e) => setOpenForm({ ...openForm, initialDeposit: e.target.value })} placeholder="0" />
            <p className="text-[11px] text-muted-foreground">Deposits above the auto-approval limit are held and routed to the Operations Queue.</p>
          </div>
        </div>
      </Dialog1>

      {/* Issue card */}
      <Dialog1 open={issueCard} onClose={() => setIssueCard(false)} busy={busy} title="Issue Arvest card" onSubmit={async () => {
        const res = await adminSend('/api/admin/cards', 'POST', {
          action: 'ISSUE', userId: c.id, cardType: cardForm.cardType, network: cardForm.network,
          color: cardForm.color, creditLimit: parseFloat(cardForm.creditLimit) || 25000,
          accountId: cardForm.accountId || undefined,
        });
        if (!res.ok) { toast.error(String(res.data.error ?? 'Issue failed')); return; }
        const secrets = res.data.oneTimeSecrets as { cardNumber: string; cvv: string; pin: string };
        setIssueCard(false);
        setOneTime(secrets);
        toast.success('Card issued and active');
        reload();
      }}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={cardForm.cardType} onValueChange={(v) => setCardForm({ ...cardForm, cardType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="DEBIT">Debit</SelectItem><SelectItem value="CREDIT">Credit</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Network</Label>
              <Select value={cardForm.network} onValueChange={(v) => setCardForm({ ...cardForm, network: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VISA">Visa</SelectItem><SelectItem value="MASTERCARD">Mastercard</SelectItem>
                  <SelectItem value="AMEX">Amex</SelectItem><SelectItem value="DISCOVER">Discover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Select value={cardForm.color} onValueChange={(v) => setCardForm({ ...cardForm, color: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['CRIMSON', 'GOLD', 'OBSIDIAN', 'PLATINUM', 'SAPPHIRE', 'EMERALD'].map((c2) => <SelectItem key={c2} value={c2}>{c2}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Credit limit (credit cards)</Label>
              <Input type="number" min="500" value={cardForm.creditLimit} onChange={(e) => setCardForm({ ...cardForm, creditLimit: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Link to account</Label>
            <Select value={cardForm.accountId} onValueChange={(v) => setCardForm({ ...cardForm, accountId: v })}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {data.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.nickname} ••{a.accountNumber.slice(-4)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">Card numbers are stored encrypted. CVV and PIN are shown once after issuing and never stored in recoverable form.</p>
        </div>
      </Dialog1>

      {/* One-time card secrets */}
      <Dialog open={!!oneTime} onOpenChange={(o) => !o && setOneTime(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader><DialogTitle>Card issued — one-time secrets</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-muted/60 border"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Card number</div><div className="font-mono text-sm">{oneTime?.cardNumber}</div></div>
            <div className="p-3 rounded-md bg-muted/60 border"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">CVV</div><div className="font-mono text-sm">{oneTime?.cvv}</div></div>
            <div className="p-3 rounded-md bg-muted/60 border"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">PIN</div><div className="font-mono text-sm">{oneTime?.pin}</div></div>
            <p className="text-[11px] text-muted-foreground">These are shown once. Store securely and share through your verified channel.</p>
          </div>
          <div className="flex justify-end"><Button className="arvest-gradient text-white" onClick={() => setOneTime(null)}>Done</Button></div>
        </DialogContent>
      </Dialog>

      {/* Compose message */}
      <Dialog1 open={compose} onClose={() => setCompose(false)} busy={busy} title="Compose message" onSubmit={async () => {
        const done = await run(() => adminSend('/api/admin/messages', 'POST', { action: 'COMPOSE', userId: c.id, ...msgForm }), 'Message sent');
        if (done) { setCompose(false); setMsgForm({ subject: '', body: '' }); }
      }}>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Subject</Label><Input value={msgForm.subject} onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Message</Label><Textarea rows={4} value={msgForm.body} onChange={(e) => setMsgForm({ ...msgForm, body: e.target.value })} /></div>
        </div>
      </Dialog1>

      {/* Reply */}
      <ReasonDialog
        open={!!reply}
        title={`Reply: ${reply?.subject ?? ''}`}
        noteLabel="Reply"
        confirmLabel="Send reply"
        busy={busy}
        onCancel={() => setReply(null)}
        onConfirm={async (note) => {
          if (!reply) return;
          const done = await run(() => adminSend('/api/admin/messages', 'POST', { action: 'REPLY', replyToId: reply.id, body: note }), 'Reply sent');
          if (done) setReply(null);
        }}
      />

      {/* Reset password */}
      <Dialog open={confirmPw} onOpenChange={(o) => { if (!o) { setConfirmPw(false); setNewPw(null); } }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reset customer password</DialogTitle>
            <DialogDescription>A strong temporary password is generated; the customer is notified in-app.</DialogDescription>
          </DialogHeader>
          {newPw ? (
            <div className="p-3 rounded-md bg-muted/60 border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New temporary password</div>
              <div className="font-mono text-sm break-all">{newPw}</div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            {newPw ? (
              <Button className="arvest-gradient text-white" onClick={() => { setConfirmPw(false); setNewPw(null); }}>Done</Button>
            ) : (
              <Button className="arvest-gradient text-white" disabled={busy} onClick={async () => {
                setBusy(true);
                const res = await adminSend('/api/admin/customers', 'POST', { action: 'RESET_PASSWORD', id: c.id });
                setBusy(false);
                if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
                setNewPw(String(res.data.password));
                reload();
              }}>Generate & reset</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Freeze confirm */}
      <ConfirmDialog
        open={freeze}
        title={`Freeze ${c.name}?`}
        description="All money movement will be blocked and the customer will be notified. You can unfreeze at any time."
        confirmLabel="Freeze account"
        destructive
        busy={busy}
        onCancel={() => setFreeze(false)}
        onConfirm={async () => {
          const done = await run(() => adminSend('/api/admin/customers', 'POST', { action: 'SET_STATUS', id: c.id, status: 'FROZEN' }), 'Customer frozen');
          if (done) setFreeze(false);
        }}
      />

      {/* Loan decision */}
      <ReasonDialog
        open={!!loanDecide}
        title={loanDecide?.decision === 'APPROVED' ? 'Approve loan' : 'Reject loan'}
        description={loanDecide?.decision === 'APPROVED'
          ? `Disburses ${loanDecide ? formatCurrency(loanDecide.loan.amount) : ''} to the customer's account through the ledger and activates the loan.`
          : 'The application is declined and the customer notified.'}
        confirmLabel={loanDecide?.decision === 'APPROVED' ? 'Approve & disburse' : 'Reject application'}
        destructive={loanDecide?.decision === 'REJECTED'}
        busy={busy}
        onCancel={() => setLoanDecide(null)}
        onConfirm={async (note) => {
          if (!loanDecide) return;
          const approvalsRes = await fetch(`/api/admin/approvals?status=PENDING`, { cache: 'no-store' });
          const approvalsJson = await approvalsRes.json();
          const approval = (approvalsJson.approvals as { id: string; type: string; payload: string }[] | undefined)?.find((a) => {
            try { return a.type === 'LOAN' && JSON.parse(a.payload).loanId === loanDecide.loan.id; } catch { return false; }
          });
          if (!approval) { toast.error('Approval record not found — decide it from the Operations Queue'); return; }
          const done = await run(
            () => adminSend(`/api/admin/approvals/${approval.id}`, 'POST', { decision: loanDecide.decision, note }),
            loanDecide.decision === 'APPROVED' ? 'Loan approved & disbursed' : 'Loan rejected'
          );
          if (done) setLoanDecide(null);
        }}
      />
    </div>
  );
}

function cardColorClass(color: string): string {
  const map: Record<string, string> = {
    CRIMSON: 'arvest-gradient',
    GOLD: 'bg-gradient-to-br from-yellow-600 to-amber-800',
    OBSIDIAN: 'bg-gradient-to-br from-zinc-700 to-zinc-900',
    PLATINUM: 'bg-gradient-to-br from-slate-400 to-slate-600',
    SAPPHIRE: 'bg-gradient-to-br from-blue-700 to-blue-900',
    EMERALD: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
  };
  return map[color] ?? 'arvest-gradient';
}

// local generic form dialog wrapper
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
function Dialog1({ open, onClose, title = 'Confirm', busy, onSubmit, children }: {
  open: boolean; onClose: () => void; title?: string; busy?: boolean; onSubmit: () => void; children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy} className="arvest-gradient text-white">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
