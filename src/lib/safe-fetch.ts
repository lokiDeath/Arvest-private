// Client fetch helper — uniform JSON handling with typed errors.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, `Unexpected response (${res.status})`);
  }
  const obj = data as Record<string, unknown>;
  if (!res.ok || (obj && typeof obj.error === 'string')) {
    throw new ApiError(res.status, (obj?.error as string) ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Fire a POST/PUT/PATCH/DELETE with a JSON body and an idempotency key. */
export function apiSend<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'Idempotency-Key': (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    },
  });
}

/** Legacy helper kept for existing customer components. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function safeJsonFetch<T = any>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    return await apiFetch<T>(url, init);
  } catch {
    return null;
  }
}
