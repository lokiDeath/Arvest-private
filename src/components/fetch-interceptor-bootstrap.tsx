'use client';

import { useEffect } from 'react';
import { installFetchInterceptor } from '@/lib/fetch-client';

// Tiny client component that installs the fetch interceptor on app startup.
// Mounted once at the root layout level.
export function FetchInterceptorBootstrap() {
  useEffect(() => {
    installFetchInterceptor();
  }, []);
  return null;
}
