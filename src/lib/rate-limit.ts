// ============================================================
// Arvest Private Banking — Rate limiting (sliding window)
//
// In-memory per-instance limiter. On serverless each instance
// keeps its own window; this still blunts credential stuffing
// and brute-force bursts. For a hardened multi-instance deploy,
// back this with a shared store (e.g. Redis) — the interface
// below is intentionally small.
// ============================================================
import { HttpError } from '@/lib/api';

interface Bucket {
  hits: number[];
}

const globalStore = globalThis as unknown as { __arvestRateBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalStore.__arvestRateBuckets ?? new Map();
globalStore.__arvestRateBuckets = buckets;

export interface RateLimitOptions {
  /** unique limiter name, e.g. 'login' */
  name: string;
  /** max hits per window */
  limit: number;
  /** window length in ms */
  windowMs: number;
  /** extra key material (e.g. login identifier) */
  key?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const key = `${opts.name}:${opts.key ?? 'global'}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);
  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000)),
    };
  }
  bucket.hits.push(now);
  // opportunistic cleanup to bound memory
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > 3600_000) buckets.delete(k);
    }
  }
  return { allowed: true, remaining: opts.limit - bucket.hits.length, retryAfterSec: 0 };
}

/** Throwing variant for route handlers — raises HttpError 429. */
export function rateLimit(opts: RateLimitOptions): void {
  const r = checkRateLimit(opts);
  if (!r.allowed) {
    throw new HttpError(
      429,
      `Too many requests. Please try again in ${r.retryAfterSec}s.`,
      'RATE_LIMITED'
    );
  }
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 5 * 60_000 },
  lookup: { limit: 20, windowMs: 5 * 60_000 },
  forgot: { limit: 5, windowMs: 15 * 60_000 },
  reset: { limit: 10, windowMs: 15 * 60_000 },
  money: { limit: 90, windowMs: 60_000 },
  api: { limit: 300, windowMs: 60_000 },
} as const;
