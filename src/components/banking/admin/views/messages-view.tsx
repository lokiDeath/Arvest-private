'use client';

// Messages — the bank inbox with threads + reply.
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAdminData, adminSend, PageHeader, LoadingBlock, ErrorState, EmptyState } from '../admin-primitives';
import { formatDateTime, useUI } from '@/lib/store';
import { MessagesSquare, Send, MailOpen } from 'lucide-react';

interface Msg {
  id: string; subject: string; body: string; fromBank: boolean; read: boolean; createdAt: string;
  user: { id: string; name: string; email: string; loginId: string | null };
}

export function MessagesView() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'CUSTOMER' | 'BANK'>('CUSTOMER');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [compose, setCompose] = useState<{ open: boolean; userId?: string; subject: string; body: string }>({ open: false, subject: '', body: '' });
  const [customerList, setCustomerList] = useState<{ id: string; name: string; email: string }[]>([]);
  const adminNavigate = useUI((s) => s.adminNavigate);
  const { data, loading, error, reload } = useAdminData<{ messages: Msg[] }>('/api/admin/messages');

  const messages = (data?.messages ?? [])
    .filter((m) => filter === 'ALL' || (filter === 'CUSTOMER' ? !m.fromBank : m.fromBank))
    .filter((m) => !q || [m.subject, m.body, m.user?.name].some((v) => v?.toLowerCase().includes(q.toLowerCase())));

  const grouped = new Map<string, Msg[]>();
  for (const m of messages) {
    const key = m.user.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  async function sendReply() {
    if (!reply || replyBody.trim().length < 2) { toast.error('Write a reply first'); return; }
    setBusy(true);
    const res = await adminSend('/api/admin/messages', 'POST', { action: 'REPLY', replyToId: reply.id, body: replyBody.trim() });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Send failed')); return; }
    toast.success('Reply sent');
    setReply(null); setReplyBody('');
    reload();
  }

  async function sendCompose() {
    if (!compose.userId || compose.subject.trim().length < 2 || compose.body.trim().length < 2) {
      toast.error('Select a customer and fill subject + message');
      return;
    }
    setBusy(true);
    const res = await adminSend('/api/admin/messages', 'POST', { action: 'COMPOSE', userId: compose.userId, subject: compose.subject.trim(), body: compose.body.trim() });
    setBusy(false);
    if (!res.ok) { toast.error(String(res.data.error ?? 'Send failed')); return; }
    toast.success('Message sent');
    setCompose({ open: false, subject: '', body: '' });
    reload();
  }

  async function markRead(userId: string) {
    await adminSend('/api/admin/messages', 'POST', { action: 'MARK_READ', userId });
    reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Messages"
        subtitle="Secure client correspondence. Replies appear in the customer's inbox instantly."
        action={
          <Button className="arvest-gradient text-white" onClick={async () => {
            setCompose({ open: true, subject: '', body: '' });
            const res = await fetch('/api/admin/customers', { cache: 'no-store' });
            const json = await res.json();
            setCustomerList((json.customers ?? []).map((c: { id: string; name: string; email: string }) => ({ id: c.id, name: c.name, email: c.email })));
          }}>
            <Send className="w-4 h-4 mr-2" /> Compose
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="h-9 w-full sm:w-64 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="Search subject, body or customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/70">
          {([['CUSTOMER', 'From customers'], ['BANK', 'From bank'], ['ALL', 'All']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium ${filter === v ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState message={error} onRetry={reload} /> :
        messages.length === 0 ? <EmptyState title="No messages" icon={MessagesSquare} /> : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([userId, msgs]) => {
              const unread = msgs.filter((m) => !m.fromBank && !m.read).length;
              return (
                <Card key={userId}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button className="text-sm font-semibold hover:underline" onClick={() => adminNavigate('customer-detail', { id: userId })}>
                        {msgs[0].user.name} <span className="text-[11px] text-muted-foreground font-normal">· {msgs[0].user.email}</span>
                      </button>
                      {unread > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markRead(userId)}>
                          <MailOpen className="w-3 h-3 mr-1" /> Mark read ({unread})
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {msgs.slice().reverse().map((m) => (
                        <div key={m.id} className={`p-3 rounded-md border ${m.fromBank ? 'bg-muted/40 border-border' : 'bg-card border-l-4 border-l-primary border-border'} ${!m.fromBank && !m.read ? 'ring-1 ring-primary/30' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium">{m.subject}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(m.createdAt)}</span>
                          </div>
                          <p className="text-[13px] text-foreground/90 mt-1 whitespace-pre-wrap">{m.body}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <Badge variant="outline" className="text-[9px]">{m.fromBank ? 'Bank' : 'Customer'}{!m.read && !m.fromBank ? ' · unread' : ''}</Badge>
                            {!m.fromBank && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReply(m); setReplyBody(''); }}>Reply</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      {/* Reply dialog */}
      <Dialog open={!!reply} onOpenChange={(o) => !o && setReply(null)}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Reply — {reply?.subject}</DialogTitle>
            <DialogDescription>To {reply?.user.name}</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write your reply…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReply(null)} disabled={busy}>Cancel</Button>
            <Button onClick={sendReply} disabled={busy} className="arvest-gradient text-white"><Send className="w-4 h-4 mr-2" /> Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={compose.open} onOpenChange={(o) => !o && setCompose({ ...compose, open: false })}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Compose message</DialogTitle>
            <DialogDescription>Sends an in-app secure message to the customer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={compose.userId ?? ''} onValueChange={(v) => setCompose({ ...compose, userId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(customerList.length ? customerList : [...grouped.entries()].map(([id, msgs]) => ({ id, name: msgs[0].user.name }))).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Subject</Label><Input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Message</Label><Textarea rows={4} value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompose({ ...compose, open: false })} disabled={busy}>Cancel</Button>
            <Button onClick={sendCompose} disabled={busy} className="arvest-gradient text-white"><Send className="w-4 h-4 mr-2" /> Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
