'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { safeJsonFetch } from '@/lib/safe-fetch';
import { formatDateTime } from '@/lib/store';
import { MessageSquare, Send, Plus, Building2, Mail, Loader2 } from 'lucide-react';

interface Message {
  id: string; subject: string; body: string; fromBank: boolean; read: boolean;
  replyToId: string | null; createdAt: string;
  user?: { id: string; name: string; email: string };
}

export function CustomerMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Message | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await safeJsonFetch('/api/messages').catch(() => ({ messages: [] as Message[] }));
      setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function send() {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and message are required'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to send'); return; }
      toast.success('Message sent to your banker');
      setSubject(''); setBody('');
      setComposeOpen(false);
      load();
    } finally {
      setSending(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif-display text-2xl mb-1 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" /> Messages
          </h1>
          <p className="text-sm text-muted-foreground">Secure messaging with your private banking team.</p>
        </div>
        <Button onClick={() => setComposeOpen(true)} className="arvest-gradient text-white">
          <Plus className="w-4 h-4 mr-1.5" /> New message
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[600px]">
        {/* Message list */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[530px] overflow-y-auto arvest-scroll">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No messages yet
                </div>
              ) : messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`w-full text-left p-3 border-b border-border hover:bg-muted/40 transition-colors ${
                    selected?.id === m.id ? 'bg-muted/60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!m.read && !m.fromBank && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {m.fromBank ? (
                          <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/15">
                            <Building2 className="w-2.5 h-2.5 mr-0.5" /> BANK
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px]">YOU</Badge>
                        )}
                        <span className="text-sm font-medium truncate">{m.subject}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{m.body}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{formatDateTime(m.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conversation view */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 h-full flex flex-col">
            {selected ? (
              <>
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2 mb-1">
                    {selected.fromBank ? (
                      <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/15">
                        <Building2 className="w-2.5 h-2.5 mr-0.5" /> FROM BANK
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px]">SENT BY YOU</Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <h3 className="font-serif-display text-lg">{selected.subject}</h3>
                </div>
                <div className="flex-1 p-4 overflow-y-auto arvest-scroll">
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{selected.body}</div>
                </div>
                <div className="p-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSubject(`Re: ${selected.subject}`);
                      setBody('');
                      setComposeOpen(true);
                    }}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Reply
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <Mail className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                  <div className="text-sm font-medium">Select a message</div>
                  <div className="text-xs text-muted-foreground mt-1">Choose a message from your inbox to view it here.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="How can we help?" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={sending} className="arvest-gradient text-white">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
