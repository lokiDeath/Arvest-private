'use client';

import { useAuth } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  LayoutDashboard, Wallet as WalletIcon, ArrowLeftRight, CreditCard, FileText, User,
  LogOut, Phone, Sparkles, Banknote, Smartphone, Mail, MessageSquare, Calendar,
  PiggyBank, Landmark, Bell, Plus, TrendingUp, Bitcoin, Send,
} from 'lucide-react';
import type { CustomerView } from './customer-dashboard';

interface NavItem { key: CustomerView; label: string; icon: any; }
interface NavGroup { title: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  {
    title: 'MAIN',
    items: [
      { key: 'home', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'accounts', label: 'Accounts', icon: WalletIcon },
    ],
  },
  {
    title: 'MONEY TOOLS',
    items: [
      { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
      { key: 'deposit', label: 'Mobile Deposit', icon: Smartphone },
      { key: 'payments', label: 'Bill Pay', icon: CreditCard },
      { key: 'zelle', label: 'Zelle', icon: Send },
      { key: 'cards', label: 'Cards', icon: Banknote },
    ],
  },
  {
    title: 'WEALTH',
    items: [
      { key: 'markets', label: 'Markets', icon: TrendingUp },
      { key: 'wallet', label: 'Wallet', icon: Bitcoin },
      { key: 'loans', label: 'Loans', icon: PiggyBank },
      { key: 'open-account', label: 'Open Account', icon: Plus },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      { key: 'messages', label: 'Messages', icon: MessageSquare },
      { key: 'appointments', label: 'Appointments', icon: Calendar },
      { key: 'statements', label: 'Statements', icon: FileText },
      { key: 'branches', label: 'Find Branches', icon: Landmark },
      { key: 'alerts', label: 'Alerts', icon: Bell },
      { key: 'profile', label: 'Settings', icon: User },
    ],
  },
];

// Local Send icon — lucide Send is fine; we re-use it below

export function CustomerSidebar({ current, onNavigate }: { current: CustomerView; onNavigate: (v: CustomerView) => void }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const memberYear = user?.createdAt
    ? new Date(user.createdAt).getFullYear()
    : new Date().getFullYear();

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-sidebar-primary/15 border border-sidebar-primary/30 flex items-center justify-center">
            <span className="font-serif-display text-xl text-sidebar-primary">A</span>
          </div>
          <div>
            <div className="font-serif-display text-lg tracking-wide text-sidebar-foreground">ARVEST</div>
            <div className="text-[9px] tracking-[0.3em] text-sidebar-foreground/60 -mt-1">PRIVATE BANKING</div>
          </div>
        </div>
      </div>

      {/* User card */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-sidebar-primary/40" key={user.avatarUrl} />
          ) : (
            <div className="w-10 h-10 rounded-full bg-sidebar-primary/15 flex items-center justify-center text-sidebar-primary font-medium">
              {user?.name?.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-[11px] text-sidebar-foreground/60 truncate">Customer since {memberYear}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 px-2 py-1.5 rounded-md bg-sidebar-primary/10 text-[10px] text-sidebar-primary tracking-wider">
          <Sparkles className="w-3 h-3" />
          PRIVATE CLIENT
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto arvest-scroll">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="text-[10px] font-medium text-sidebar-foreground/40 tracking-[0.18em] px-3 mb-1.5">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = current === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onNavigate(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors group ${
                      active
                        ? 'bg-sidebar-primary/15 text-sidebar-primary'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground'}`} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Compact Contact Banker */}
      <div className="p-3 border-t border-sidebar-border">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs border-sidebar-primary/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-primary/10 hover:text-sidebar-foreground"
            >
              <Phone className="w-3.5 h-3.5 mr-1.5" /> Contact Banker
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" side="top" align="center">
            <div className="text-[11px] text-muted-foreground tracking-wider uppercase mb-2 px-2">Your Private Banker</div>
            <div className="px-2 py-1.5 mb-1">
              <div className="font-serif-display text-base">Catherine Holloway</div>
              <div className="text-[11px] text-muted-foreground">Senior Private Banker</div>
            </div>
            <Separator className="my-1" />
            <a href="tel:+16156591539" className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm">
              <Phone className="w-4 h-4 text-primary" /> Call
              <span className="ml-auto text-[11px] text-muted-foreground">+1 615 659 1539</span>
            </a>
            <a href="sms:+16156591539" className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm">
              <MessageSquare className="w-4 h-4 text-primary" /> Text
              <span className="ml-auto text-[11px] text-muted-foreground">+1 615 659 1539</span>
            </a>
            <a href="mailto:catherine.holloway@arvestprivate.com" className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm">
              <Mail className="w-4 h-4 text-primary" /> Email
              <span className="ml-auto text-[11px] text-muted-foreground truncate">Catherine.H</span>
            </a>
            <button
              onClick={() => onNavigate('messages')}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm"
            >
              <MessageSquare className="w-4 h-4 text-primary" /> Send Message
              <span className="ml-auto text-[11px] text-muted-foreground">In-app</span>
            </button>
            <button
              onClick={() => onNavigate('appointments')}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm"
            >
              <Calendar className="w-4 h-4 text-primary" /> Book Appointment
              <span className="ml-auto text-[11px] text-muted-foreground">Phone/Branch</span>
            </button>
          </PopoverContent>
        </Popover>

        <button
          onClick={() => { logout().then(() => window.location.reload()); }}
          className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-md text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
