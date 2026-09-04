// GET|POST /api/cron/process — scheduled processing endpoint.
// Process bills that have come due. Can be called by Vercel Cron or
// any uptime pinger. When CRON_SECRET is set, requests must present
// it as a Bearer token or ?secret=.
import { NextRequest } from 'next/server';
import { handler, ok, fail } from '@/lib/api';
import { processDueBills } from '@/lib/banking';

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.nextUrl.searchParams.get('secret');
    if (provided !== secret) return fail('Unauthorized', 401);
  }
  const processed = await processDueBills();
  return ok({ success: true, processed });
}

export const GET = handler(run);
export const POST = handler(run);
