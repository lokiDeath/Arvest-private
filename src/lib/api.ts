// ============================================================
// Arvest Private Banking — API foundation
// HttpError + handler wrapper + auth guards + response helpers.
// Every route handler is wrapped in `handler()` so failures
// always return a consistent { error } envelope with a real
// HTTP status code.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authFromRequest, SessionUser } from '@/lib/session';

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Resolve the signed-in user for this request (token header or session cookie). */
export async function auth(req: NextRequest): Promise<SessionUser | null> {
  return authFromRequest(req);
}

export async function requireAuth(req: NextRequest): Promise<SessionUser> {
  const user = await auth(req);
  if (!user) throw new HttpError(401, 'Authentication required', 'UNAUTHORIZED');
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<SessionUser> {
  const user = await requireAuth(req);
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Admin access required', 'FORBIDDEN');
  return user;
}

/** Frozen customers cannot operate outside of auth endpoints. */
export function assertNotFrozen(user: SessionUser) {
  if (user.status === 'FROZEN') {
    throw new HttpError(403, 'This account is frozen. Contact your relationship manager.', 'FROZEN');
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<NextResponse>;

/** Wrap a route handler with uniform error handling. */
export function handler<C>(fn: Handler<C>): Handler<C> {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return fail(e.message, e.status, e.code);
      }
      const message = e instanceof Error ? e.message : 'Unexpected server error';
      console.error('[api]', req.method, req.nextUrl.pathname, message);
      return fail('Internal server error', 500);
    }
  };
}

// ---------- shared domain helpers ----------

export function parseAmount(v: unknown): number {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) throw new HttpError(422, 'Amount must be a valid number');
  if (n <= 0) throw new HttpError(422, 'Amount must be greater than zero');
  if (n > 1_000_000_000) throw new HttpError(422, 'Amount exceeds the maximum allowed');
  return Math.round(n * 100) / 100;
}

export function requireString(v: unknown, field: string, opts?: { min?: number; max?: number }): string {
  const s = typeof v === 'string' ? v.trim() : '';
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 500;
  if (s.length < min) throw new HttpError(422, `${field} is required${min > 1 ? ` (min ${min} characters)` : ''}`);
  if (s.length > max) throw new HttpError(422, `${field} is too long (max ${max} characters)`);
  return s;
}

export function requireEnum<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  const s = typeof v === 'string' ? (v.trim() as T) : ('' as T);
  if (!allowed.includes(s)) {
    throw new HttpError(422, `${field} must be one of: ${allowed.join(', ')}`);
  }
  return s;
}

export function requireDate(v: unknown, field: string): Date {
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN);
  if (Number.isNaN(d.getTime())) throw new HttpError(422, `${field} must be a valid date`);
  return d;
}
