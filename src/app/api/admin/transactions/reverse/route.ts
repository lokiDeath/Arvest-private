// POST /api/admin/transactions/reverse — mirror a posted transaction.
// Creates a REVERSAL ledger transaction with mirrored entries; the
// original is marked REVERSED and remains part of the permanent record.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireString } from '@/lib/api';
import { reverseLedgerTx } from '@/lib/banking';

export const POST = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<{ ledgerTxId?: string; reason?: string }>(req);
  const ledgerTxId = requireString(body.ledgerTxId, 'Transaction id');
  const reason = requireString(body.reason, 'Reversal reason', { min: 3, max: 300 });
  const res = await reverseLedgerTx(admin, ledgerTxId, reason);
  return ok({ success: true, reversalRef: res.reference });
});
