// Client-side fetch interceptor.
// Patches window.fetch so EVERY request to /api/* automatically includes
// the per-tab session token in the X-Tab-Session header.
// This avoids needing to refactor every fetch call across the app.

const TAB_TOKEN_KEY = 'arvest_tab_token';

let patched = false;

export function getTabToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(TAB_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTabToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TAB_TOKEN_KEY, token);
  } catch {}
}

export function clearTabToken() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TAB_TOKEN_KEY);
  } catch {}
}

// Patch window.fetch ONCE on the client. After this, any fetch('/api/...')
// will automatically send the X-Tab-Session header if a token exists.
export function installFetchInterceptor() {
  if (typeof window === 'undefined' || patched) return;
  patched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      // Only inject header for relative /api/ requests (avoid external)
      if (url && url.startsWith('/api/')) {
        const token = getTabToken();
        if (token) {
          const headers = new Headers(init?.headers || {});
          // Don't override if explicitly set
          if (!headers.has('X-Tab-Session')) {
            headers.set('X-Tab-Session', token);
          }
          return originalFetch(input, { ...init, headers });
        }
      }
    } catch {
      // Fall through to original fetch
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;
}
