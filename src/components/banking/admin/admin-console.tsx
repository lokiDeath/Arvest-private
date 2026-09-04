'use client';

// ============================================================
// Arvest Private Banking — Admin Console (Bank Manager)
// Grouped navigation · Operations Queue badge · responsive:
// sidebar ≥ lg, drawer + bottom nav below.
// ============================================================
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, Landmark, ArrowLeftRight, Receipt, Smartphone, Banknote,
  CreditCard, PiggyBank, Wallet, MessagesSquare, CalendarClock, ClipboardCheck,
  ShieldAlert, FileBarChart2, Settings2, ScrollText, LogOut, Menu, Bell, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/store';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUI, type AdminView } from '@/lib/store';
import { NotificationBell } from '@/components/banking/notification-bell';
import { InactivityGuard } from '@/components/banking/inactivity-guard';

import { CommandCenterView } from './views/command-view';
import { CustomersView } from './views/customers-view';
import { CustomerControlCenter } from './views/customer-control-center';
import { AccountsView } from './views/accounts-view';
import { TransactionsView } from './views/transactions-view';
import { TransfersView } from './views/transfers-view';
import { ZelleView } from './views/zelle-view';
import { BillPayView } from './views/billpay-view';
import { DepositsView } from './views/deposits-view';
import { CardsView } from './views/cards-view';
import { LoansView } from './views/loans-view';
import { WalletsView } from './views/wallets-view';
import { MessagesView } from './views/messages-view';
import { AppointmentsView } from './views/appointments-view';
import { ApprovalsView } from './views/approvals-view';
import { RiskView } from './views/risk-view';
import { ReportsView } from './views/reports-view';
import { BankSettingsView } from './views/settings-view';
import { AuditView } from './views/audit-view';

interface NavItem {
  view: AdminView;
  label: string;
  icon: LucideIcon;
  group: string;
  badge?: 'approvals' | 'flagged' | 'messages';
}

const NAV: NavItem[] = [
  { view: 'command', label: 'Command Center', icon: LayoutDashboard, group: 'Overview' },
  { view: 'approvals', label: 'Operations Queue', icon: ClipboardCheck, group: 'Overview', badge: 'approvals' },
  { view: 'customers', label: 'Customers', icon: Users, group: 'Relationships' },
  { view: 'accounts', label: 'Accounts', icon: Landmark, group: 'Relationships' },
  { view: 'transactions', label: 'Transactions', icon: ArrowLeftRight, group: 'Money movement' },
  { view: 'transfers', label: 'Transfers', icon: ArrowLeftRight, group: 'Money movement' },
  { view: 'zelle', label: 'Zelle', icon: Smartphone, group: 'Money movement' },
  { view: 'billpay', label: 'Bill Pay', icon: Receipt, group: 'Money movement' },
  { view: 'deposits', label: 'Deposits', icon: Banknote, group: 'Money movement' },
  { view: 'cards', label: 'Cards', icon: CreditCard, group: 'Products' },
  { view: 'loans', label: 'Loans', icon: PiggyBank, group: 'Products' },
  { view: 'wallets', label: 'Wallets', icon: Wallet, group: 'Products' },
  { view: 'messages', label: 'Messages', icon: MessagesSquare, group: 'Engagement', badge: 'messages' },
  { view: 'appointments', label: 'Appointments', icon: CalendarClock, group: 'Engagement' },
  { view: 'risk', label: 'Risk / Review', icon: ShieldAlert, group: 'Control', badge: 'flagged' },
  { view: 'reports', label: 'Statements / Reports', icon: FileBarChart2, group: 'Control' },
  { view: 'settings', label: 'Bank Settings', icon: Settings2, group: 'Control' },
  { view: 'audit', label: 'Audit Log', icon: ScrollText, group: 'Control' },
];

const GROUPS = ['Overview', 'Relationships', 'Money movement', 'Products', 'Engagement', 'Control'];
const MOBILE_NAV: AdminView[] = ['command', 'approvals', 'customers', 'transactions', 'risk'];

function ArvestMark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg arvest-gradient flex items-center justify-center text-white font-serif-display font-semibold text-lg leading-none">A</div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-serif-display text-[15px] font-semibold tracking-wide">ARVEST</div>
          <div className="text-[10px] text-muted-foreground tracking-[0.18em] uppercase">Private Banking</div>
        </div>
      )}
    </div>
  );
}

export function AdminConsole() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const adminView = useUI((s) => s.adminView);
  const adminNavigate = useUI((s) => s.adminNavigate);
  const setSidebarOpen = useUI((s) => s.setSidebarOpen);
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const [queue, setQueue] = useState({ approvals: 0, flagged: 0, frozen: 0, unreadMessages: 0 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/admin/queue', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (alive) setQueue(data);
        }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [adminView]);

  const badgeFor = (item: NavItem): number => {
    if (item.badge === 'approvals') return queue.approvals;
    if (item.badge === 'flagged') return queue.flagged;
    if (item.badge === 'messages') return queue.unreadMessages;
    return 0;
  };

  const navList = (mobile = false) => (
    <nav className="flex-1 overflow-y-auto arvest-scroll px-3 py-3 space-y-4">
      {GROUPS.map((group) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium px-2 mb-1">{group}</div>
          <div className="space-y-0.5">
            {NAV.filter((n) => n.group === group).map((item) => {
              const active = adminView === item.view || (item.view === 'customers' && adminView === 'customer-detail');
              const count = badgeFor(item);
              return (
                <button
                  key={item.view}
                  onClick={() => adminNavigate(item.view)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors text-left',
                    active ? 'bg-white/15 text-white font-medium' : 'text-white/65 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                      item.badge === 'approvals' ? 'bg-primary text-white' : 'bg-amber-400/90 text-amber-950'
                    )}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {mobile && (
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-destructive hover:bg-destructive/10"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      )}
    </nav>
  );

  const body = () => {
    switch (adminView) {
      case 'command': return <CommandCenterView />;
      case 'customers': return <CustomersView />;
      case 'customer-detail': return <CustomerControlCenter />;
      case 'accounts': return <AccountsView />;
      case 'transactions': return <TransactionsView />;
      case 'transfers': return <TransfersView />;
      case 'zelle': return <ZelleView />;
      case 'billpay': return <BillPayView />;
      case 'deposits': return <DepositsView />;
      case 'cards': return <CardsView />;
      case 'loans': return <LoansView />;
      case 'wallets': return <WalletsView />;
      case 'messages': return <MessagesView />;
      case 'appointments': return <AppointmentsView />;
      case 'approvals': return <ApprovalsView />;
      case 'risk': return <RiskView />;
      case 'reports': return <ReportsView />;
      case 'settings': return <BankSettingsView />;
      case 'audit': return <AuditView />;
      default: return <CommandCenterView />;
    }
  };

  return (
    <InactivityGuard onLogout={() => logout()}>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-[232px] bg-[#221313] text-white">
          <div className="h-16 flex items-center px-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg arvest-gradient flex items-center justify-center text-white font-serif-display font-semibold text-lg leading-none">A</div>
              <div className="leading-tight">
                <div className="font-serif-display text-[15px] font-semibold tracking-wide text-white">ARVEST</div>
                <div className="text-[9.5px] text-white/50 tracking-[0.16em] uppercase">Manager Console</div>
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0 text-white/90">
            {navList()}
          </div>
          <div className="border-t border-white/10 p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-semibold text-white">
              {(user?.name ?? 'B').split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-white truncate">{user?.name ?? 'Bank Manager'}</div>
              <div className="text-[10px] text-white/50 truncate">{user?.email}</div>
            </div>
            <button onClick={() => logout()} className="text-white/50 hover:text-white" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-[276px] bg-[#221313] text-white border-white/10">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="h-16 flex items-center px-4 border-b border-white/10">
              <ArvestMark />
            </div>
            <div className="flex flex-col h-[calc(100%-4rem)] text-white/90">
              {navList(true)}
            </div>
          </SheetContent>
        </Sheet>

        <div className="lg:pl-[232px] pb-20 lg:pb-8">
          {/* Topbar */}
          <header className="sticky top-0 z-30 h-16 bg-background/85 backdrop-blur-md border-b border-border flex items-center gap-3 px-4 lg:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="lg:hidden"><ArvestMark compact /></div>
            <div className="hidden lg:block text-[13px] text-muted-foreground">
              Bank Manager Console
              <ChevronRight className="inline w-3.5 h-3.5 mx-1" />
              <span className="text-foreground font-medium">
                {NAV.find((n) => n.view === adminView)?.label ?? (adminView === 'customer-detail' ? 'Customer Control Center' : 'Command Center')}
              </span>
            </div>
            <div className="flex-1" />
            <NotificationBell />
          </header>

          <main className="p-4 lg:p-8 max-w-[1400px] mx-auto">
            {body()}
          </main>

          <footer className="hidden lg:block mt-auto border-t border-border py-4 px-8 text-center text-xs text-muted-foreground">
            Arvest Private Banking · Manager Console · Member FDIC · NMLS #445836
          </footer>
        </div>

        {/* Mobile bottom nav */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid grid-cols-5">
            {MOBILE_NAV.map((view) => {
              const item = NAV.find((n) => n.view === view)!;
              const count = badgeFor(item);
              return (
                <button
                  key={view}
                  onClick={() => adminNavigate(view)}
                  className={cn('flex flex-col items-center gap-1 py-2.5 text-[10px] relative', adminView === view ? 'text-primary font-medium' : 'text-muted-foreground')}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label.split(' ')[0]}
                  {count > 0 && <span className="absolute top-1.5 right-[22%] w-2 h-2 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </InactivityGuard>
  );
}
