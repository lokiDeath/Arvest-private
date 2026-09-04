// GET/PUT /api/admin/settings — bank configuration.
// PUT only accepts keys from SETTING_DEFAULTS (whitelist).
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson } from '@/lib/api';
import { getSettings, setSettings, SETTING_DEFAULTS } from '@/lib/settings';
import { audit } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const settings = await getSettings(true);
  return ok({ settings, keys: Object.keys(SETTING_DEFAULTS) });
});

export const PUT = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<Record<string, unknown>>(req);
  const entries: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k in SETTING_DEFAULTS && typeof v === 'string') entries[k] = v;
    else if (k in SETTING_DEFAULTS && typeof v === 'number') entries[k] = String(v);
    else if (k in SETTING_DEFAULTS && typeof v === 'boolean') entries[k] = String(v);
  }
  await setSettings(entries);
  await audit(admin.id, admin.email, 'ADMIN_SETTINGS', JSON.stringify(entries));
  const settings = await getSettings(true);
  return ok({ success: true, settings });
});
