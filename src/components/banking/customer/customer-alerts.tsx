'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { safeJsonFetch } from '@/lib/safe-fetch';
import { formatCurrency } from '@/lib/store';
import { Bell, Plus, Trash2, Loader2, AlertTriangle, TrendingDown, TrendingUp, DollarSign } from 'lucide-react';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
}

interface Alert {
  id: string; type: string; threshold: number | null;
  accountId: string | null; enabled: boolean; createdAt: string;
}

const ALERT_TYPES = [
  { value: 'LOW_BALANCE', label: 'Low Balance', desc: 'Notify when balance falls below threshold', icon: TrendingDown },
  { value: 'LARGE_DEBIT', label: 'Large Debit', desc: 'Notify on debit over threshold', icon: TrendingUp },
  { value: 'LARGE_CREDIT', label: 'Large Credit', desc: 'Notify on credit over threshold', icon: DollarSign },
  { value: 'TRANSACTION', label: 'Any Transaction', desc: 'Notify on every transaction', icon: Bell },
];

export function CustomerAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [type, setType] = useState('LOW_BALANCE');
  const [threshold, setThreshold] = useState('');
  const [accountId, setAccountId] = useState('');
  const [enabled, setEnabled] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [aData, alertData] = await Promise.all([
        fetch('/api/accounts').then((r) => r.json()).catch(() => ({ accounts: [] })),
        safeJsonFetch('/api/alerts').catch(() => ({ alerts: [] as Alert[] })),
      ]);
      setAccounts(aData.accounts || []);
      setAlerts(alertData.alerts || []);
      if (aData.accounts?.[0]) setAccountId(aData.accounts[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!type) { toast.error('Choose an alert type'); return; }
    if (!accountId) { toast.error('Choose an account'); return; }
    const thresholdNum = threshold ? parseFloat(threshold) : undefined;
    if (threshold && (isNaN(thresholdNum as number) || (thresholdNum as number) < 0)) {
      toast.error('Threshold must be a positive number');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, threshold: thresholdNum, accountId, enabled }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create alert'); return; }
      toast.success('Alert created');
      setThreshold('');
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(id: string, value: boolean) {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: value }),
      });
      if (!res.ok) { toast.error('Update failed'); return; }
      toast.success(value ? 'Alert enabled' : 'Alert disabled');
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this alert?')) return;
    try {
      const res = await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Delete failed'); return; }
      toast.success('Alert deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1 flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" /> Alerts
        </h1>
        <p className="text-sm text-muted-foreground">Set up alerts to stay on top of your accounts.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Alert</CardTitle>
            <CardDescription className="text-xs">Get notified about the things that matter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Alert type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALERT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col">
                        <span>{t.label}</span>
                        <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nickname} · ••••{a.accountNumber.slice(-4)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Threshold ($)</Label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={type === 'LOW_BALANCE' ? '500' : '1000'} />
              <p className="text-[11px] text-muted-foreground">
                {type === 'LOW_BALANCE' ? 'Alert when balance drops below this amount.' : 'Alert when transaction exceeds this amount.'}
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-md border border-border">
              <div>
                <div className="text-sm font-medium">Enabled immediately</div>
                <div className="text-[11px] text-muted-foreground">Toggle off to save without activating</div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <Button onClick={create} disabled={submitting} className="w-full arvest-gradient text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create alert
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Alerts</CardTitle>
            <CardDescription className="text-xs">{alerts.length} alert{alerts.length === 1 ? '' : 's'} configured</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto arvest-scroll">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No alerts configured
                </div>
              ) : alerts.map((a) => {
                const meta = ALERT_TYPES.find((t) => t.value === a.type);
                const Icon = meta?.icon || Bell;
                const acct = accounts.find((x) => x.id === a.accountId);
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-md border border-border">
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center ${a.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{meta?.label || a.type}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {acct?.nickname || 'All accounts'}
                        {a.threshold ? ` · ${formatCurrency(a.threshold)}` : ''}
                      </div>
                    </div>
                    <Switch
                      checked={a.enabled}
                      onCheckedChange={(v) => toggle(a.id, v)}
                      disabled={updatingId === a.id}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(a.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-muted/40 text-[11px] text-muted-foreground">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>Alerts are processed in real-time. You'll receive a notification whenever a configured condition is met.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
