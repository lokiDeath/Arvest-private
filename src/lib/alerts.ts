// ============================================================
// Arvest Private Banking — Alert processing engine
// Called by the ledger layer AFTER a money movement commits.
// Rules:
//   BALANCE_BELOW      → fires when available drops under threshold
//                        (re-arms once balance recovers above it)
//   BALANCE_ABOVE      → fires when available rises over threshold
//                        (re-arms once it falls back below)
//   LARGE_TRANSACTION  → fires on any single movement ≥ threshold
// Evaluation is best-effort: failures are logged, never thrown.
// ============================================================
import { db } from '@/lib/db';

interface AlertEvalInput {
  userId: string;
  accountId: string;
  accountNickname: string;
  availableAfter: number;
  amount: number;
  direction: 'DEBIT' | 'CREDIT';
  reference: string;
  description: string;
}

export async function evaluateAlertsForEntry(input: AlertEvalInput): Promise<void> {
  try {
    // Rules bound to this account, plus unbound rules (all accounts).
    const rules = await db.alert.findMany({
      where: {
        enabled: true,
        userId: input.userId,
        OR: [{ accountId: input.accountId }, { accountId: null }],
      },
    });
    if (!rules.length) return;

    for (const rule of rules) {
      const threshold = rule.threshold ?? 0;
      let fired = false;
      let title = '';
      let body = '';

      if (rule.type === 'BALANCE_BELOW') {
        const condition = input.availableAfter < threshold;
        if (condition && !rule.lastState) {
          fired = true;
          title = 'Low balance alert';
          body = `${input.accountNickname} balance fell to $${input.availableAfter.toFixed(2)}, below your $${threshold.toFixed(2)} threshold.`;
        }
        await db.alert.update({ where: { id: rule.id }, data: { lastState: condition, ...(fired ? { lastFiredAt: new Date() } : {}) } });
      } else if (rule.type === 'BALANCE_ABOVE') {
        const condition = input.availableAfter >= threshold && threshold > 0;
        if (condition && !rule.lastState) {
          fired = true;
          title = 'Balance threshold reached';
          body = `${input.accountNickname} balance reached $${input.availableAfter.toFixed(2)}, above your $${threshold.toFixed(2)} threshold.`;
        }
        await db.alert.update({ where: { id: rule.id }, data: { lastState: condition, ...(fired ? { lastFiredAt: new Date() } : {}) } });
      } else if (rule.type === 'LARGE_TRANSACTION') {
        if (threshold > 0 && input.amount >= threshold) {
          fired = true;
          title = 'Large transaction alert';
          body = `${input.direction === 'DEBIT' ? 'Debit' : 'Credit'} of $${input.amount.toFixed(2)} on ${input.accountNickname}: ${input.description} (ref ${input.reference}).`;
        }
        if (fired) await db.alert.update({ where: { id: rule.id }, data: { lastFiredAt: new Date() } });
      }

      if (fired && rule.userId) {
        await db.notification.create({
          data: {
            recipientId: rule.userId,
            type: 'ALERT_TRIGGERED',
            title,
            body,
            userId: rule.userId,
          },
        });
      }
    }
  } catch (e) {
    console.error('[alerts]', e instanceof Error ? e.message : e);
  }
}

/** Evaluate alerts for every entry of a committed ledger transaction. */
export async function evaluateAlertsForLedgerTx(
  ledgerTxId: string,
  opts: { userId: string | null }
): Promise<void> {
  if (!opts.userId) return;
  try {
    const tx = await db.ledgerTransaction.findUnique({
      where: { id: ledgerTxId },
      include: { entries: { include: { account: { select: { nickname: true, userId: true } } } } },
    });
    if (!tx) return;
    for (const entry of tx.entries) {
      if (entry.account.userId !== opts.userId) continue; // alerts belong to the moving party
      await evaluateAlertsForEntry({
        userId: opts.userId,
        accountId: entry.accountId,
        accountNickname: entry.account.nickname,
        availableAfter: entry.availableAfter,
        amount: entry.amount,
        direction: entry.direction as 'DEBIT' | 'CREDIT',
        reference: tx.reference,
        description: tx.description,
      });
    }
  } catch (e) {
    console.error('[alerts]', e instanceof Error ? e.message : e);
  }
}
