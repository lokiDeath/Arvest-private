'use client';

// Bank Settings — thresholds, limits, platform switches, own password.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAdminData, adminSend, PageHeader, SectionCard, LoadingBlock, ErrorState } from '../admin-primitives';
import { KeyRound, Info, Save, Loader2 } from 'lucide-react';

interface SettingsData { settings: Record<string, string>; keys: string[] }

const GROUPS: { title: string; sub: string; keys: { key: string; label: string; hint?: string }[] }[] = [
  {
    title: 'Auto-approval thresholds',
    sub: 'Amounts ABOVE the threshold are held and routed to the Operations Queue; at or below, they post instantly.',
    keys: [
      { key: 'transfer.external.autoApproveUsd', label: 'External transfers (USD)' },
      { key: 'zelle.autoApproveUsd', label: 'Zelle (USD)' },
      { key: 'billpay.autoApproveUsd', label: 'Bill payments (USD)' },
      { key: 'deposit.check.autoApproveUsd', label: 'Mobile check deposits (USD)', hint: '0 = every deposit is reviewed' },
      { key: 'account.open.autoApproveUsd', label: 'Account opening deposits (USD)' },
      { key: 'wallet.send.autoApproveUsd', label: 'Sandbox wallet sends (USD)' },
      { key: 'loan.autoApproveUsd', label: 'Loan instant-approval (USD)', hint: '0 = every loan is reviewed' },
    ],
  },
  {
    title: 'Limits',
    sub: 'Hard caps enforced server-side.',
    keys: [
      { key: 'zelle.dailyLimitUsd', label: 'Zelle daily limit (USD)' },
      { key: 'deposit.check.maxUsd', label: 'Mobile deposit max per check (USD)' },
      { key: 'wallet.faucet.maxUsd', label: 'Sandbox funding max per request (USD)' },
      { key: 'risk.largeTxFlagUsd', label: 'Large-transaction review threshold (USD)' },
    ],
  },
];

export function BankSettingsView() {
  const { data, loading, error, reload } = useAdminData<SettingsData>('/api/admin/settings');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft(data.settings);
  }, [data]);

  if (loading) return <LoadingBlock rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'Failed to load'} onRetry={reload} />;

  const dirty = data.keys.some((k) => (draft[k] ?? '') !== (data.settings[k] ?? ''));

  async function save() {
    setBusy(true);
    const payload: Record<string, string> = {};
    for (const k of data!.keys) payload[k] = draft[k] ?? data!.settings[k] ?? '';
    const res = await adminSend('/api/admin/settings', 'PUT', payload);
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Save failed')); return; }
    toast.success('Bank settings saved');
    reload();
  }

  async function changePassword() {
    if (pw.next.length < 10 || !/[A-Za-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) {
      toast.error('New password must be 10+ characters with letters and numbers');
      return;
    }
    setPwBusy(true);
    const res = await adminSend('/api/profile', 'PATCH', { action: 'CHANGE_PASSWORD', currentPassword: pw.current, newPassword: pw.next });
    setPwBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Change failed')); return; }
    toast.success('Password changed');
    setPwOpen(false);
    setPw({ current: '', next: '' });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bank Settings"
        subtitle="Thresholds and limits apply instantly across customer and admin flows."
        action={
          <Button onClick={save} disabled={busy || !dirty} className="arvest-gradient text-white">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save changes
          </Button>
        }
      />

      {GROUPS.map((g) => (
        <SectionCard key={g.title} title={g.title} sub={g.sub}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {g.keys.map(({ key, label, hint }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number" min="0" step="1"
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
                {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
                <p className="font-mono text-[10px] text-muted-foreground/60">{key}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ))}

      <SectionCard title="Platform" sub="Switches that affect customer flows immediately.">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-[13px] font-medium">Maintenance mode</div>
            <div className="text-[11px] text-muted-foreground">Blocks all customer money movement with a 503 notice. Admin stays fully operational.</div>
          </div>
          <Switch
            checked={draft['platform.maintenance'] === 'true'}
            onCheckedChange={(v) => setDraft({ ...draft, 'platform.maintenance': String(v) })}
          />
        </div>
        <div className="pt-3 border-t border-border">
          <div className="text-[13px] font-medium mb-1.5">Statement footer</div>
          <Input value={draft['platform.statementFooter'] ?? ''} onChange={(e) => setDraft({ ...draft, 'platform.statementFooter': e.target.value })} />
        </div>
      </SectionCard>

      <SectionCard title="Security" sub="Manager credentials & environment">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-[13px] font-medium">Bank manager password</div>
            <div className="text-[11px] text-muted-foreground">Change your own password (requires current password; recorded in audit log).</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
            <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Change
          </Button>
        </div>
        <div className="flex items-start gap-2 pt-3 border-t border-border text-[11px] text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Secrets (SESSION_SECRET, CARD_ENCRYPTION_KEY, database URLs) are environment variables — see
            <span className="font-mono"> .env.example</span> in the project root and the deployment guide in the README.
          </span>
        </div>
      </SectionCard>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change your password</DialogTitle>
            <DialogDescription>Applies to your manager account on every future sign-in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">Minimum 10 characters with letters and numbers.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)} disabled={pwBusy}>Cancel</Button>
            <Button onClick={changePassword} disabled={pwBusy} className="arvest-gradient text-white">Change password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
