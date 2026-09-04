'use client';

import { useAuth } from '@/lib/store';
import { LoginScreen } from './auth/login-screen';
import { CustomerDashboard } from './customer/customer-dashboard';
import { AdminConsole } from './admin/admin-console';

export function ArvestBankingApp() {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const refresh = useAuth((s) => s.refresh);

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

  if (!user) {
    return <LoginScreen onSuccess={refresh} />;
  }

  if (user.role === 'ADMIN') {
    return <AdminConsole />;
  }

  return <CustomerDashboard />;
}
