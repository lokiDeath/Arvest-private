'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/store';
import { ArvestBankingApp } from '@/components/banking/app-shell';

export default function Home() {
  const refresh = useAuth((s) => s.refresh);
  const loading = useAuth((s) => s.loading);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-serif-display text-lg">Arvest Private Banking</p>
        </div>
      </div>
    );
  }

  return <ArvestBankingApp />;
}
