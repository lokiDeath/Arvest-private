// ============================================================
// Arvest Private Banking — Banking workflow engine
// ============================================================
// Single source of truth for every financial workflow. Routes are
// thin: they authenticate, validate, then call into this module.
//
// Rules enforced here:
//   • Money only moves through lib/ledger.ts (double entry).
//   • Amounts above the configured auto-approval threshold are
//     HELD (available → held) and routed to the Operations Queue;
//     at/below the threshold they post instantly.
//   • Every decision (approve/reject) locks the Approval row
//     FOR UPDATE, checks status == PENDING, and settles or
//     releases the hold exactly once (409 otherwise).
//   • Domain records (Zelle / BillPay / CheckDeposit / Loan /
//     WalletTransaction) stay synchronized with their underlying
//     ledger transaction — always inside the same commit.
// ============================================================
import { db } from '@/lib/db';
import { HttpError } from '@/lib/api';
import { postLedger, postLedgerInTx, reverseLedger, settleHold, round2, LedgerError, safeParse } from '@/lib/ledger';
import { genReference, genAccountNumber } from '@/lib/session';
import { getNumber } from '@/lib/settings';
import { evaluateAlertsForLedgerTx } from '@/lib/alerts';
import { audit, notifyCustomer, notifyAdmins } from '@/lib/notify';
import type { Prisma, PrismaClient } from '@prisma/client';


type Tx = Prisma.TransactionClient | PrismaClient;

// ------------------------------------------------------------------
// Post + follow-up (alerts) helper
// ------------------------------------------------------------------
export async function postAndAlert(input: Parameters<typeof postLedger>[0]) {
  const res = await postLedger(input);
  await evaluateAlertsForLedgerTx(res.ledgerTxId, { userId: input.userId ?? null });
  return res;
}

// ------------------------------------------------------------------
// Account helpers
// ------------------------------------------------------------------
export async function getOwnedAccount(accountId: string, userId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new HttpError(404, 'Account not found', 'NOT_FOUND');
  return account;
}

export function assertAccountActive(account: { status: string; nickname: string }) {
  if (account.status === 'FROZEN') throw new HttpError(423, `${account.nickname} is frozen — contact your relationship manager.`, 'ACCOUNT_FROZEN');
  if (account.status === 'CLOSED') throw new HttpError(423, `${account.nickname} is closed.`, 'ACCOUNT_CLOSED');
}

export async function getAnyAccount(accountId: string) {
  const account = await db.account.findUnique({ where: { id: accountId }, include: { user: { select: { name: true, email: true } } } });
  if (!account) throw new HttpError(404, 'Account not found', 'NOT_FOUND');
  return account;
}

// ------------------------------------------------------------------
// Transfers (internal instant / external threshold-gated)
// ------------------------------------------------------------------
export interface Actor {
  id: string;
  email: string;
  name: string;
  loginId?: string | null;
}

interface TransferInput {
  fromAccountId: string;
  toAccountId?: string | null;
  transferType: 'INTERNAL' | 'EXTERNAL';
  amount: number;
  recipientName?: string;
  memo?: string;
  ip?: string;
}

export async function submitTransfer(user: Actor, input: TransferInput) {
  const amount = round2(input.amount);
  const from = await getOwnedAccount(input.fromAccountId, user.id);
  assertAccountActive(from);

  if (input.transferType === 'INTERNAL') {
    if (!input.toAccountId) throw new HttpError(422, 'Select a destination account');
    const to = await getOwnedAccount(input.toAccountId, user.id);
    assertAccountActive(to);
    if (to.id === from.id) throw new HttpError(422, 'Choose two different accounts');
    const reference = genReference('TRF');
    try {
      const res = await postAndAlert({
        type: 'TRANSFER',
        category: 'TRANSFER',
        userId: user.id,
        reference,
        description: `Transfer to ${to.nickname}`,
        counterparty: `${to.type} · ${to.accountNumber.slice(-4)}`,
        memo: input.memo,
        lines: [
          { accountId: from.id, amount, from: 'available', to: 'external', memo: input.memo },
          { accountId: to.id, amount, from: 'external', to: 'available', memo: input.memo },
        ],
        meta: { transferType: 'INTERNAL', by: user.loginId ?? user.email },
      });
      return { status: 'COMPLETED' as const, reference: res.reference, pending: false };
    } catch (e) {
      throw translateLedgerError(e);
    }
  }

  // EXTERNAL transfer
  const recipientName = (input.recipientName ?? '').trim();
  if (recipientName.length < 2) throw new HttpError(422, 'Recipient name is required');
  const threshold = await getNumber('transfer.external.autoApproveUsd');
  const reference = genReference('EXT');
  const meta = {
    transferType: 'EXTERNAL',
    recipientName,
    by: user.loginId ?? user.email,
    fromAccount: from.accountNumber.slice(-4),
  };

  try {
    if (amount <= threshold) {
      const res = await postAndAlert({
        type: 'TRANSFER',
        category: 'TRANSFER',
        userId: user.id,
        reference,
        description: `External transfer to ${recipientName}`,
        counterparty: recipientName,
        memo: input.memo,
        lines: [{ accountId: from.id, amount, from: 'available', to: 'external', memo: input.memo }],
        meta: { ...meta, decision: 'AUTO_APPROVED' },
      });
      await notifyAdmins('TRANSFER', 'External transfer posted', `${user.name} sent $${amount.toFixed(2)} to ${recipientName} (auto-approved).`, user.id);
      return { status: 'COMPLETED' as const, reference: res.reference, pending: false };
    }

    // Hold funds + queue approval — atomic
    const { approvalId } = await db.$transaction(async (tx) => {
      const ledger = await postLedgerInTx(tx, {
        type: 'TRANSFER',
        category: 'TRANSFER',
        userId: user.id,
        reference,
        description: `External transfer to ${recipientName}`,
        counterparty: recipientName,
        memo: input.memo,
        status: 'PENDING',
        lines: [{ accountId: from.id, amount, from: 'available', to: 'held', memo: input.memo }],
        meta: { ...meta, decision: 'PENDING_APPROVAL' },
      });
      const approval = await tx.approval.create({
        data: {
          type: 'EXTERNAL_TRANSFER',
          reference: genReference('APR'),
          userId: user.id,
          amount,
          requestedBy: user.loginId ?? user.email,
          payload: JSON.stringify({
            ledgerTxId: ledger.ledgerTxId,
            fromAccountId: from.id,
            fromAccountMask: maskAccount(from.accountNumber),
            recipientName,
            memo: input.memo,
            kind: 'EXTERNAL_TRANSFER',
          }),
        },
      });
      return { approvalId: approval.id };
    });
    await notifyAdmins('APPROVAL', 'External transfer needs review', `${user.name} — $${amount.toFixed(2)} to ${recipientName} exceeds the auto-approval limit.`, user.id);
    await notifyCustomer(user.id, 'TRANSFER', 'Transfer pending review', `Your $${amount.toFixed(2)} external transfer to ${recipientName} is pending bank approval. Funds are on hold.`, user.id);
    return { status: 'PENDING' as const, reference, pending: true, approvalId };
  } catch (e) {
    throw translateLedgerError(e);
  }
}

// ------------------------------------------------------------------
// Zelle
// ------------------------------------------------------------------
export interface ZelleInput {
  fromAccountId: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  amount: number;
  memo?: string;
}

export async function submitZelle(user: Actor, input: ZelleInput) {
  const amount = round2(input.amount);
  if (!input.recipientEmail && !input.recipientPhone) {
    throw new HttpError(422, 'Provide a recipient email or phone number');
  }
  const from = await getOwnedAccount(input.fromAccountId, user.id);
  assertAccountActive(from);
  const dailyLimit = await getNumber('zelle.dailyLimitUsd');
  const todayTotal = await todayZelleTotal(user.id);
  if (todayTotal + amount > dailyLimit) {
    throw new HttpError(422, `Zelle daily limit is $${dailyLimit.toFixed(2)}. Sent today: $${todayTotal.toFixed(2)}.`);
  }

  const threshold = await getNumber('zelle.autoApproveUsd');
  const reference = genReference('ZL');
  const target = input.recipientEmail || input.recipientPhone || '';
  const meta = { kind: 'ZELLE', by: user.loginId ?? user.email, fromAccount: maskAccount(from.accountNumber) };

  try {
    if (amount <= threshold) {
      const res = await db.$transaction(async (tx) => {
        const ledger = await postLedgerInTx(tx, {
          type: 'ZELLE',
          category: 'ZELLE',
          userId: user.id,
          reference,
          description: `Zelle to ${input.recipientName}`,
          counterparty: target,
          memo: input.memo,
          lines: [{ accountId: from.id, amount, from: 'available', to: 'external' }],
          meta: { ...meta, decision: 'AUTO_APPROVED', zelleRef: reference },
        });
        const zelle = await tx.zelleTransfer.create({
          data: {
            userId: user.id,
            fromAccountId: from.id,
            recipientName: input.recipientName,
            recipientEmail: input.recipientEmail ?? null,
            recipientPhone: input.recipientPhone ?? null,
            amount,
            memo: input.memo,
            status: 'COMPLETED',
            reference,
            ledgerTxId: ledger.ledgerTxId,
            completedAt: new Date(),
          },
        });
        return { ledger, zelle };
      });
      await evaluateAlertsForLedgerTx(res.ledger.ledgerTxId, { userId: user.id });
      return { status: 'COMPLETED' as const, reference, pending: false };
    }

    const { approvalId } = await db.$transaction(async (tx) => {
      const ledger = await postLedgerInTx(tx, {
        type: 'ZELLE',
        category: 'ZELLE',
        userId: user.id,
        reference,
        description: `Zelle to ${input.recipientName}`,
        counterparty: target,
        memo: input.memo,
        status: 'PENDING',
        lines: [{ accountId: from.id, amount, from: 'available', to: 'held' }],
        meta: { ...meta, decision: 'PENDING_APPROVAL', zelleRef: reference },
      });
      const zelle = await tx.zelleTransfer.create({
        data: {
          userId: user.id,
          fromAccountId: from.id,
          recipientName: input.recipientName,
          recipientEmail: input.recipientEmail ?? null,
          recipientPhone: input.recipientPhone ?? null,
          amount,
          memo: input.memo,
          status: 'ON_HOLD',
          reference,
          approvalId: '',
          ledgerTxId: ledger.ledgerTxId,
        },
      });
      const approval = await tx.approval.create({
        data: {
          type: 'ZELLE',
          reference: genReference('APR'),
          userId: user.id,
          amount,
          requestedBy: user.loginId ?? user.email,
          payload: JSON.stringify({
            ledgerTxId: ledger.ledgerTxId,
            zelleId: zelle.id,
            fromAccountId: from.id,
            fromAccountMask: maskAccount(from.accountNumber),
            recipientName: input.recipientName,
            recipient: target,
            memo: input.memo,
            kind: 'ZELLE',
          }),
        },
      });
      await tx.zelleTransfer.update({ where: { id: zelle.id }, data: { approvalId: approval.id } });
      return { approvalId: approval.id };
    });
    await notifyAdmins('APPROVAL', 'Zelle needs review', `${user.name} — Zelle $${amount.toFixed(2)} to ${input.recipientName} exceeds the auto-approval limit.`, user.id);
    return { status: 'ON_HOLD' as const, reference, pending: true, approvalId };
  } catch (e) {
    throw translateLedgerError(e);
  }
}

async function todayZelleTotal(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const agg = await db.zelleTransfer.aggregate({
    where: { userId, createdAt: { gte: start }, status: { in: ['COMPLETED', 'ON_HOLD'] } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

// ------------------------------------------------------------------
// Bill Pay (scheduling + due processing)
// ------------------------------------------------------------------
export interface BillPayInput {
  accountId: string;
  payee: string;
  payeeAccount?: string;
  amount: number;
  memo?: string;
  payDate: Date;
}

export async function scheduleBillPay(user: Actor, input: BillPayInput) {
  const amount = round2(input.amount);
  const account = await getOwnedAccount(input.accountId, user.id);
  assertAccountActive(account);
  const reference = genReference('BIL');
  const bill = await db.billPay.create({
    data: {
      userId: user.id,
      accountId: account.id,
      payee: input.payee,
      payeeAccount: input.payeeAccount ?? null,
      amount,
      memo: input.memo,
      payDate: input.payDate,
      reference,
      status: 'SCHEDULED',
    },
  });
  if (input.payDate.getTime() <= Date.now() + 60_000) {
    await processBill(bill.id);
    // Return the post-processing state so the client sees PAID / ON_HOLD / FAILED.
    return (await db.billPay.findUnique({ where: { id: bill.id } }))!;
  }
  return bill;
}

/** Attempt to pay a single bill now (threshold → hold+approval or instant). */
export async function processBill(billId: string): Promise<'PAID' | 'ON_HOLD' | 'SKIPPED'> {
  const bill = await db.billPay.findUnique({ where: { id: billId }, include: { account: true } });
  if (!bill || bill.status !== 'SCHEDULED') return 'SKIPPED';
  if (bill.payDate.getTime() > Date.now()) return 'SKIPPED';
  if (bill.account.status !== 'ACTIVE') {
    await db.billPay.update({ where: { id: bill.id }, data: { status: 'FAILED' } });
    return 'SKIPPED';
  }

  const threshold = await getNumber('billpay.autoApproveUsd');
  const meta = { kind: 'BILLPAY', billId: bill.id, by: 'schedule', payee: bill.payee };

  try {
    if (bill.amount <= threshold) {
      await db.$transaction(async (tx) => {
        const ledger = await postLedgerInTx(tx, {
          type: 'BILLPAY',
          category: 'PAYMENT',
          userId: bill.userId,
          reference: genReference('PAY'),
          description: `Bill payment — ${bill.payee}`,
          counterparty: bill.payee,
          memo: bill.memo,
          lines: [{ accountId: bill.accountId, amount: bill.amount, from: 'available', to: 'external' }],
          meta: { ...meta, billRef: bill.reference, decision: 'AUTO_APPROVED' },
        });
        await tx.billPay.update({ where: { id: bill.id }, data: { status: 'PAID', ledgerTxId: ledger.ledgerTxId, paidAt: new Date() } });
        return ledger;
      }).then(async (r) => {
        await evaluateAlertsForLedgerTx(r.ledgerTxId, { userId: bill.userId });
      });
      return 'PAID';
    }

    const approval = await db.$transaction(async (tx) => {
      const ledger = await postLedgerInTx(tx, {
        type: 'BILLPAY',
        category: 'PAYMENT',
        userId: bill.userId,
        reference: genReference('PAY'),
        description: `Bill payment — ${bill.payee}`,
        counterparty: bill.payee,
        memo: bill.memo,
        status: 'PENDING',
        lines: [{ accountId: bill.accountId, amount: bill.amount, from: 'available', to: 'held' }],
        meta: { ...meta, billRef: bill.reference, decision: 'PENDING_APPROVAL' },
      });
      const apr = await tx.approval.create({
        data: {
          type: 'BILLPAY',
          reference: genReference('APR'),
          userId: bill.userId,
          amount: bill.amount,
          requestedBy: 'schedule',
          payload: JSON.stringify({
            ledgerTxId: ledger.ledgerTxId,
            billId: bill.id,
            billRef: bill.reference,
            payee: bill.payee,
            accountMask: maskAccount(bill.account.accountNumber),
            memo: bill.memo,
            kind: 'BILLPAY',
          }),
        },
      });
      await tx.billPay.update({ where: { id: bill.id }, data: { status: 'ON_HOLD', approvalId: apr.id, ledgerTxId: ledger.ledgerTxId } });
      return apr;
    });
    await notifyAdmins('APPROVAL', 'Bill payment needs review', `${bill.payee} — $${bill.amount.toFixed(2)} exceeds the auto-approval limit.`, bill.userId);
    return 'ON_HOLD';
  } catch (e) {
    if (e instanceof LedgerError && e.code === 'INSUFFICIENT_FUNDS') {
      await db.billPay.update({ where: { id: bill.id }, data: { status: 'FAILED' } });
      await notifyCustomer(bill.userId, 'BILL_PAY', 'Bill payment failed', `Payment to ${bill.payee} failed — insufficient funds in ${bill.account.nickname}.`, bill.userId);
      return 'SKIPPED';
    }
    throw e;
  }
}

/** Lazy scheduler: process every bill that has come due. */
export async function processDueBills(): Promise<number> {
  const due = await db.billPay.findMany({
    where: { status: 'SCHEDULED', payDate: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  let n = 0;
  for (const bill of due) {
    const r = await processBill(bill.id);
    if (r === 'PAID' || r === 'ON_HOLD') n++;
  }
  return n;
}

// ------------------------------------------------------------------
// Mobile check deposit
// ------------------------------------------------------------------
export async function submitCheckDeposit(
  user: Actor,
  input: { accountId: string; amount: number; checkNumber?: string; frontImage?: string; backImage?: string; memo?: string }
) {
  const amount = round2(input.amount);
  const account = await getOwnedAccount(input.accountId, user.id);
  assertAccountActive(account);
  const max = await getNumber('deposit.check.maxUsd');
  if (amount > max) throw new HttpError(422, `Mobile deposit limit is $${max.toFixed(2)} per check`);

  const autoUsd = await getNumber('deposit.check.autoApproveUsd');
  const reference = genReference('DEP');
  const autoApprove = autoUsd > 0 && amount <= autoUsd;

  const deposit = await db.$transaction(async (tx) => {
    const dep = await tx.checkDeposit.create({
      data: {
        userId: user.id,
        accountId: account.id,
        amount,
        checkNumber: input.checkNumber,
        frontImage: input.frontImage,
        backImage: input.backImage,
        memo: input.memo,
        reference,
        status: 'PENDING',
      },
    });
    const apr = await tx.approval.create({
      data: {
        type: 'CHECK_DEPOSIT',
        reference: genReference('APR'),
        userId: user.id,
        amount,
        requestedBy: user.loginId ?? user.email,
        payload: JSON.stringify({
          depositId: dep.id,
          accountId: account.id,
          accountMask: maskAccount(account.accountNumber),
          amount,
          checkNumber: input.checkNumber,
          hasFront: Boolean(input.frontImage),
          hasBack: Boolean(input.backImage),
          kind: 'CHECK_DEPOSIT',
        }),
      },
    });
    return { dep, apr };
  });

  await db.checkDeposit.update({ where: { id: deposit.dep.id }, data: { approvalId: deposit.apr.id } });
  await notifyAdmins('APPROVAL', 'Mobile deposit needs review', `${user.name} deposited a $${amount.toFixed(2)} check into ${account.nickname}.`, user.id);
  await notifyCustomer(user.id, 'DEPOSIT', 'Deposit received', `Your $${amount.toFixed(2)} mobile deposit is under review. We'll notify you once it's credited.`, user.id);
  return { deposit: deposit.dep, approvalId: deposit.apr.id, autoApprove };
}

// ------------------------------------------------------------------
// Loans
// ------------------------------------------------------------------
export function calcMonthlyPayment(amount: number, apr: number, termMonths: number): number {
  const r = apr / 100 / 12;
  if (r === 0) return round2(amount / termMonths);
  return round2((amount * r) / (1 - Math.pow(1 + r, -termMonths)));
}

export async function applyForLoan(
  user: Actor,
  input: { loanType: string; amount: number; term: number; interestRate?: number; purpose?: string; employer?: string; annualIncome?: number; accountId?: string }
) {
  const amount = round2(input.amount);
  const rate = input.interestRate ?? defaultRate(input.loanType);
  const monthly = calcMonthlyPayment(amount, rate, input.term);
  const loan = await db.loan.create({
    data: {
      userId: user.id,
      accountId: input.accountId,
      loanType: input.loanType,
      amount,
      term: input.term,
      interestRate: rate,
      monthlyPayment: monthly,
      remainingBalance: amount,
      status: 'PENDING',
      purpose: input.purpose,
      employer: input.employer,
      annualIncome: input.annualIncome,
    },
  });
  const apr = await db.approval.create({
    data: {
      type: 'LOAN',
      reference: genReference('APR'),
      userId: user.id,
      amount,
      requestedBy: user.loginId ?? user.email,
      payload: JSON.stringify({
        loanId: loan.id,
        loanType: input.loanType,
        term: input.term,
        interestRate: rate,
        monthlyPayment: monthly,
        purpose: input.purpose,
        annualIncome: input.annualIncome,
        kind: 'LOAN',
      }),
    },
  });
  await db.loan.update({ where: { id: loan.id }, data: { approvalId: apr.id } });
  await notifyAdmins('APPROVAL', 'Loan application received', `${user.name} applied for a ${formatLoanType(input.loanType)} loan of $${amount.toFixed(2)} (${input.term} mo).`, user.id);
  return { loan, approvalId: apr.id };
}

/** Decide a loan approval (called from the central dispatcher). */
async function decideLoan(tx: Tx, payload: Record<string, unknown>, decision: 'APPROVED' | 'REJECTED', admin: Actor, note?: string) {
  const loanId = String(payload.loanId ?? '');
  const loan = await tx.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw new HttpError(404, 'Loan not found');
  if (loan.status !== 'PENDING') throw new HttpError(409, `Loan already decided (${loan.status})`);

  if (decision === 'REJECTED') {
    await tx.loan.update({ where: { id: loan.id }, data: { status: 'REJECTED', decisionNote: note, approvedBy: admin.email, approvedAt: new Date() } });
    return { message: 'Loan application rejected' };
  }

  const account = loan.accountId
    ? await tx.account.findUnique({ where: { id: loan.accountId } })
    : await tx.account.findFirst({ where: { userId: loan.userId, status: 'ACTIVE', type: 'CHECKING' } })
      ?? await tx.account.findFirst({ where: { userId: loan.userId, status: 'ACTIVE' } });
  if (!account) throw new HttpError(422, 'No active account available for disbursement');

  const reference = genReference('LND');
  const ledger = await postLedgerInTx(tx, {
    type: 'LOAN_DISBURSEMENT',
    category: 'LOAN',
    userId: loan.userId,
    reference,
    description: `Loan disbursement — ${formatLoanType(loan.loanType)}`,
    counterparty: `Loan ${loan.id.slice(-6).toUpperCase()}`,
    lines: [{ accountId: account.id, amount: loan.amount, from: 'external', to: 'available' }],
    meta: { loanId: loan.id, loanType: loan.loanType, term: loan.term, apr: loan.interestRate, monthlyPayment: loan.monthlyPayment, approvedBy: admin.email },
  });
  await tx.loan.update({
    where: { id: loan.id },
    data: { status: 'ACTIVE', accountId: account.id, ledgerTxId: ledger.ledgerTxId, approvedBy: admin.email, approvedAt: new Date(), decisionNote: note },
  });
  return { message: `Loan disbursed to ${account.nickname}`, ledgerRef: reference, accountId: account.id };
}

export async function makeLoanPayment(user: Actor, loanId: string, accountId: string, amount: number) {
  const loan = await db.loan.findFirst({ where: { id: loanId, userId: user.id } });
  if (!loan) throw new HttpError(404, 'Loan not found');
  if (loan.status !== 'ACTIVE') throw new HttpError(422, `Loan is ${loan.status.toLowerCase()} — payments unavailable`);
  const account = await getOwnedAccount(accountId, user.id);
  assertAccountActive(account);
  const payment = round2(amount);
  const remaining = round2(loan.remainingBalance);
  if (payment > remaining + 0.005) throw new HttpError(422, `Payment exceeds outstanding balance of $${remaining.toFixed(2)}`);

  const interest = round2(Math.min(payment * (loan.interestRate / 100 / 12), payment));
  const principal = round2(payment - interest);

  const reference = genReference('LNP');
  const result = await db.$transaction(async (tx) => {
    const ledger = await postLedgerInTx(tx, {
      type: 'LOAN_PAYMENT',
      category: 'LOAN',
      userId: user.id,
      reference,
      description: `Loan payment — ${formatLoanType(loan.loanType)}`,
      counterparty: `Loan ${loan.id.slice(-6).toUpperCase()}`,
      lines: [{ accountId: account.id, amount: payment, from: 'available', to: 'external' }],
      meta: { loanId: loan.id, principal, interest },
    });
    const newRemaining = round2(Math.max(0, remaining - principal));
    const paidOff = newRemaining <= 0.005;
    await tx.loan.update({
      where: { id: loan.id },
      data: { remainingBalance: newRemaining, status: paidOff ? 'PAID_OFF' : 'ACTIVE' },
    });
    await tx.loanPayment.create({
      data: { loanId: loan.id, accountId: account.id, amount: payment, principal, interest, ledgerTxId: ledger.ledgerTxId },
    });
    return { ledgerTxId: ledger.ledgerTxId, reference, remaining: newRemaining, paidOff };
  });
  await evaluateAlertsForLedgerTx(result.ledgerTxId, { userId: user.id });
  if (result.paidOff) {
    await notifyCustomer(user.id, 'LOAN', 'Loan paid off', `Congratulations — your ${formatLoanType(loan.loanType)} loan is paid in full.`, user.id);
  }
  return result;
}

// ------------------------------------------------------------------
// Wallet (SANDBOX — clearly labeled; no blockchain, no real keys)
// ------------------------------------------------------------------
export async function walletFundSandbox(user: Actor, walletId: string, amount: number) {
  const wallet = await db.wallet.findFirst({ where: { id: walletId, userId: user.id } });
  if (!wallet) throw new HttpError(404, 'Wallet not found');
  if (wallet.status !== 'ACTIVE') throw new HttpError(423, 'Wallet is not active');
  const amt = round2(amount);
  const max = await getNumber('wallet.faucet.maxUsd');
  if (amt > max) throw new HttpError(422, `Sandbox funding limit is $${max.toFixed(2)} per request`);
  const sandboxRef = `SBX-FUND-${genReference('W').split('-')[2]}`;
  const txr = await db.$transaction(async (tx) => {
    const updated = await tx.wallet.updateMany({ where: { id: wallet.id, status: 'ACTIVE' }, data: { balance: { increment: amt } } });
    if (updated.count === 0) throw new HttpError(423, 'Wallet is not active');
    return tx.walletTransaction.create({
      data: { walletId: wallet.id, type: 'FUND', amount: amt, currency: wallet.walletType, counterparty: 'Sandbox faucet', sandboxRef, status: 'COMPLETED', memo: 'Sandbox demo funding' },
    });
  });
  return { tx: txr };
}

export async function walletSend(user: Actor, input: { walletId: string; amount: number; counterparty: string; memo?: string }) {
  const wallet = await db.wallet.findFirst({ where: { id: input.walletId, userId: user.id } });
  if (!wallet) throw new HttpError(404, 'Wallet not found');
  if (wallet.status !== 'ACTIVE') throw new HttpError(423, 'Wallet is not active');
  const amt = round2(input.amount);
  const counterparty = input.counterparty.trim();
  if (counterparty.length < 4) throw new HttpError(422, 'Destination address is required');
  const threshold = await getNumber('wallet.send.autoApproveUsd');

  if (amt <= threshold) {
    const sandboxRef = `SBX-SEND-${genReference('W').split('-')[2]}`;
    const txr = await db.$transaction(async (tx) => {
      const updated = await tx.wallet.updateMany({ where: { id: wallet.id, status: 'ACTIVE', balance: { gte: amt } }, data: { balance: { decrement: amt } } });
      if (updated.count === 0) throw new HttpError(422, 'Insufficient sandbox wallet balance');
      return tx.walletTransaction.create({
        data: { walletId: wallet.id, type: 'SEND', amount: amt, currency: wallet.walletType, counterparty, sandboxRef, status: 'COMPLETED', memo: input.memo },
      });
    });
    return { status: 'COMPLETED' as const, sandboxRef, pending: false };
  }

  // Above threshold — needs manager approval
  const txr = await db.walletTransaction.create({
    data: { walletId: wallet.id, type: 'SEND', amount: amt, currency: wallet.walletType, counterparty, status: 'PENDING', memo: input.memo },
  });
  const apr = await db.approval.create({
    data: {
      type: 'WALLET_SEND',
      reference: genReference('APR'),
      userId: user.id,
      amount: amt,
      requestedBy: user.loginId ?? user.email,
      payload: JSON.stringify({ walletTxId: txr.id, walletId: wallet.id, walletType: wallet.walletType, counterparty, memo: input.memo, kind: 'WALLET_SEND' }),
    },
  });
  await notifyAdmins('APPROVAL', 'Wallet send needs review', `${user.name} — sandbox wallet send of ${amt} ${wallet.walletType} to ${counterparty}.`, user.id);
  return { status: 'PENDING' as const, approvalId: apr.id, pending: true };
}

// ------------------------------------------------------------------
// Central approval dispatcher (Operations Queue)
// ------------------------------------------------------------------
export async function decideApproval(admin: Actor, approvalId: string, decision: 'APPROVED' | 'REJECTED', note?: string, ctx?: { ip?: string }) {
  return db.$transaction(
    async (tx) => {
      // Serialize concurrent decisions on the same approval.
      await tx.$queryRaw`SELECT id FROM "Approval" WHERE id = ${approvalId} FOR UPDATE`;
      const approval = await tx.approval.findUnique({ where: { id: approvalId } });
      if (!approval) throw new HttpError(404, 'Approval not found');
      if (approval.status !== 'PENDING') throw new HttpError(409, `Already decided (${approval.status})`, 'ALREADY_DECIDED');

      const payload = safeParse(approval.payload);
      let outcomeMessage = '';
      let customerUserId = approval.userId;

      switch (approval.type) {
        case 'CHECK_DEPOSIT': {
          const depositId = String(payload.depositId ?? '');
          if (decision === 'APPROVED') {
            const dep = await tx.checkDeposit.findUnique({ where: { id: depositId }, include: { account: true } });
            if (!dep) throw new HttpError(404, 'Deposit not found');
            if (dep.status !== 'PENDING') throw new HttpError(409, 'Deposit already reviewed');
            const ledger = await postLedgerInTx(tx, {
              type: 'DEPOSIT',
              category: 'DEPOSIT',
              userId: dep.userId,
              reference: genReference('CR'),
              description: `Mobile deposit${dep.checkNumber ? ` · check #${dep.checkNumber}` : ''}`,
              counterparty: 'Mobile check deposit',
              memo: dep.memo,
              lines: [{ accountId: dep.accountId, amount: dep.amount, from: 'external', to: 'available' }],
              meta: { depositId: dep.id, depositRef: dep.reference, approvedBy: admin.email },
            });
            await tx.checkDeposit.update({
              where: { id: dep.id },
              data: { status: 'APPROVED', ledgerTxId: ledger.ledgerTxId, reviewedBy: admin.email, reviewedAt: new Date(), reviewNote: note },
            });
            outcomeMessage = `Deposit of $${dep.amount.toFixed(2)} credited to ${dep.account.nickname}`;
          } else {
            const dep = await tx.checkDeposit.updateMany({
              where: { id: depositId, status: 'PENDING' },
              data: { status: 'REJECTED', reviewedBy: admin.email, reviewedAt: new Date(), reviewNote: note },
            });
            if (dep.count === 0) throw new HttpError(409, 'Deposit already reviewed');
            outcomeMessage = 'Deposit rejected — customer notified';
          }
          break;
        }

        case 'EXTERNAL_TRANSFER':
        case 'ZELLE':
        case 'BILLPAY': {
          const ledgerTxId = String(payload.ledgerTxId ?? '');
          const settle = await settleHoldInTx(tx, ledgerTxId, decision, { actor: admin.email, reason: note });
          outcomeMessage = settle.message;
          if (approval.type === 'ZELLE') {
            const zelleId = String(payload.zelleId ?? '');
            await tx.zelleTransfer.update({
              where: { id: zelleId },
              data: {
                status: decision === 'APPROVED' ? 'COMPLETED' : 'DECLINED',
                completedAt: decision === 'APPROVED' ? new Date() : null,
              },
            });
          }
          if (approval.type === 'BILLPAY') {
            const billId = String(payload.billId ?? '');
            await tx.billPay.update({
              where: { id: billId },
              data: {
                status: decision === 'APPROVED' ? 'PAID' : 'CANCELLED',
                paidAt: decision === 'APPROVED' ? new Date() : null,
              },
            });
          }
          break;
        }

        case 'WALLET_SEND': {
          const walletTxId = String(payload.walletTxId ?? '');
          const walletId = String(payload.walletId ?? '');
          const amt = round2(approval.amount);
          if (decision === 'APPROVED') {
            const updated = await tx.wallet.updateMany({ where: { id: walletId, balance: { gte: amt } }, data: { balance: { decrement: amt } } });
            if (updated.count === 0) throw new HttpError(422, 'Sandbox wallet has insufficient balance — reject this request or fund the wallet');
            await tx.walletTransaction.update({ where: { id: walletTxId }, data: { status: 'COMPLETED', sandboxRef: `SBX-SEND-${genReference('W').split('-')[2]}` } });
            outcomeMessage = 'Sandbox wallet send completed';
          } else {
            await tx.walletTransaction.update({ where: { id: walletTxId }, data: { status: 'DECLINED' } });
            outcomeMessage = 'Sandbox wallet send declined';
          }
          break;
        }

        case 'LOAN': {
          const res = await decideLoan(tx, payload, decision, admin, note);
          outcomeMessage = res.message;
          break;
        }

        case 'ACCOUNT_OPENING': {
          const accountId = String(payload.accountId ?? '');
          const amount = round2(approval.amount);
          if (decision === 'APPROVED' && amount > 0) {
            const ledger = await postLedgerInTx(tx, {
              type: 'DEPOSIT',
              category: 'DEPOSIT',
              userId: approval.userId,
              reference: genReference('OPN'),
              description: 'Opening deposit',
              lines: [{ accountId, amount, from: 'external', to: 'available' }],
              meta: { approvedBy: admin.email, opening: true },
            });
            await tx.approval.update({ where: { id: approval.id }, data: { payload: JSON.stringify({ ...payload, ledgerTxId: ledger.ledgerTxId }) } });
            outcomeMessage = `Opening deposit of $${amount.toFixed(2)} credited`;
          } else if (decision === 'REJECTED') {
            await tx.account.updateMany({ where: { id: accountId, status: 'ACTIVE', balance: 0, held: 0 }, data: { status: 'CLOSED' } });
            outcomeMessage = 'Account opening rejected';
          } else {
            outcomeMessage = 'Account activated without deposit';
          }
          break;
        }

        default:
          throw new HttpError(422, `Unsupported approval type: ${approval.type}`);
      }

      await tx.approval.update({
        where: { id: approval.id },
        data: { status: decision, decidedBy: admin.email, decisionNote: note, decidedAt: new Date() },
      });

      if (customerUserId) {
        await tx.notification.create({
          data: {
            recipientId: customerUserId,
            userId: customerUserId,
            type: 'APPROVAL_DECISION',
            title: decision === 'APPROVED' ? 'Request approved' : 'Request declined',
            body: `${labelApprovalType(approval.type)}: ${outcomeMessage}${note ? ` — Note: ${note}` : ''}`,
          },
        });
      }
      return { approvalId: approval.id, decision, message: outcomeMessage };
    },
    { timeout: 20_000 }
  ).then(async (res) => {
    await audit(admin.id, admin.email, `ADMIN_APPROVAL_${decision}`, `${approvalId} (${res.message})`, { ip: ctx?.ip });
    await notifyAdmins('QUEUE', `Queue item ${decision.toLowerCase()}`, `${admin.name}: ${res.message}`);
    return res;
  });
}

/** settleHold variant that runs inside an existing transaction. */
async function settleHoldInTx(tx: Tx, ledgerTxId: string, decision: 'APPROVED' | 'REJECTED', opts: { actor: string; reason?: string }) {
  // Inline copy of ledger.settleHold using the provided tx.
  const hold = await tx.ledgerTransaction.findUnique({ where: { id: ledgerTxId }, include: { entries: true } });
  if (!hold) throw new HttpError(404, 'Pending transaction not found');
  if (hold.status !== 'PENDING') throw new HttpError(409, `Transaction already decided (${hold.status})`, 'ALREADY_DECIDED');
  const holdEntry = hold.entries.find((e) => e.bucketFrom === 'available' && e.bucketTo === 'held');
  if (!holdEntry) throw new HttpError(422, 'Transaction does not hold funds');

  if (decision === 'APPROVED') {
    const settle = await postLedgerInTx(tx, {
      type: (hold.type as never) ?? 'TRANSFER',
      category: hold.category,
      userId: hold.userId,
      reference: `ARP-STL-${hold.reference.replace(/^ARP-[A-Z]+-/, '')}`,
      description: hold.description,
      counterparty: hold.counterparty,
      memo: hold.memo,
      meta: { ...safeParse(hold.meta), settledHoldOf: hold.reference, approvedBy: opts.actor },
      lines: hold.entries.map((e) => ({
        accountId: e.accountId,
        amount: e.amount,
        from: (e.bucketTo as 'available' | 'held' | 'external') ?? 'external',
        to: 'external' as const,
        memo: e.memo ?? undefined,
      })),
    });
    await tx.ledgerTransaction.update({
      where: { id: hold.id },
      data: { status: 'POSTED', postedAt: new Date(), meta: JSON.stringify({ ...safeParse(hold.meta), settledBy: settle.reference }) },
    });
    return { message: `${hold.description} — posted`, reference: settle.reference };
  }

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
      from: 'held' as const,
      to: 'available' as const,
      memo: `Release: ${e.memo ?? hold.description}`,
    })),
  });
  await tx.ledgerTransaction.update({
    where: { id: hold.id },
    data: { status: 'DECLINED', meta: JSON.stringify({ ...safeParse(hold.meta), releasedBy: release.reference }) },
  });
  return { message: `${hold.description} — hold released`, reference: release.reference };
}

// ------------------------------------------------------------------
// Admin fund operations (ledger-based — no "set balance")
// ------------------------------------------------------------------
export async function adminAdjustFunds(
  admin: Actor,
  input: { accountId: string; direction: 'CREDIT' | 'DEBIT'; amount: number; reason: string },
  ctx?: { ip?: string }
) {
  const amount = round2(input.amount);
  if (input.reason.trim().length < 3) throw new HttpError(422, 'Reason is required (min 3 characters)');
  const account = await getAnyAccount(input.accountId);
  if (account.status === 'CLOSED') throw new HttpError(423, 'Account is closed');

  const reference = genReference('ADJ');
  const res = await postAndAlert({
    type: 'ADJUSTMENT',
    category: 'ADJUSTMENT',
    userId: account.userId,
    reference,
    description: `Administrative ${input.direction === 'CREDIT' ? 'credit' : 'debit'} — ${input.reason.trim()}`,
    counterparty: 'Arvest Operations',
    meta: { by: admin.email, reason: input.reason.trim(), direction: input.direction },
    lines: [
      input.direction === 'CREDIT'
        ? { accountId: account.id, amount, from: 'external' as const, to: 'available' as const }
        : { accountId: account.id, amount, from: 'available' as const, to: 'external' as const },
    ],
  });
  await audit(admin.id, admin.email, 'ADMIN_ADJUSTMENT', `${input.direction} $${amount.toFixed(2)} on ${account.accountNumber} — ${input.reason}`, ctx);
  await notifyCustomer(account.userId, 'BALANCE_CHANGE', input.direction === 'CREDIT' ? 'Account credited' : 'Account debited', `${account.nickname}: ${input.direction === 'CREDIT' ? '+' : '-'}$${amount.toFixed(2)} — ${input.reason.trim()} (ref ${res.reference})`, account.userId);
  return res;
}

export async function adminPlaceHold(
  admin: Actor,
  input: { accountId: string; amount: number; reason: string },
  ctx?: { ip?: string }
) {
  const amount = round2(input.amount);
  if (input.reason.trim().length < 3) throw new HttpError(422, 'Reason is required');
  const account = await getAnyAccount(input.accountId);
  if (account.status !== 'ACTIVE') throw new HttpError(423, 'Account must be ACTIVE to place holds');
  const reference = genReference('HLD');
  const res = await postAndAlert({
    type: 'HOLD',
    category: 'ADJUSTMENT',
    userId: account.userId,
    reference,
    description: `Administrative hold — ${input.reason.trim()}`,
    counterparty: 'Arvest Operations',
    meta: { by: admin.email, reason: input.reason.trim(), hold: true },
    lines: [{ accountId: account.id, amount, from: 'available', to: 'held' }],
  });
  await audit(admin.id, admin.email, 'ADMIN_HOLD', `Hold $${amount.toFixed(2)} on ${account.accountNumber} — ${input.reason}`, ctx);
  await notifyCustomer(account.userId, 'BALANCE_CHANGE', 'Funds placed on hold', `${account.nickname}: $${amount.toFixed(2)} placed on administrative hold — ${input.reason.trim()}.`, account.userId);
  return res;
}

export async function adminReleaseHold(
  admin: Actor,
  input: { accountId: string; amount: number; reason: string },
  ctx?: { ip?: string }
) {
  const amount = round2(input.amount);
  if (input.reason.trim().length < 3) throw new HttpError(422, 'Reason is required');
  const account = await getAnyAccount(input.accountId);
  const reference = genReference('RLS');
  const res = await postAndAlert({
    type: 'RELEASE',
    category: 'ADJUSTMENT',
    userId: account.userId,
    reference,
    description: `Hold released — ${input.reason.trim()}`,
    counterparty: 'Arvest Operations',
    meta: { by: admin.email, reason: input.reason.trim(), release: true },
    lines: [{ accountId: account.id, amount, from: 'held', to: 'available' }],
  });
  await audit(admin.id, admin.email, 'ADMIN_HOLD_RELEASE', `Released $${amount.toFixed(2)} on ${account.accountNumber} — ${input.reason}`, ctx);
  await notifyCustomer(account.userId, 'BALANCE_CHANGE', 'Hold released', `${account.nickname}: $${amount.toFixed(2)} released and available — ${input.reason.trim()}.`, account.userId);
  return res;
}

// ------------------------------------------------------------------
// Risk
// ------------------------------------------------------------------
export async function setLedgerFlag(admin: Actor, ledgerTxId: string, flagged: boolean, reason?: string, ctx?: { ip?: string }) {
  const guard = flagged ? ['POSTED'] : ['FLAGGED'];
  const res = await db.ledgerTransaction.updateMany({
    where: { id: ledgerTxId, status: { in: guard }, type: { not: 'REVERSAL' } },
    data: { status: flagged ? 'FLAGGED' : 'POSTED' },
  });
  if (res.count === 0) throw new HttpError(409, 'Only posted transactions can be flagged (and reversals cannot)');
  await audit(admin.id, admin.email, flagged ? 'ADMIN_FLAG_TX' : 'ADMIN_UNFLAG_TX', `${ledgerTxId}${reason ? ` — ${reason}` : ''}`, ctx);
  return { ok: true };
}

export async function reverseLedgerTx(admin: Actor, ledgerTxId: string, reason: string, ctx?: { ip?: string }) {
  if (reason.trim().length < 3) throw new HttpError(422, 'Reversal reason is required (min 3 characters)');
  try {
    const res = await reverseLedger(ledgerTxId, admin.email, reason.trim());
    await audit(admin.id, admin.email, 'ADMIN_REVERSE', `${ledgerTxId} → ${res.reference}: ${reason.trim()}`, ctx);
    return res;
  } catch (e) {
    if (e instanceof LedgerError) {
      if (e.code === 'ALREADY_REVERSED') throw new HttpError(409, 'Transaction already reversed', e.code);
      if (e.code === 'NOT_POSTED') throw new HttpError(422, 'Only posted transactions can be reversed', e.code);
      if (e.code === 'NOT_FOUND') throw new HttpError(404, 'Transaction not found', e.code);
    }
    throw e;
  }
}

// ------------------------------------------------------------------
// Account opening
// ------------------------------------------------------------------
export async function openCustomerAccount(
  user: Actor,
  input: { type: string; nickname?: string; initialDeposit: number },
  opts?: { byAdmin?: boolean; admin?: Actor }
) {
  const type = input.type;
  const deposit = round2(input.initialDeposit);
  const nickname = input.nickname?.trim() || defaultNickname(type);
  const threshold = await getNumber('account.open.autoApproveUsd');
  const accountNumber = genAccountNumber();
  const needsApproval = deposit > threshold;

  const account = await db.account.create({
    data: {
      userId: user.id,
      type,
      nickname,
      accountNumber,
      routingNumber: process.env.ARVEST_ROUTING || '082900883',
      status: 'ACTIVE',
    },
  });

  if (deposit <= 0) {
    return { account, pending: false };
  }

  if (!needsApproval) {
    const res = await postAndAlert({
      type: 'DEPOSIT',
      category: 'DEPOSIT',
      userId: user.id,
      reference: genReference('OPN'),
      description: 'Opening deposit',
      lines: [{ accountId: account.id, amount: deposit, from: 'external', to: 'available' }],
      meta: { opening: true, accountType: type },
    });
    await notifyAdmins('ACCOUNT', 'New account opened', `${user.name} opened ${nickname} ending ${accountNumber.slice(-4)} with $${deposit.toFixed(2)}.`, user.id);
    return { account, pending: false, reference: res.reference };
  }

  const apr = await db.approval.create({
    data: {
      type: 'ACCOUNT_OPENING',
      reference: genReference('APR'),
      userId: user.id,
      amount: deposit,
      requestedBy: opts?.byAdmin && opts.admin ? opts.admin.email : (user.loginId ?? user.email),
      payload: JSON.stringify({ accountId: account.id, accountMask: maskAccount(accountNumber), nickname, accountType: type, kind: 'ACCOUNT_OPENING' }),
    },
  });
  await notifyAdmins('APPROVAL', 'Opening deposit needs review', `${user.name} — $${deposit.toFixed(2)} opening deposit for ${nickname} exceeds the auto-approval limit.`, user.id);
  return { account, pending: true, approvalId: apr.id };
}

// ------------------------------------------------------------------
// misc
// ------------------------------------------------------------------
export function labelApprovalType(type: string): string {
  const map: Record<string, string> = {
    CHECK_DEPOSIT: 'Mobile deposit',
    EXTERNAL_TRANSFER: 'External transfer',
    ZELLE: 'Zelle transfer',
    BILLPAY: 'Bill payment',
    LOAN: 'Loan application',
    WALLET_SEND: 'Sandbox wallet send',
    ACCOUNT_OPENING: 'Account opening',
  };
  return map[type] ?? type;
}

export function translateLedgerError(e: unknown): Error {
  if (e instanceof LedgerError) {
    if (e.code === 'INSUFFICIENT_FUNDS') return new HttpError(422, e.message, e.code);
    if (e.code === 'ACCOUNT_NOT_FOUND') return new HttpError(404, e.message, e.code);
    if (e.code === 'NEGATIVE_BALANCE') return new HttpError(422, e.message, e.code);
  }
  return e as Error;
}

export function maskAccount(num: string): string {
  return `••••${num.slice(-4)}`;
}

export function formatLoanType(t: string): string {
  const map: Record<string, string> = { PERSONAL: 'Personal', AUTO: 'Auto', HOME: 'Home', STUDENT: 'Student' };
  return map[t] ?? t;
}

export function defaultRate(loanType: string): number {
  const map: Record<string, number> = { PERSONAL: 8.9, AUTO: 6.4, HOME: 5.9, STUDENT: 4.5 };
  return map[loanType] ?? 8.9;
}

export function defaultNickname(type: string): string {
  const map: Record<string, string> = { CHECKING: 'Premier Checking', SAVINGS: 'Reserve Savings', PRIVATE_CLIENT: 'Private Client Reserve' };
  return map[type] ?? `${type} Account`;
}
