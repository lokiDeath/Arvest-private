'use client';

// Appointments — branch & phone appointment management.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAdminData, adminSend, PageHeader, StatusPill, DataTable, Th, Td, SearchInput,
  LoadingBlock, ErrorState, EmptyState,
} from '../admin-primitives';
import { formatDateTime, useUI } from '@/lib/store';
import { CalendarClock, CheckCircle2, XCircle, CheckCheck, Loader2 } from 'lucide-react';

interface Appt {
  id: string; type: string; topic: string; date: string; status: string; notes: string | null;
  user: { id: string; name: string; email: string; phone: string | null };
}

export function AppointmentsView() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Appt | null>(null);
  const [noteText, setNoteText] = useState('');
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ appointments: Appt[] }>(`/api/admin/appointments?status=${status}`, [status]);
  const items = (data?.appointments ?? []).filter((a) =>
    !q || [a.topic, a.user?.name, a.type].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
  );

  async function setStatusFor(a: Appt, next: string, withNote?: string) {
    setBusyId(a.id);
    const res = await adminSend('/api/admin/appointments', 'PATCH', { id: a.id, status: next, ...(withNote ? { notes: withNote } : {}) });
    setBusyId(null);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Failed')); return; }
    toast.success(`Appointment ${next.toLowerCase()}`);
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Appointments" subtitle="Branch and phone appointments requested by clients." />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Topic, customer…" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['ALL', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        items.length === 0 ? <EmptyState title="No appointments" icon={CalendarClock} /> : (
          <DataTable minW={900}>
            <thead>
              <tr><Th>When</Th><Th>Customer</Th><Th>Type</Th><Th>Topic</Th><Th>Contact</Th><Th>Status</Th><Th>Notes</Th><Th right>Actions</Th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(a.date)}</Td>
                  <Td>
                    <button className="text-xs hover:underline" onClick={() => adminNavigate('customer-detail', { id: a.user.id })}>{a.user.name}</button>
                  </Td>
                  <Td><Badge_>{a.type}</Badge_></Td>
                  <Td className="text-[13px]">{a.topic}</Td>
                  <Td className="text-xs">{a.user.phone ?? a.user.email}</Td>
                  <Td><StatusPill status={a.status} /></Td>
                  <Td className="text-xs text-muted-foreground max-w-[160px]"><div className="truncate">{a.notes ?? '—'}</div></Td>
                  <Td right>
                    <div className="flex gap-1.5 justify-end">
                      {busyId === a.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      {a.status === 'SCHEDULED' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === a.id} onClick={() => setStatusFor(a, 'CONFIRMED')}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Confirm
                        </Button>
                      )}
                      {['SCHEDULED', 'CONFIRMED'].includes(a.status) && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === a.id} onClick={() => setStatusFor(a, 'COMPLETED')}>
                            <CheckCheck className="w-3 h-3 mr-1" /> Complete
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={busyId === a.id} onClick={() => setStatusFor(a, 'CANCELLED')}>
                            <XCircle className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNotes(a); setNoteText(a.notes ?? ''); }}>Notes</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

      <Dialog open={!!notes} onOpenChange={(o) => !o && setNotes(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Appointment notes</DialogTitle>
            <DialogDescription>{notes?.user.name} · {notes?.topic}</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Internal notes…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotes(null)}>Cancel</Button>
            <Button className="arvest-gradient text-white" onClick={async () => { if (notes) { await setStatusFor(notes, notes.status, noteText); setNotes(null); } }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Badge_({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-[10.5px] font-medium bg-muted/60">{children}</span>;
}
