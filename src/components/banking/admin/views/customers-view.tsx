'use client';

// Customers — the relationship directory.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState, ConfirmDialog, ReasonDialog,
} from '../admin-primitives';
import { formatCurrency, formatDate, useUI } from '@/lib/store';
import { MoreHorizontal, UserPlus, Eye, Edit3, Snowflake, KeyRound, Trash2, Users, Unlock } from 'lucide-react';

interface Customer {
  id: string; name: string; email: string; loginId: string | null; phone: string | null;
  status: string; createdAt: string; lastLoginAt: string | null;
  accountCount: number; totalBalance: number; totalAvailable: number; totalHeld: number;
  accounts: { id: string; nickname: string; type: string; accountNumber: string; balance: number; status: string }[];
}

export function CustomersView() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ customers: Customer[] }>(
    `/api/admin/customers?q=${encodeURIComponent(q)}&status=${status}`,
    [q, status]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);

  const [edit, setEdit] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', loginId: '' });
  const [resetPw, setResetPw] = useState<Customer | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; confirmLabel: string; destructive: boolean; run: () => Promise<void> } | null>(null);

  const customers = data?.customers ?? [];

  async function createCustomer() {
    if (form.name.trim().length < 2 || !form.email.includes('@')) {
      toast.error('Enter a valid name and email');
      return;
    }
    setBusy(true);
    const res = await adminSend('/api/admin/customers', 'POST', { action: 'CREATE', ...form });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Create failed')); return; }
    const creds = res.data.credentials as { loginId: string; password: string };
    setCreated(creds);
    setCreateOpen(false);
    setForm({ name: '', email: '', phone: '', password: '' });
    reload();
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    const res = await adminSend('/api/admin/customers', 'POST', { action: 'UPDATE', id: edit.id, ...editForm });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Update failed')); return; }
    toast.success('Customer updated');
    setEdit(null);
    reload();
  }

  async function changeStatus(c: Customer, next: 'ACTIVE' | 'FROZEN') {
    setBusy(true);
    const res = await adminSend('/api/admin/customers', 'POST', { action: 'SET_STATUS', id: c.id, status: next });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(`${c.name} ${next === 'FROZEN' ? 'frozen' : 'restored'}`);
    reload();
  }

  async function doResetPassword() {
    if (!resetPw) return;
    setBusy(true);
    const res = await adminSend('/api/admin/customers', 'POST', { action: 'RESET_PASSWORD', id: resetPw.id });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    setResetResult(String(res.data.password));
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        subtitle="Every private-banking relationship. Open one to manage its entire footprint."
        action={
          <Button onClick={() => setCreateOpen(true)} className="arvest-gradient text-white">
            <UserPlus className="w-4 h-4 mr-2" /> New customer
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Name, email or Login ID…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="FROZEN">Frozen</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto">{customers.length} shown</span>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        customers.length === 0 ? <EmptyState title="No customers found" sub="Adjust your search or create a new customer." icon={Users} /> : (
          <DataTable minW={860}>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Login ID</Th>
                <Th>Accounts</Th>
                <Th right>Deposits</Th>
                <Th right>Held</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => adminNavigate('customer-detail', { id: c.id })}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{c.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">{c.loginId ?? '—'}</Td>
                  <Td className="text-xs">{c.accountCount}</Td>
                  <Td right className="font-medium">{formatCurrency(c.totalBalance)}</Td>
                  <Td right className={c.totalHeld > 0 ? 'text-amber-700' : 'text-muted-foreground'}>{formatCurrency(c.totalHeld)}</Td>
                  <Td><StatusPill status={c.status} /></Td>
                  <Td className="text-xs text-muted-foreground">{c.lastLoginAt ? formatDate(c.lastLoginAt) : 'never'}</Td>
                  <Td>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => adminNavigate('customer-detail', { id: c.id })}>
                            <Eye className="w-4 h-4 mr-2" /> Open control center
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEdit(c); setEditForm({ name: c.name, email: c.email, phone: c.phone ?? '', loginId: c.loginId ?? '' }); }}>
                            <Edit3 className="w-4 h-4 mr-2" /> Edit profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setResetPw(c); setResetResult(null); }}>
                            <KeyRound className="w-4 h-4 mr-2" /> Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {c.status === 'ACTIVE' ? (
                            <DropdownMenuItem onClick={() => setConfirm({
                              title: `Freeze ${c.name}?`,
                              description: 'All money movement will be blocked and the customer notified. You can unfreeze at any time.',
                              confirmLabel: 'Freeze account',
                              destructive: true,
                              run: () => changeStatus(c, 'FROZEN'),
                            })}>
                              <Snowflake className="w-4 h-4 mr-2" /> Freeze
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => changeStatus(c, 'ACTIVE')}>
                              <Unlock className="w-4 h-4 mr-2" /> Unfreeze
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirm({
                            title: `Delete ${c.name}?`,
                            description: 'Permanent. Only possible when all balances are zero — the ledger must be clear.',
                            confirmLabel: 'Delete customer',
                            destructive: true,
                            run: async () => {
                              const res = await adminSend('/api/admin/customers', 'POST', { action: 'DELETE', id: c.id });
                              if (!res.ok) { toast.error(String(res.data.error ?? 'Delete failed')); return; }
                              toast.success('Customer deleted');
                              reload();
                            },
                          })}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>Creates the relationship with a checking and savings account. Credentials are generated for first sign-in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alexandra Sterling" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Initial password (optional)</Label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="generated if blank" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={createCustomer} disabled={busy} className="arvest-gradient text-white">Create customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials dialog */}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Customer created</DialogTitle>
            <DialogDescription>Share these one-time credentials securely. The customer should change the password after signing in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="p-3 rounded-md bg-muted/60 border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Login ID</div>
              <div className="font-mono text-sm">{created?.loginId}</div>
            </div>
            <div className="p-3 rounded-md bg-muted/60 border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Temporary password</div>
              <div className="font-mono text-sm break-all">{created?.password}</div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(`Login ID: ${created?.loginId}\nPassword: ${created?.password}`); toast.success('Copied'); }}
            >Copy</Button>
            <Button onClick={() => setCreated(null)} className="arvest-gradient text-white">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Profile changes are recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Login ID</Label>
                <Input value={editForm.loginId} onChange={(e) => setEditForm({ ...editForm, loginId: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy} className="arvest-gradient text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetPw} onOpenChange={(o) => { if (!o) { setResetPw(null); setResetResult(null); } }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>A strong temporary password will be generated. The customer is notified in-app.</DialogDescription>
          </DialogHeader>
          {resetResult && (
            <div className="p-3 rounded-md bg-muted/60 border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New temporary password</div>
              <div className="font-mono text-sm break-all">{resetResult}</div>
            </div>
          )}
          <DialogFooter>
            {resetResult ? (
              <Button onClick={() => { setResetPw(null); setResetResult(null); }} className="arvest-gradient text-white">Done</Button>
            ) : (
              <Button onClick={doResetPassword} disabled={busy} className="arvest-gradient text-white">Generate & reset</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        destructive={confirm?.destructive}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { setBusy(true); await confirm?.run(); setBusy(false); setConfirm(null); }}
      />
    </div>
  );
}
