'use client';

// Reads the params attached to the current admin view.
import { useUI } from '@/lib/store';

export function useParamsFromStore(view: string): string | null {
  const adminView = useUI((s) => s.adminView);
  const adminParams = useUI((s) => s.adminParams);
  if (adminView !== view) return null;
  return adminParams.id ?? null;
}
