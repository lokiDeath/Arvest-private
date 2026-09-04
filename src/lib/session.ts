// ============================================================
// Arvest Private Banking — Session & authentication core
//
// Stateless per-tab session tokens (HMAC-signed), a deliberate
// product feature: every browser tab holds its own session and
// re-login is required in a new tab. Tokens travel in the
// X-Tab-Session header; an httpOnly cookie mirrors the token so
// non-browser clients (tests, curl) can authenticate too.
//
// Security notes:
//   • Signature comparison uses timingSafeEqual.
//   • SESSION_SECRET is REQUIRED in production (>= 32 chars).
//   • Tokens carry userId/role/name + tabId + exp; role and
//     status are re-verified against the database on every
//     authenticated request (see authFromRequest in api.ts).
// ============================================================
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SESSION_COOKIE = 'arvest_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET is missing or too short (min 32 chars). ' +
          'Set it in the environment before running in production.'
      );
    }
    return 'arvest-development-only-secret-0123456789abcdef';
  }
  return secret;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  name: string;
  tabId: string;
  iat: number;
  exp: number;
}

export interface SessionUser {
  id: string;
  email: string;
  loginId: string | null;
  name: string;
  role: 'CUSTOMER' | 'ADMIN';
  status: string;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

export function createToken(payload: Omit<SessionPayload, 'iat' | 'exp' | 'tabId'> & { tabId?: string }): {
  token: string;
  tabId: string;
  expiresAt: Date;
} {
  const now = Date.now();
  const tabId = payload.tabId ?? crypto.randomBytes(16).toString('hex');
  const full: SessionPayload = { ...payload, tabId, iat: now, exp: now + SESSION_TTL_MS };
  const data = Buffer.from(JSON.stringify(full)).toString('base64url');
  const token = `${data}.${sign(data)}`;
  return { token, tabId, expiresAt: new Date(now + SESSION_TTL_MS) };
}

export function verifyToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = sign(data);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    if (!payload.userId || (payload.role !== 'CUSTOMER' && payload.role !== 'ADMIN')) return null;
    return payload;
  } catch {
    return null;
  }
}

function tokenFromRequest(req: NextRequest): string | null {
  const header = req.headers.get('x-tab-session');
  if (header) return header;
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Resolve the session token to a live database user.
 * Role/status are re-read from the DB so revoked/frozen users
 * lose access immediately even with a valid token.
 */
export async function authFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const payload = verifyToken(tokenFromRequest(req));
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      loginId: true,
      name: true,
      role: true,
      status: true,
      phone: true,
      address: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
  if (!user) return null;
  return user as SessionUser;
}

/** Attach the session token as an httpOnly cookie (used by login/register responses). */
export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

// ---------- shared generators ----------

export function genResetCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function genAccountNumber(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += crypto.randomInt(0, 10).toString();
  return s;
}

let refCounter = 0;
/** Unique human-readable reference: ARP-TYPE-base36(ts)+seq+rand */
export function genReference(prefix: string): string {
  refCounter = (refCounter + 1) % 1296;
  const seq = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ctr = refCounter.toString(36).toUpperCase().padStart(2, '0');
  return `ARP-${prefix}-${seq}${ctr}${rand}`;
}

export const ARVEST_ROUTING = process.env.ARVEST_ROUTING || '082900883';
