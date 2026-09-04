'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { safeJsonFetch } from '@/lib/safe-fetch';
import { formatDateTime } from '@/lib/store';
import { Calendar, Phone, Building2, CheckCircle2, Loader2, Clock, CalendarDays } from 'lucide-react';

interface Appointment {
  id: string; type: string; topic: string; date: string;
  status: string; notes: string | null;
}

const TOPICS = [
  'Account Opening',
  'Wealth Management',
  'Mortgage Consultation',
  'Loan Application',
  'Estate Planning',
  'Business Banking',
  'General Inquiry',
];

export function CustomerAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState('PHONE');
  const [topic, setTopic] = useState(TOPICS[0]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await safeJsonFetch('/api/appointments').catch(() => ({ appointments: [] as Appointment[] }));
      setAppointments(data.appointments || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    if (!date) { toast.error('Pick a date'); return; }
    if (!time) { toast.error('Pick a time'); return; }
    const dt = new Date(`${date}T${time}`);
    if (isNaN(dt.getTime())) { toast.error('Invalid date/time'); return; }
    if (dt.getTime() < Date.now()) { toast.error('Pick a future date and time'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, topic, date: dt.toISOString(), notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to book'); return; }
      toast.success('Appointment booked — your banker will confirm shortly');
      setDate(''); setTime('10:00'); setNotes('');
      load();
    } finally {
      setSubmitting(false);
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

  // Compute min date (today)
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" /> Appointments
        </h1>
        <p className="text-sm text-muted-foreground">Book a call or branch visit with your private banker.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Book an Appointment</CardTitle>
            <CardDescription className="text-xs">Phone or in-branch — your banker will confirm by message.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Appointment type</Label>
              <RadioGroup value={type} onValueChange={setType} className="grid grid-cols-2 gap-2">
                {[
                  { value: 'PHONE', label: 'Phone Call', icon: Phone },
                  { value: 'BRANCH', label: 'Branch Visit', icon: Building2 },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <label key={t.value} className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${type === t.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                      <RadioGroupItem value={t.value} className="sr-only" />
                      <Icon className={`w-4 h-4 ${type === t.value ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium">{t.label}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Topic</Label>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOPICS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" min={todayStr} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything specific you'd like to discuss?" />
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full arvest-gradient text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Book appointment
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Upcoming & Past Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto arvest-scroll">
              {appointments.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No appointments booked
                </div>
              ) : appointments.map((a) => (
                <div key={a.id} className="p-3 rounded-md border border-border">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {a.type === 'PHONE' ? <Phone className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                      <div>
                        <div className="text-sm font-medium">{a.topic}</div>
                        <div className="text-[11px] text-muted-foreground">{a.type}</div>
                      </div>
                    </div>
                    <Badge
                      variant={a.status === 'CONFIRMED' ? 'default' : a.status === 'CANCELLED' ? 'destructive' : a.status === 'COMPLETED' ? 'outline' : 'secondary'}
                      className="text-[10px]"
                    >
                      {a.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDateTime(a.date)}
                  </div>
                  {a.notes && <div className="text-[11px] text-muted-foreground mt-1 italic">"{a.notes}"</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
