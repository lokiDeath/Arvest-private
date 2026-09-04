'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';

// 5-minute inactivity auto-logout, applies to BOTH customer and admin sessions.
// 30 seconds before logout, show a warning modal so the user can extend.
const INACTIVITY_MS = 5 * 60 * 1000;
const WARNING_MS = 30 * 1000;

export function InactivityGuard({ onLogout, children }: { onLogout: () => void; children?: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearAll = () => {
    if (warnRef.current) clearTimeout(warnRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const reset = () => {
    clearAll();
    setShowWarning(false);
    setSecondsLeft(30);
    warnRef.current = setTimeout(() => {
      setShowWarning(true);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            toast.warning('You have been signed out due to inactivity.');
            onLogoutRef.current();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, INACTIVITY_MS - WARNING_MS);
    timerRef.current = setTimeout(() => {
      onLogoutRef.current();
    }, INACTIVITY_MS);
  };

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => reset();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    // Start the first timer (no setState — reset just schedules timeouts)
    const startWarn = setTimeout(() => {
      setShowWarning(true);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            toast.warning('You have been signed out due to inactivity.');
            onLogoutRef.current();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, INACTIVITY_MS - WARNING_MS);
    warnRef.current = startWarn;
    timerRef.current = setTimeout(() => onLogoutRef.current(), INACTIVITY_MS);
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearAll();
    };
  }, []);

  return (
    <>
      {children}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="font-serif-display text-lg">Still there?</div>
                <div className="text-xs text-muted-foreground">You'll be signed out in {secondsLeft}s</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              For your security, you'll be automatically signed out due to 5 minutes of inactivity. Click below to stay signed in.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => { reset(); setShowWarning(false); }} className="flex-1 arvest-gradient text-white">
                Stay signed in
              </Button>
              <Button variant="outline" onClick={() => onLogoutRef.current()}>
                Sign out now
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
