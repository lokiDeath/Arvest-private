// ============================================================
// Arvest Private Banking — Bank settings (key/value with defaults)
// Read by financial workflows to decide auto-approval thresholds,
// limits and platform switches. Cached 10s in-process.
// ============================================================
import { db } from '@/lib/db';

export const SETTING_DEFAULTS: Record<string, string> = {
  // Auto-approval thresholds (USD). Amounts ABOVE the threshold are
  // held and routed to the Operations Queue; at or below → instant.
  'transfer.external.autoApproveUsd': '2500',
  'zelle.autoApproveUsd': '1000',
  'billpay.autoApproveUsd': '2000',
  'deposit.check.autoApproveUsd': '0', // mobile deposits always reviewed when 0
  'account.open.autoApproveUsd': '25000',
  'wallet.send.autoApproveUsd': '500',
  'loan.autoApproveUsd': '0', // loans always reviewed when 0

  // Per-operation limits
  'zelle.dailyLimitUsd': '5000',
  'deposit.check.maxUsd': '50000',
  'wallet.faucet.maxUsd': '10000',

  // Risk
  'risk.largeTxFlagUsd': '25000',

  // Platform
  'platform.name': 'Arvest Private Banking',
  'platform.maintenance': 'false',
  'platform.statementFooter': 'Arvest Private Banking · Member FDIC · NMLS #445836',
};

const globalCache = globalThis as unknown as { __arvestSettings?: { data: Record<string, string>; at: number } };
const TTL = 10_000;

export async function getSettings(force = false): Promise<Record<string, string>> {
  const cached = globalCache.__arvestSettings;
  if (!force && cached && Date.now() - cached.at < TTL) return cached.data;
  const rows = await db.setting.findMany();
  const data = { ...SETTING_DEFAULTS };
  for (const row of rows) data[row.key] = row.value;
  globalCache.__arvestSettings = { data, at: Date.now() };
  return data;
}

export async function getSetting(key: string): Promise<string> {
  const all = await getSettings();
  return all[key] ?? SETTING_DEFAULTS[key] ?? '';
}

export async function getNumber(key: string): Promise<number> {
  const v = await getSetting(key);
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : Number.parseFloat(SETTING_DEFAULTS[key] ?? '0');
}

export async function getBool(key: string): Promise<boolean> {
  return (await getSetting(key)) === 'true';
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
  const allowed = new Set(Object.keys(SETTING_DEFAULTS));
  const ops = Object.entries(entries)
    .filter(([k, v]) => allowed.has(k) && typeof v === 'string')
    .map(([key, value]) =>
      db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    );
  await db.$transaction(ops);
  globalCache.__arvestSettings = undefined;
}
