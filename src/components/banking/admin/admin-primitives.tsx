'use client';

// ============================================================
// Arvest Admin Console — shared primitives
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Loader2, Search, X } from 'lucide-react';

// ---------------- data hook ----------------

export function useAdminData<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.error) {
        setError(json?.error ?? `Request failed (${res.status})`);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

export async function adminSend(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'Idempotency-Key': globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) return { ok: false, data };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, data: { error: e instanceof Error ? e.message : 'Network error' } };
  }
}

// ---------------- page header ----------------

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

// ---------------- KPI card ----------------

export function KpiCard({ label, value, sub, icon: Icon, warn, onClick }: {
  label: string; value: string | number; sub?: string; icon?: LucideIcon; warn?: boolean; onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'text-left p-4 rounded-xl border bg-card transition-all',
        onClick && 'hover:border-primary/40 hover:shadow-sm cursor-pointer',
        warn ? 'border-amber-500/50 bg-amber-50/40' : 'border-border'
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        {Icon && <Icon className={cn('w-4 h-4', warn ? 'text-amber-600' : 'text-primary')} />}
      </div>
      <div className="text-xl font-semibold font-mono-balance tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Wrapper>
  );
}

// ---------------- status pill ----------------

const STATUS_STYLES: Record<string, string> = {
  POSTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PAID_OFF: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  ON_HOLD: 'bg-amber-100 text-amber-800 border-amber-200',
  SCHEDULED: 'bg-sky-100 text-sky-800 border-sky-200',
  PROCESSING: 'bg-sky-100 text-sky-800 border-sky-200',
  CONFIRMED: 'bg-sky-100 text-sky-800 border-sky-200',
  FLAGGED: 'bg-orange-100 text-orange-800 border-orange-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  DECLINED: 'bg-red-100 text-red-700 border-red-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
  REVERSED: 'bg-purple-100 text-purple-800 border-purple-200',
  FROZEN: 'bg-orange-100 text-orange-800 border-orange-200',
  LOST: 'bg-red-100 text-red-700 border-red-200',
  CLOSED: 'bg-zinc-200 text-zinc-700 border-zinc-300',
  DEFAULT: 'bg-muted text-muted-foreground border-border',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.DEFAULT;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10.5px] font-medium whitespace-nowrap', style, className)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------- table helpers ----------------

export function DataTable({ children, minW = 720 }: { children: React.ReactNode; minW?: number }) {
  return (
    <div className="rounded-lg border border-border overflow-auto arvest-scroll">
      <table className="w-full text-sm" style={{ minWidth: minW }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return (
    <th className={cn('text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2.5 bg-muted/50 whitespace-nowrap', right && 'text-right', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return (
    <td className={cn('px-3 py-2.5 align-middle border-t border-border', right && 'text-right tabular-nums', className)}>
      {children}
    </td>
  );
}

// ---------------- search + filter bar ----------------

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input className="pl-8 h-9 w-full sm:w-64" placeholder={placeholder ?? 'Search…'} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => onChange('')}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------- empty / loading ----------------

export function EmptyState({ title, sub, icon: Icon }: { title: string; sub?: string; icon?: LucideIcon }) {
  return (
    <div className="text-center py-14">
      {Icon && <Icon className="w-9 h-9 mx-auto mb-3 text-muted-foreground/40" />}
      <div className="text-sm font-medium">{title}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted/60 arvest-shimmer" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="text-sm text-destructive font-medium">{message}</div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------------- reason dialog (approve/reject/reverse/adjust …) ----------------

export function ReasonDialog({
  open, title, description, confirmLabel, destructive, busy, onCancel, onConfirm, noteLabel, amountField, extra,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  noteLabel?: string;
  amountField?: { label: string; value: string; onChange: (v: string) => void; placeholder?: string };
  extra?: React.ReactNode;
  onCancel: () => void;
  /** onConfirm receives the note text typed by the manager */
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          {amountField && (
            <div className="space-y-1.5">
              <Label>{amountField.label}</Label>
              <Input type="number" step="0.01" min="0" value={amountField.value} onChange={(e) => amountField.onChange(e.target.value)} placeholder={amountField.placeholder} />
            </div>
          )}
          {extra}
          <div className="space-y-1.5">
            <Label>{noteLabel ?? 'Note'} <span className="text-muted-foreground font-normal">(recorded in the audit log)</span></Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => onConfirm(note.trim())}
            disabled={busy || note.trim().length < 3}
            className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : 'arvest-gradient text-white'}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- confirm dialog ----------------

export function ConfirmDialog({
  open, title, description, confirmLabel, destructive, busy, onCancel, onConfirm,
}: {
  open: boolean; title: string; description?: string; confirmLabel: string; destructive?: boolean; busy?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy} className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : 'arvest-gradient text-white'}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- section card ----------------

export function SectionCard({ title, sub, action, children, className }: {
  title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ---------------- misc ----------------

export function Money({ value, signed, credit }: { value: number; signed?: boolean; credit?: boolean }) {
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
  return (
    <span className={cn('font-mono-balance tabular-nums', credit === true && 'text-emerald-700', credit === false && 'text-foreground')}>
      {signed ? (credit ? '+' : '−') : ''}{text}
    </span>
  );
}

export function ActivityChart({ data }: {
  data: Array<{ date: string; credits: number; debits: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gCred" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b9e5a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0b9e5a" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gDeb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a1d1d" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#7a1d1d" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d8" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7a7066' }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={{ fontSize: 10, fill: '#7a7066' }} axisLine={false} tickLine={false} width={46}
          tickFormatter={(v: number) => `$${Math.abs(Number(v)) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : v}`} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e6e0d8', fontSize: 12 }}
          formatter={(v: number | string, name: string) => [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v)), name === 'credits' ? 'Credits' : 'Debits']}
        />
        <Area type="monotone" dataKey="credits" stroke="#0b9e5a" strokeWidth={2} fill="url(#gCred)" />
        <Area type="monotone" dataKey="debits" stroke="#7a1d1d" strokeWidth={2} fill="url(#gDeb)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return <Badge className="bg-primary text-white text-[10px] h-4.5 px-1.5 min-w-4.5">{count > 99 ? '99+' : count}</Badge>;
}
