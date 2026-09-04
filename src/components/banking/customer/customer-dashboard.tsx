'use client';

import { useEffect, useState } from 'react';
import { CustomerHome } from './customer-home';
import { CustomerAccounts } from './customer-accounts';
import { CustomerTransfers } from './customer-transfers';
import { CustomerBillPay } from './customer-billpay';
import { CustomerStatements } from './customer-statements';
import { CustomerProfile } from './customer-profile';
import { CustomerCards } from './customer-cards';
import { CustomerSidebar } from './customer-sidebar';
import { CustomerTopbar } from './customer-topbar';
import { CustomerBottomNav } from './customer-bottom-nav';
import { CustomerDeposit } from './customer-deposit';
import { CustomerZelle } from './customer-zelle';
import { CustomerMarkets } from './customer-markets';
import { CustomerWallet } from './customer-wallet';
import { CustomerLoans } from './customer-loans';
import { CustomerOpenAccount } from './customer-open-account';
import { CustomerMessages } from './customer-messages';
import { CustomerAppointments } from './customer-appointments';
import { CustomerAlerts } from './customer-alerts';
import { CustomerBranches } from './customer-branches';
import { useAuth } from '@/lib/store';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export type CustomerView =
  | 'home'
  | 'accounts'
  | 'transfers'
  | 'payments'
  | 'deposit'
  | 'zelle'
  | 'cards'
  | 'markets'
  | 'wallet'
  | 'loans'
  | 'open-account'
  | 'messages'
  | 'appointments'
  | 'statements'
  | 'branches'
  | 'alerts'
  | 'profile';

const ALL_VIEWS: CustomerView[] = [
  'home', 'accounts', 'transfers', 'payments', 'deposit', 'zelle', 'cards',
  'markets', 'wallet', 'loans', 'open-account', 'messages', 'appointments',
  'statements', 'branches', 'alerts', 'profile',
];

export function CustomerDashboard() {
  const [view, setView] = useState<CustomerView>('home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const refresh = useAuth((s) => s.refresh);

  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace('#/', '').replace('#', '');
      if (h && ALL_VIEWS.includes(h as CustomerView)) {
        setView(h as CustomerView);
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  const navigate = (v: CustomerView) => {
    setView(v);
    window.location.hash = `/${v}`;
    setMobileOpen(false);
    // Scroll main content to top on view change
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <CustomerSidebar current={view} onNavigate={navigate} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <CustomerSidebar current={view} onNavigate={navigate} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <CustomerTopbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto pb-32 lg:pb-8">
          {view === 'home' && <CustomerHome onNavigate={navigate} />}
          {view === 'accounts' && <CustomerAccounts />}
          {view === 'transfers' && <CustomerTransfers onSuccess={refresh} />}
          {view === 'payments' && <CustomerBillPay onSuccess={refresh} />}
          {view === 'deposit' && <CustomerDeposit onSuccess={refresh} />}
          {view === 'zelle' && <CustomerZelle onSuccess={refresh} />}
          {view === 'cards' && <CustomerCards />}
          {view === 'markets' && <CustomerMarkets />}
          {view === 'wallet' && <CustomerWallet />}
          {view === 'loans' && <CustomerLoans />}
          {view === 'open-account' && <CustomerOpenAccount onSuccess={refresh} />}
          {view === 'messages' && <CustomerMessages />}
          {view === 'appointments' && <CustomerAppointments />}
          {view === 'statements' && <CustomerStatements />}
          {view === 'branches' && <CustomerBranches />}
          {view === 'alerts' && <CustomerAlerts />}
          {view === 'profile' && <CustomerProfile onSuccess={refresh} />}
        </main>
        <footer className="mt-auto border-t border-border py-4 px-4 lg:px-8 text-center text-xs text-muted-foreground">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© 2026 Arvest Private Banking · Member FDIC · Equal Housing Lender</span>
            <span className="hidden sm:inline">NMLS #445836</span>
          </div>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <CustomerBottomNav current={view} onNavigate={navigate} />
    </div>
  );
}
