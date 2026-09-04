// POST /api/profile/upload — avatar upload (base64 data URL, size-capped).
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson } from '@/lib/api';
import { db } from '@/lib/db';

const MAX = 400_000; // ~300KB base64

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<{ image?: string }>(req);
  const image = body.image ?? '';
  if (!image.startsWith('data:image/')) return ok({ error: 'Image must be a JPEG/PNG data URL' }, { status: 422 });
  if (image.length > MAX) return ok({ error: 'Image is too large (max ~300KB)' }, { status: 422 });
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: image } });
  return ok({ success: true, avatarUrl: image });
});
