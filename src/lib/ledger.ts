// ============================================================
// Arvest Private Banking — Atomic Double-Entry Ledger Engine
// ============================================================
// ALL money movement goes through postLedgerInTx(). Account
// balances (balance / available / held) are ONLY mutated here,
// inside a single Prisma interactive transaction together with
// the LedgerTransaction + LedgerEntry rows. No other code path
// may write account balance fields.
//
// Line semantics — each line moves `amount` from one bucket to
// another, where buckets are 'available' | 'held' | 'external':
//   • from:'available', to:'external'            → spend (debit)
//   • from:'external', to:'available'            → deposit (credit)
//   • from:'available', to:'held'                → place a hold
//   • from:'held',      to:'external'            → settle a hold (approved)
//   • from:'held',      to:'available'           → release a hold (declined)
//
// Guarantees:
//   • Atomicity — balances + entries commit or roll back together
//   • Sufficient funds / held funds re-checked atomically inside
//     the transaction via conditional updates (race-safe under
//     Postgres READ COMMITTED)
//   • Invariant balance == available + held maintained on every line
//   • Posted transactions are reversed with mirrored entries and
//     can never be reversed twice
// ============================================================
import { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';

type Tx = Prisma.TransactionClient | PrismaClient;

export type Bucket = 'available' | 'held' | 'external';

export type LedgerType =
  | 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL' | 'ZELLE' | 'BILLPAY'
  | 'LOAN_DISBURSEMENT' | 'LOAN_PAYMENT' | 'ADJUSTMENT' | 'REVERSAL'
  | 'FEE' | 'INTEREST' | 'HOLD' | 'RELEASE';

export interface LedgerLine {
  accountId: string;
  amount: number;
  /** where funds leave — default 'external' (money entering the bank) */
  from?: Bucket;
  /** where funds arrive — default 'external' (money leaving the bank) */
  to?: Bucket;
  memo?: string;
}

export interface PostLedgerInput {
  type: LedgerType;
  category?: string;
  reference: string;
  description: string;
  userId?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  status?: 'PENDING' | 'POSTED';
  meta?: Record<string, unknown>;
  lines: LedgerLine[];
}

export class LedgerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Post atomically in its own transaction. */
export async function postLedger(input: PostLedgerInput) {
  return db.$transaction((tx) => postLedgerInTx(tx, input), { timeout: 20_000 });
}

/**
 * Core posting routine — composable inside an existing interactive
 * transaction (e.g. request row + approval row in the same commit).
 */
export async function postLedgerInTx(
  tx: Tx,
  input: PostLedgerInput
): Promise<{ ledgerTxId: string; reference: string }> {
  if (!input.lines.length) throw new LedgerError('EMPTY', 'Ledger transaction needs at least one line');
  if (input.lines.length > 16) throw new LedgerError('TOO_MANY', 'Too many ledger lines');

  const ledgerTx = await tx.ledgerTransaction.create({
    data: {
      reference: input.reference,
      type: input.type,
      category: input.category ?? categoryForType(input.type),
      userId: input.userId ?? null,
      description: input.description,
      counterparty: input.counterparty ?? null,
      memo: input.memo ?? null,
      status: input.status ?? 'POSTED',
      meta: JSON.stringify(input.meta ?? {}),
      postedAt: (input.status ?? 'POSTED') === 'POSTED' ? new Date() : null,
    },
  });

  for (const line of input.lines) {
    const amount = round2(line.amount);
    if (!(amount > 0)) throw new LedgerError('BAD_AMOUNT', 'Ledger amounts must be positive');

    const from: Bucket = line.from ?? 'external';
    const to: Bucket = line.to ?? 'external';
    if (from === to) throw new LedgerError('BAD_LINE', 'Ledger line must move funds between buckets');

    const account = await tx.account.findUnique({ where: { id: line.accountId } });
    if (!account) throw new LedgerError('ACCOUNT_NOT_FOUND', `Account ${line.accountId} not found`);

    const availableDelta = round2((to === 'available' ? amount : 0) - (from === 'available' ? amount : 0));
    const heldDelta = round2((to === 'held' ? amount : 0) - (from === 'held' ? amount : 0));

    // Atomic conditional update: guards re-checked at UPDATE time, race-free.
    const where: Prisma.AccountWhereUniqueInput = { id: account.id };
    const data: Prisma.AccountUpdateManyMutationInput = {};
    if (from === 'available') data.available = { decrement: amount };
    if (to === 'available') data.available = { increment: amount };
    if (from === 'held') data.held = { decrement: amount };
    if (to === 'held') data.held = { increment: amount };
    // balance = available + held is maintained explicitly for exact before/after capture
    const balanceDelta = round2(availableDelta + heldDelta);
    if (balanceDelta !== 0) data.balance = { [balanceDelta > 0 ? 'increment' : 'decrement']: Math.abs(balanceDelta) } as Prisma.AccountUpdateManyMutationInput['balance'];

    const guard: Prisma.AccountWhereInput = { id: account.id };
    if (availableDelta < 0) guard.available = { gte: -availableDelta - 1e-9 };
    if (heldDelta < 0) guard.held = { gte: -heldDelta - 1e-9 };
    if (balanceDelta < 0) guard.balance = { gte: -balanceDelta - 1e-9 };

    const res = await tx.account.updateMany({ where: guard, data });
    if (res.count === 0) {
      const fresh = await tx.account.findUnique({ where: where });
      const deficit =
        availableDelta < 0 && fresh ? Math.abs(availableDelta) - fresh.available : null;
      throw new LedgerError(
        'INSUFFICIENT_FUNDS',
        deficit !== null && deficit > 0.005
          ? `Insufficient funds in ${fresh?.nickname ?? 'account'} (short by $${deficit.toFixed(2)})`
          : `Insufficient funds in ${account.nickname}`
      );
    }

    const after = await tx.account.findUniqueOrThrow({ where: where });
    // Derive exact before values from the atomic outcome (race-safe).
    const availableBefore = round2(after.available - availableDelta);
    const balanceBefore = round2(after.balance - balanceDelta);
    if (after.available < -1e-9 || after.held < -1e-9 || after.balance < -1e-9) {
      throw new LedgerError('NEGATIVE_BALANCE', 'Refusing to post: balances must stay non-negative');
    }

    await tx.ledgerEntry.create({
      data: {
        ledgerTxId: ledgerTx.id,
        accountId: account.id,
        direction: balanceDelta < 0 ? 'DEBIT' : 'CREDIT',
        amount,
        bucketFrom: from,
        bucketTo: to,
        balanceBefore,
        balanceAfter: after.balance,
        availableBefore,
        availableAfter: after.available,
        memo: line.memo ?? null,
      },
    });
  }

  return { ledgerTxId: ledgerTx.id, reference: input.reference };
}

/**
 * Reverse a previously posted ledger transaction atomically:
 * creates a REVERSAL ledger tx with mirrored lines and marks the
 * original REVERSED. Posted history is never deleted.
 */
export async function reverseLedger(originalId: string, actor: string, reason: string, reference?: string) {
  return db.$transaction(
    async (tx) => {
      const original = await tx.ledgerTransaction.findUnique({
        where: { id: originalId },
        include: { entries: true },
      });
      if (!original) throw new LedgerError('NOT_FOUND', 'Ledger transaction not found');
      if (original.type === 'REVERSAL') throw new LedgerError('NOT_REVERSIBLE', 'Reversal transactions cannot be reversed');
      if (original.status === 'REVERSED') throw new LedgerError('ALREADY_REVERSED', 'Transaction already reversed');
      if (original.status !== 'POSTED' && original.status !== 'FLAGGED') {
        throw new LedgerError('NOT_POSTED', 'Only posted transactions can be reversed');
      }
      if (!original.postedAt) throw new LedgerError('NOT_POSTED', 'Transaction has not been posted');

      const reversalRef = reference ?? `ARP-RV-${original.reference.replace(/^ARP-/, '')}-${Date.now().toString(36).toUpperCase()}`;

      const reversal = await postLedgerInTx(tx, {
        type: 'REVERSAL',
        category: 'REVERSAL',
        userId: original.userId,
        reference: reversalRef,
        description: `Reversal of ${original.reference} — ${reason}`,
        counterparty: original.counterparty,
        meta: { reversalOf: original.reference, actor, reason },
        lines: original.entries.map((e) => {
          // Mirror the original movement: swap source and destination buckets.
          const from = (e.bucketTo as Bucket | null) ?? 'external';
          const to = (e.bucketFrom as Bucket | null) ?? 'external';
          return { accountId: e.accountId, amount: e.amount, from, to, memo: `Reversal: ${e.memo ?? original.description}` };
        }),
      });

      await tx.ledgerTransaction.update({
        where: { id: original.id },
        data: { status: 'REVERSED', meta: JSON.stringify({ ...(safeParse(original.meta)), reversedBy: reversal.reference, reversalActor: actor, reversalReason: reason }) },
      });

      return reversal;
    },
    { timeout: 20_000 }
  );
}

/**
 * Mark a PENDING (hold) ledger transaction as decided and settle or
 * release its hold. The hold line must be the first entry.
 */
export async function settleHold(
  holdTxId: string,
  decision: 'APPROVED' | 'REJECTED',
  opts: { actor: string; reason?: string }
): Promise<{ settleRef: string }> {
  return db.$transaction(
    async (tx) => {
      const hold = await tx.ledgerTransaction.findUnique({
        where: { id: holdTxId },
        include: { entries: true },
      });
      if (!hold) throw new LedgerError('NOT_FOUND', 'Pending transaction not found');
      if (hold.status !== 'PENDING') {
        throw new LedgerError('ALREADY_DECIDED', `Transaction already decided (${hold.status})`);
      }
      const holdEntry = hold.entries.find((e) => e.bucketFrom === 'available' && e.bucketTo === 'held');
      if (!holdEntry) throw new LedgerError('NOT_HOLD', 'Transaction does not hold funds');

      if (decision === 'APPROVED') {
        // Settle: held funds leave the bank (held → external).
        const settle = await postLedgerInTx(tx, {
          type: (hold.type as LedgerType) ?? 'TRANSFER',
          category: hold.category,
          userId: hold.userId,
          reference: `ARP-STL-${hold.reference.replace(/^ARP-[A-Z]+-/, '')}`,
          description: hold.description,
          counterparty: hold.counterparty,
          meta: { ...safeParse(hold.meta), settledHoldOf: hold.reference, approvedBy: opts.actor },
          lines: hold.entries.map((e) => ({
            accountId: e.accountId,
            amount: e.amount,
            from: (e.bucketTo as Bucket) ?? 'external',
            to: 'external' as Bucket,
            memo: e.memo ?? undefined,
          })),
        });
        await tx.ledgerTransaction.update({
          where: { id: hold.id },
          data: { status: 'POSTED', postedAt: new Date(), meta: JSON.stringify({ ...safeParse(hold.meta), settledBy: settle.reference }) },
        });
        return { settleRef: settle.reference };
      }

      // REJECTED: release held funds back to available.
      const release = await postLedgerInTx(tx, {
        type: 'RELEASE',
        category: 'REVERSAL',
        userId: hold.userId,
        reference: `ARP-RLS-${hold.reference.replace(/^ARP-[A-Z]+-/, '')}`,
        description: `Hold released — ${opts.reason ?? 'request declined'}`,
        meta: { ...safeParse(hold.meta), releaseOf: hold.reference, rejectedBy: opts.actor },
        lines: hold.entries.map((e) => ({
          accountId: e.accountId,
          amount: e.amount,
          from: 'held' as Bucket,
          to: 'available' as Bucket,
          memo: `Release: ${e.memo ?? hold.description}`,
        })),
      });
      await tx.ledgerTransaction.update({
        where: { id: hold.id },
        data: { status: 'DECLINED', meta: JSON.stringify({ ...safeParse(hold.meta), releasedBy: release.reference }) },
      });
      return { settleRef: release.reference };
    },
    { timeout: 20_000 }
  );
}

function categoryForType(type: LedgerType): string {
  switch (type) {
    case 'ZELLE': return 'ZELLE';
    case 'BILLPAY': return 'PAYMENT';
    case 'LOAN_DISBURSEMENT':
    case 'LOAN_PAYMENT': return 'LOAN';
    case 'ADJUSTMENT': return 'ADJUSTMENT';
    case 'REVERSAL': return 'REVERSAL';
    case 'FEE': return 'FEE';
    case 'INTEREST': return 'INTEREST';
    default: return type;
  }
}

export function safeParse(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
