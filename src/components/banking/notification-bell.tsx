'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, Trash2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDateTime } from '@/lib/store';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  user?: { name: string; email: string; loginId?: string | null } | null;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
  }

  async function deleteNotification(id: string) {
    // Optimistic update — remove from UI immediately
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    } catch {
      // If delete fails, reload to restore
      loadNotifications();
    }
  }

  async function clearAll() {
    setNotifications([]);
    try {
      await fetch('/api/notifications/clear', { method: 'POST' });
    } catch {
      loadNotifications();
    }
  }

  const typeColors: Record<string, string> = {
    LOGIN: 'bg-blue-500',
    LOGOUT: 'bg-gray-400',
    TRANSFER: 'bg-amber-500',
    CARD_ADDED: 'bg-purple-500',
    CARD_ISSUED: 'bg-purple-500',
    PROFILE_UPDATE: 'bg-teal-500',
    BALANCE_CHANGE: 'bg-red-500',
    TX_WRITE: 'bg-orange-500',
    BILL_PAY: 'bg-indigo-500',
    PASSWORD_RESET: 'bg-pink-500',
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) loadNotifications(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4.5 h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="text-sm font-medium">Notifications {unreadCount > 0 && <span className="text-xs text-primary">({unreadCount} new)</span>}</div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-primary hover:underline mr-2">
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto arvest-scroll">
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No notifications
            </div>
          ) : (
            notifications.slice(0, 20).map(n => (
              <div key={n.id} className={`p-3 border-b border-border last:border-0 ${!n.read ? 'bg-primary/5' : ''} group relative`}>
                <div className="flex items-start gap-2 pr-6">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${typeColors[n.type] || 'bg-primary'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</div>
                  </div>
                </div>
                {/* Delete button (appears on hover) */}
                <button
                  onClick={() => deleteNotification(n.id)}
                  className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete notification"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
