// ============================================================
// Arvest Private Banking — Client stores & formatting helpers
// ============================================================
import { create } from 'zustand';
import { getTabToken, setTabToken, clearTabToken } from '@/lib/fetch-client';

export interface AuthUser {
  id: string;
  email: string;
  loginId: string | null;
  name: string;
  role: 'CUSTOMER' | 'ADMIN';
  status?: string;
  avatarUrl?: string | null;
  createdAt?: string;
  phone?: string | null;
  address?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  setLoading: (l: boolean) => void;
  refresh: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  applyTabToken: (token: string) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  refresh: async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      if (data?.user) {
        set({ user: data.user, loading: false });
        return data.user;
      }
      clearTabToken();
      set({ user: null, loading: false });
      return null;
    } catch {
      set({ user: null, loading: false });
      return null;
    }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearTabToken();
    set({ user: null });
  },
  applyTabToken: (token: string) => {
    setTabToken(token);
  },
}));

// ---------------- UI navigation store ----------------

export type AdminView =
  | 'command' | 'customers' | 'customer-detail' | 'accounts' | 'transactions'
  | 'transfers' | 'zelle' | 'billpay' | 'deposits' | 'cards' | 'loans'
  | 'wallets' | 'messages' | 'appointments' | 'approvals' | 'risk'
  | 'reports' | 'settings' | 'audit';

export type ClientView =
  | 'home' | 'accounts' | 'transfers' | 'deposit' | 'billpay' | 'zelle'
  | 'cards' | 'markets' | 'wallet' | 'loans' | 'open-account' | 'messages'
  | 'appointments' | 'statements' | 'branches' | 'alerts' | 'profile';

interface UIState {
  adminView: AdminView;
  adminParams: Record<string, string>;
  adminNavigate: (view: AdminView, params?: Record<string, string>) => void;
  clientView: ClientView;
  clientParams: Record<string, string>;
  clientNavigate: (view: ClientView, params?: Record<string, string>) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  adminView: 'command',
  adminParams: {},
  adminNavigate: (view, params) => {
    set({ adminView: view, adminParams: params ?? {}, sidebarOpen: false });
    window.scrollTo({ top: 0 });
  },
  clientView: 'home',
  clientParams: {},
  clientNavigate: (view, params) => {
    set({ clientView: view, clientParams: params ?? {}, sidebarOpen: false });
    window.scrollTo({ top: 0 });
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#/${view}${params?.id ? `/${params.id}` : ''}`);
    }
  },
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

// ---------------- formatting helpers ----------------

export function formatCurrency(value: number | null | undefined, opts?: boolean | { cents?: boolean }): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const noCents = opts === true || (typeof opts === 'object' && opts?.cents === false);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: noCents ? 0 : 2,
    maximumFractionDigits: noCents ? 0 : 2,
  }).format(n);
}

export function maskAccountNumber(num: string | null | undefined): string {
  if (!num) return '••••';
  return `•••• ${num.slice(-4)}`;
}

export function formatDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(opts ?? {}) });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export { getTabToken };
