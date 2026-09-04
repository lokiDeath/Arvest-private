// ============================================================
// Arvest Private Banking — Database seed (v6)
// ============================================================
// Generates a consistent demo bank: two years of double-entry
// history where every account balance reconciles exactly with its
// ledger entries, plus a pre-loaded Operations Queue (pending
// transfer, Zelle, check deposit, loan) so the manager console has
// real work waiting.
//
// Run:  npm run db:seed      (or npx tsx scripts/seed.ts)
// ============================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const db = new PrismaClient();
let seedCounter = 0;
// Strictly increasing millisecond offset so seeded ledger entries have a
// deterministic, gapless chain (ties would make ordering ambiguous).
let timeTick = 0;
let lastStamp = 0;

function genRef(prefix: string): string {
  const seq = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ARP-${prefix}-${seq}${rand}${seedCounter++}`;
}

interface AcctState { id: string; balance: number; available: number; held: number }

/** Seed-side mirror of the ledger engine: exact same math & entry rows. */
async function post(opts: {
  type: string; category: string; description: string; userId?: string | null;
  counterparty?: string | null; memo?: string | null; status?: 'POSTED' | 'PENDING';
  date?: Date; meta?: Record<string, unknown>;
  lines: { account: AcctState; amount: number; from?: 'available' | 'held' | 'external'; to?: 'available' | 'held' | 'external'; memo?: string }[];
}): Promise<string> {
  const reference = genRef(opts.type.slice(0, 4));
  const status = opts.status ?? 'POSTED';
  // Monotonic stamp: intended date + tick, but never behind the previous post.
  let stampMs = (opts.date ?? new Date()).getTime() + timeTick++;
  if (stampMs <= lastStamp) stampMs = lastStamp + 1;
  lastStamp = stampMs;
  const stamp = new Date(stampMs);

  const ledgerTx = await db.ledgerTransaction.create({
    data: {
      reference,
      type: opts.type,
      category: opts.category,
      userId: opts.userId ?? null,
      description: opts.description,
      counterparty: opts.counterparty ?? null,
      memo: opts.memo ?? null,
      status,
      meta: JSON.stringify(opts.meta ?? {}),
      postedAt: status === 'POSTED' ? stamp : null,
      createdAt: stamp,
    },
  });

  for (const line of opts.lines) {
    const amount = Math.round(line.amount * 100) / 100;
    const f = line.from ?? 'external';
    const t = line.to ?? 'external';
    const availDelta = (t === 'available' ? amount : 0) - (f === 'available' ? amount : 0);
    const heldDelta = (t === 'held' ? amount : 0) - (f === 'held' ? amount : 0);
    const balDelta = availDelta + heldDelta;

    const availableBefore = Math.round(line.account.available * 100) / 100;
    const balanceBefore = Math.round(line.account.balance * 100) / 100;
    line.account.available = Math.round((line.account.available + availDelta) * 100) / 100;
    line.account.held = Math.round((line.account.held + heldDelta) * 100) / 100;
    line.account.balance = Math.round((line.account.balance + balDelta) * 100) / 100;
    if (line.account.available < -0.005 || line.account.held < -0.005) {
      throw new Error(`Seed overdraft on account ${line.account.id} — adjust the plan`);
    }

    await db.ledgerEntry.create({
      data: {
        ledgerTxId: ledgerTx.id,
        accountId: line.account.id,
        direction: balDelta < 0 ? 'DEBIT' : 'CREDIT',
        amount,
        bucketFrom: f,
        bucketTo: t,
        balanceBefore,
        balanceAfter: line.account.balance,
        availableBefore,
        availableAfter: line.account.available,
        memo: line.memo ?? null,
        createdAt: new Date(stamp.getTime() + 1),
      },
    });
  }
  return ledgerTx.id;
}

async function wipe() {
  const tables = [
    'ledgerEntry', 'ledgerTransaction', 'approval', 'idempotencyKey',
    'loanPayment', 'loan', 'billPay', 'zelleTransfer', 'checkDeposit',
    'walletTransaction', 'wallet', 'card', 'alert', 'notification',
    'securityEvent', 'auditLog', 'resetCode', 'message', 'appointment',
    'account', 'setting', 'user',
  ] as const;
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[t].deleteMany();
  }
}

async function main() {
  console.log(' seeding arvest private banking …');
  await wipe();

  // ---- settings defaults ----
  const defaults: Record<string, string> = {
    'transfer.external.autoApproveUsd': '2500',
    'zelle.autoApproveUsd': '1000',
    'billpay.autoApproveUsd': '2000',
    'deposit.check.autoApproveUsd': '0',
    'account.open.autoApproveUsd': '25000',
    'wallet.send.autoApproveUsd': '500',
    'loan.autoApproveUsd': '0',
    'zelle.dailyLimitUsd': '5000',
    'deposit.check.maxUsd': '50000',
    'wallet.faucet.maxUsd': '10000',
    'risk.largeTxFlagUsd': '25000',
    'platform.name': 'Arvest Private Banking',
    'platform.maintenance': 'false',
    'platform.statementFooter': 'Arvest Private Banking · Member FDIC · NMLS #445836',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.setting.create({ data: { key, value } });
  }

  // ---- users ----
  const adminEmail = process.env.ADMIN_EMAIL || 'manager@arvestprivate.bank';
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Arvest-Manager-2026!';

  const admin = await db.user.create({
    data: {
      email: adminEmail,
      name: 'Bank Administrator',
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: 'ADMIN',
      status: 'ACTIVE',
      phone: '+1 (479) 555-0100',
      createdAt: new Date('2024-01-02'),
    },
  });

  async function mkCustomer(name: string, email: string, loginId: string, password: string, phone: string, city: string, created: Date) {
    return db.user.create({
      data: {
        name, email, loginId,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'CUSTOMER', status: 'ACTIVE', phone,
        address: `${100 + Math.floor(Math.random() * 900)} ${['Magnolia', 'Walnut', 'Pinnacle', 'Rolling Hills'][Math.floor(Math.random() * 4)]} St`,
        city, state: 'AR', zip: `72${100 + Math.floor(Math.random() * 899)}`,
        createdAt: created,
      },
    });
  }

  const chris = await mkCustomer('Christopher Larosa', 'christopher.larosa@example.com', 'christopher111', '1975@1975', '+1 (479) 555-0171', 'Bentonville', new Date('2024-01-15'));
  const alex = await mkCustomer('Alexandra Sterling', 'alexandra.sterling@example.com', 'alexandra.s7281', 'Sterling@2026', '+1 (501) 555-0182', 'Little Rock', new Date('2024-03-02'));
  const james = await mkCustomer('James Whitfield', 'james.whitfield@example.com', 'james.w4920', 'Whitfield@2026', '+1 (479) 555-0193', 'Fayetteville', new Date('2024-06-11'));
  const maria = await mkCustomer('Maria Castillo', 'maria.castillo@example.com', 'maria.c8841', 'Castillo@2026', '+1 (479) 555-0164', 'Rogers', new Date('2025-01-20'));

  // ---- accounts ----
  let acctSeq = 1000000000;
  const routing = '082900883';
  const acctNum = () => String(++acctSeq);

  const mkAccount = (userId: string, type: string, nickname: string, created: Date) =>
    db.account.create({
      data: { userId, type, nickname, accountNumber: acctNum(), routingNumber: routing, status: 'ACTIVE', createdAt: created },
    });

  const cChecking = await mkAccount(chris.id, 'CHECKING', 'Premier Checking', new Date('2024-01-15'));
  const cSavings = await mkAccount(chris.id, 'SAVINGS', 'Reserve Savings', new Date('2024-01-15'));
  const cPrivate = await mkAccount(chris.id, 'PRIVATE_CLIENT', 'Private Client Reserve', new Date('2024-02-01'));

  const aChecking = await mkAccount(alex.id, 'CHECKING', 'Sterling Checking', new Date('2024-03-02'));
  const aSavings = await mkAccount(alex.id, 'SAVINGS', 'Sterling Reserve', new Date('2024-03-02'));

  const jChecking = await mkAccount(james.id, 'CHECKING', 'Whitfield Checking', new Date('2024-06-11'));
  const jSavings = await mkAccount(james.id, 'SAVINGS', 'Whitfield Savings', new Date('2024-06-11'));

  const mChecking = await mkAccount(maria.id, 'CHECKING', 'Castillo Checking', new Date('2025-01-20'));
  const mSavings = await mkAccount(maria.id, 'SAVINGS', 'Castillo Savings', new Date('2025-01-20'));

  const state = new Map<string, AcctState>();
  const track = (a: { id: string }): AcctState => {
    let s = state.get(a.id);
    if (!s) { s = { id: a.id, balance: 0, available: 0, held: 0 }; state.set(a.id, s); }
    return s;
  };

  // ---- two years of history ----
  const MERCHANTS: [string, string, number, number][] = [
    ['Whole Foods Market', 'OTHER', 45, 210],
    ['Samedi Fine Dining', 'OTHER', 60, 320],
    ['Midwest Energy & Power', 'OTHER', 90, 240],
    ['Aurora Wireless', 'OTHER', 70, 130],
    ['Pinnacle Air Lines', 'OTHER', 220, 900],
    ['The Weekend Estate', 'OTHER', 120, 480],
    ['Vanguard Advisors', 'OTHER', 150, 400],
    ['Hearth & Home Interiors', 'OTHER', 95, 700],
    ['Meridian Insurance', 'PAYMENT', 180, 420],
    ['Mortgage Payment', 'PAYMENT', 1850, 1850],
  ];

  const now = new Date();
  let week = 104;
  while (week >= 0) {
    const base = new Date(now.getTime() - week * 7 * 86400_000);
    if (week % 2 === 0) {
      const date = new Date(base.getTime() - 86400_000);
      await post({
        type: 'DEPOSIT', category: 'OTHER', userId: chris.id,
        description: 'TechCorp Inc — Payroll', counterparty: 'TechCorp Inc',
        date, meta: { seeded: true },
        lines: [{ account: track(cChecking), amount: 7200 + Math.random() * 1200, from: 'external', to: 'available' }],
      });
    }
    if (week % 4 === 1) {
      const date = new Date(base.getTime() - 2 * 86400_000);
      await post({
        type: 'INTEREST', category: 'INTEREST', userId: chris.id, description: 'Interest Payment',
        date, meta: { seeded: true },
        lines: [{ account: track(cSavings), amount: 15 + Math.random() * 80, from: 'external', to: 'available' }],
      });
    }
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const [desc, cat, min, max] = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
      const date = new Date(base.getTime() - Math.floor(Math.random() * 6) * 86400_000);
      await post({
        type: 'WITHDRAWAL', category: cat, userId: chris.id, description: desc, counterparty: desc,
        date, meta: { seeded: true },
        lines: [{ account: track(cChecking), amount: Math.round(min + Math.random() * (max - min)), from: 'available', to: 'external' }],
      });
    }
    if (week % 4 === 2) {
      const date = new Date(base.getTime() - 3 * 86400_000);
      await post({
        type: 'TRANSFER', category: 'TRANSFER', userId: chris.id, description: 'Transfer to Private Client Reserve',
        date, meta: { seeded: true, transferType: 'INTERNAL' },
        lines: [
          { account: track(cChecking), amount: 1500, from: 'available', to: 'external' },
          { account: track(cPrivate), amount: 1500, from: 'external', to: 'available' },
        ],
      });
    }
    week--;
  }

  // other customers: condensed history
  const others: [typeof alex, { id: string }[], number][] = [
    [alex, [aChecking, aSavings], 40],
    [james, [jChecking, jSavings], 34],
    [maria, [mChecking, mSavings], 26],
  ];
  for (const [user, accts, weeks] of others) {
    const [chk, sav] = accts;
    for (let w = weeks; w >= 0; w--) {
      const date = new Date(now.getTime() - w * 7 * 86400_000);
      if (w % 2 === 0) {
        await post({
          type: 'DEPOSIT', category: 'OTHER', userId: user.id, description: 'Payroll deposit', counterparty: 'Employer',
          date, meta: { seeded: true },
          lines: [{ account: track(chk), amount: 3200 + Math.random() * 5200, from: 'external', to: 'available' }],
        });
      }
      if (Math.random() < 0.8) {
        const [desc, , min, max] = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
        await post({
          type: 'WITHDRAWAL', category: 'OTHER', userId: user.id, description: desc, counterparty: desc,
          date, meta: { seeded: true },
          lines: [{ account: track(chk), amount: Math.round(min + Math.random() * (max - min)), from: 'available', to: 'external' }],
        });
      }
      if (w % 6 === 0) {
        await post({
          type: 'TRANSFER', category: 'TRANSFER', userId: user.id, description: 'Transfer to savings',
          date, meta: { seeded: true, transferType: 'INTERNAL' },
          lines: [
            { account: track(chk), amount: 600, from: 'available', to: 'external' },
            { account: track(sav), amount: 600, from: 'external', to: 'available' },
          ],
        });
      }
    }
  }

  // ---- pending queue items ----
  const extLedger = await post({
    type: 'TRANSFER', category: 'TRANSFER', userId: chris.id, status: 'PENDING',
    description: 'External transfer to Whitmore Construction LLC', counterparty: 'Whitmore Construction LLC',
    memo: 'Home renovation deposit', meta: { transferType: 'EXTERNAL', recipientName: 'Whitmore Construction LLC', decision: 'PENDING_APPROVAL' },
    lines: [{ account: track(cChecking), amount: 4000, from: 'available', to: 'held' }],
  });
  await db.approval.create({
    data: {
      type: 'EXTERNAL_TRANSFER', reference: genRef('APR'), userId: chris.id, amount: 4000,
      requestedBy: 'christopher111',
      payload: JSON.stringify({ ledgerTxId: extLedger, fromAccountId: cChecking.id, fromAccountMask: `••••${cChecking.accountNumber.slice(-4)}`, recipientName: 'Whitmore Construction LLC', memo: 'Home renovation deposit', kind: 'EXTERNAL_TRANSFER' }),
    },
  });

  const zelleRef = genRef('ZL');
  const zelleLedger = await post({
    type: 'ZELLE', category: 'ZELLE', userId: chris.id, status: 'PENDING',
    description: 'Zelle to Daniel Reeves', counterparty: 'daniel.reeves@example.com',
    meta: { kind: 'ZELLE', decision: 'PENDING_APPROVAL', zelleRef },
    lines: [{ account: track(cChecking), amount: 1550, from: 'available', to: 'held' }],
  });
  const zt = await db.zelleTransfer.create({
    data: {
      userId: chris.id, fromAccountId: cChecking.id, recipientName: 'Daniel Reeves',
      recipientEmail: 'daniel.reeves@example.com', amount: 1550, memo: 'Cabin split',
      status: 'ON_HOLD', reference: zelleRef, ledgerTxId: zelleLedger,
    },
  });
  await db.approval.create({
    data: {
      type: 'ZELLE', reference: genRef('APR'), userId: chris.id, amount: 1550, requestedBy: 'christopher111',
      payload: JSON.stringify({ ledgerTxId: zelleLedger, zelleId: zt.id, fromAccountId: cChecking.id, fromAccountMask: `••••${cChecking.accountNumber.slice(-4)}`, recipientName: 'Daniel Reeves', recipient: 'daniel.reeves@example.com', memo: 'Cabin split', kind: 'ZELLE' }),
    },
  });

  const zcRef = genRef('ZL');
  const zcLedger = await post({
    type: 'ZELLE', category: 'ZELLE', userId: chris.id,
    description: 'Zelle to Hannah Brooks', counterparty: 'hannah.brooks@example.com',
    meta: { kind: 'ZELLE', decision: 'AUTO_APPROVED', zelleRef: zcRef },
    lines: [{ account: track(cChecking), amount: 325, from: 'available', to: 'external' }],
  });
  await db.zelleTransfer.create({
    data: {
      userId: chris.id, fromAccountId: cChecking.id, recipientName: 'Hannah Brooks',
      recipientEmail: 'hannah.brooks@example.com', amount: 325, memo: 'Dinner party',
      status: 'COMPLETED', reference: zcRef, ledgerTxId: zcLedger, completedAt: new Date(now.getTime() - 6 * 86400_000),
      createdAt: new Date(now.getTime() - 6 * 86400_000),
    },
  });

  const dep = await db.checkDeposit.create({
    data: {
      userId: chris.id, accountId: cChecking.id, amount: 2850, checkNumber: '1042',
      memo: 'Quarterly contractor refund', reference: genRef('DEP'), status: 'PENDING',
    },
  });
  await db.approval.create({
    data: {
      type: 'CHECK_DEPOSIT', reference: genRef('APR'), userId: chris.id, amount: 2850, requestedBy: 'christopher111',
      payload: JSON.stringify({ depositId: dep.id, accountId: cChecking.id, accountMask: `••••${cChecking.accountNumber.slice(-4)}`, amount: 2850, checkNumber: '1042', hasFront: true, hasBack: true, kind: 'CHECK_DEPOSIT' }),
    },
  });

  const loan = await db.loan.create({
    data: {
      userId: chris.id, accountId: cChecking.id, loanType: 'AUTO', amount: 42000, term: 60,
      interestRate: 6.4, monthlyPayment: 820.36, remainingBalance: 42000, status: 'PENDING',
      purpose: 'Purchase of a 2026 SUV', employer: 'TechCorp Inc', annualIncome: 148000,
    },
  });
  await db.approval.create({
    data: {
      type: 'LOAN', reference: genRef('APR'), userId: chris.id, amount: 42000, requestedBy: 'christopher111',
      payload: JSON.stringify({ loanId: loan.id, loanType: 'AUTO', term: 60, interestRate: 6.4, monthlyPayment: 820.36, purpose: 'Purchase of a 2026 SUV', annualIncome: 148000, kind: 'LOAN' }),
    },
  });

  // ACTIVE loan for Maria with one payment
  const mLoan = await db.loan.create({
    data: {
      userId: maria.id, accountId: mChecking.id, loanType: 'PERSONAL', amount: 12000, term: 36,
      interestRate: 8.9, monthlyPayment: 382.62, remainingBalance: 11617.38, status: 'ACTIVE',
      approvedBy: adminEmail, approvedAt: new Date(now.getTime() - 30 * 86400_000),
      purpose: 'Debt consolidation',
    },
  });
  const mpayLedger = await post({
    type: 'LOAN_PAYMENT', category: 'LOAN', userId: maria.id,
    description: 'Loan payment — Personal', counterparty: `Loan ${mLoan.id.slice(-6).toUpperCase()}`,
    date: new Date(now.getTime() - 14 * 86400_000), meta: { loanId: mLoan.id, principal: 293.62, interest: 89.0 },
    lines: [{ account: track(mChecking), amount: 382.62, from: 'available', to: 'external' }],
  });
  await db.loanPayment.create({
    data: { loanId: mLoan.id, accountId: mChecking.id, amount: 382.62, principal: 293.62, interest: 89.0, ledgerTxId: mpayLedger, createdAt: new Date(now.getTime() - 14 * 86400_000) },
  });

  // ---- bills ----
  const b1Ref = genRef('BIL');
  const b1Ledger = await post({
    type: 'BILLPAY', category: 'PAYMENT', userId: chris.id,
    description: 'Bill payment — Meridian Insurance', counterparty: 'Meridian Insurance',
    date: new Date(now.getTime() - 9 * 86400_000), meta: { kind: 'BILLPAY', billRef: b1Ref, decision: 'AUTO_APPROVED' },
    lines: [{ account: track(cChecking), amount: 240, from: 'available', to: 'external' }],
  });
  await db.billPay.create({
    data: {
      userId: chris.id, accountId: cChecking.id, payee: 'Meridian Insurance', amount: 240,
      memo: 'Auto policy premium', payDate: new Date(now.getTime() - 9 * 86400_000),
      status: 'PAID', reference: b1Ref, ledgerTxId: b1Ledger, paidAt: new Date(now.getTime() - 9 * 86400_000),
    },
  });
  await db.billPay.create({
    data: {
      userId: chris.id, accountId: cChecking.id, payee: 'Beacon Property Tax', amount: 1450,
      memo: 'Semi-annual property tax', payDate: new Date(now.getTime() + 5 * 86400_000),
      status: 'SCHEDULED', reference: genRef('BIL'),
    },
  });
  const b3Ref = genRef('BIL');
  const b3Ledger = await post({
    type: 'BILLPAY', category: 'PAYMENT', userId: alex.id, status: 'PENDING',
    description: 'Bill payment — Crestview Tuition', counterparty: 'Crestview Academy',
    memo: 'Spring semester', meta: { kind: 'BILLPAY', billRef: b3Ref, decision: 'PENDING_APPROVAL' },
    lines: [{ account: track(aChecking), amount: 3600, from: 'available', to: 'held' }],
  });
  const b3 = await db.billPay.create({
    data: {
      userId: alex.id, accountId: aChecking.id, payee: 'Crestview Academy', amount: 3600,
      memo: 'Spring semester', payDate: new Date(now.getTime() - 86400_000),
      status: 'ON_HOLD', reference: b3Ref, ledgerTxId: b3Ledger,
    },
  });
  await db.approval.create({
    data: {
      type: 'BILLPAY', reference: genRef('APR'), userId: alex.id, amount: 3600, requestedBy: 'schedule',
      payload: JSON.stringify({ ledgerTxId: b3Ledger, billId: b3.id, billRef: b3Ref, payee: 'Crestview Academy', accountMask: `••••${aChecking.accountNumber.slice(-4)}`, memo: 'Spring semester', kind: 'BILLPAY' }),
    },
  });

  // ---- cards ----
  function loadKey(): Buffer {
    const raw = process.env.CARD_ENCRYPTION_KEY;
    if (!raw) return crypto.scryptSync('arvest-dev-only-card-key', 'arvest-card-salt', 32);
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 43 && raw.length % 4 === 0) {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    return crypto.scryptSync(raw, 'arvest-card-salt', 32);
  }
  function encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${iv.toString('base64')}.${enc.toString('base64')}.${c.getAuthTag().toString('base64')}`;
  }
  function luhn(prefix: string, len: number): string {
    let body = prefix;
    while (body.length < len - 1) body += crypto.randomInt(0, 10).toString();
    let sum = 0, dbl = true;
    for (let i = body.length - 1; i >= 0; i--) {
      let d = Number(body[i]);
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      dbl = !dbl; sum += d;
    }
    return body + ((10 - (sum % 10)) % 10).toString();
  }

  async function mkCard(userId: string, accountId: string | null, issuedBy: 'ARVEST' | 'EXTERNAL', cardType: 'DEBIT' | 'CREDIT', network: string, holder: string, color: string, created: Date, opts?: { creditLimit?: number; pin?: string }) {
    const number = luhn(network === 'AMEX' ? '37' : network === 'MASTERCARD' ? '53' : network === 'DISCOVER' ? '6011' : '4', network === 'AMEX' ? 15 : 16);
    const pin = opts?.pin ?? '1234';
    return db.card.create({
      data: {
        userId, accountId, issuedBy, cardType, network,
        cardholder: holder.toUpperCase(),
        cardNumberEnc: encrypt(number),
        cardLast4: number.slice(-4),
        expiryMonth: ((created.getMonth() + 4) % 12) + 1,
        expiryYear: created.getFullYear() + 4,
        pinHash: await bcrypt.hash(pin, 10),
        color, creditLimit: opts?.creditLimit ?? 0, dailyLimit: 5000,
        createdAt: created,
      },
    });
  }

  await mkCard(chris.id, cChecking.id, 'ARVEST', 'DEBIT', 'VISA', 'Christopher Larosa', 'CRIMSON', new Date('2024-02-10'), { pin: '1975' });
  await mkCard(chris.id, cPrivate.id, 'ARVEST', 'CREDIT', 'MASTERCARD', 'Christopher Larosa', 'OBSIDIAN', new Date('2024-03-05'), { creditLimit: 50000 });
  await mkCard(alex.id, aChecking.id, 'ARVEST', 'DEBIT', 'VISA', 'Alexandra Sterling', 'GOLD', new Date('2024-04-12'), { pin: '7281' });
  await mkCard(james.id, jChecking.id, 'ARVEST', 'DEBIT', 'MASTERCARD', 'James Whitfield', 'PLATINUM', new Date('2024-07-01'));
  await mkCard(maria.id, mChecking.id, 'ARVEST', 'DEBIT', 'VISA', 'Maria Castillo', 'SAPPHIRE', new Date('2025-02-15'));

  // ---- sandbox wallets ----
  const cWallet = await db.wallet.create({
    data: { userId: chris.id, walletType: 'USD', address: `SBX-USD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`, balance: 2500, label: 'USD Sandbox Reserve' },
  });
  await db.walletTransaction.create({
    data: { walletId: cWallet.id, type: 'FUND', amount: 2500, currency: 'USD', counterparty: 'Sandbox faucet', sandboxRef: `SBX-FUND-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, status: 'COMPLETED', memo: 'Sandbox demo funding', date: new Date(now.getTime() - 12 * 86400_000) },
  });
  const cBtc = await db.wallet.create({
    data: { userId: chris.id, walletType: 'BTC', address: `SBX-BTC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`, balance: 0, label: 'BTC Sandbox' },
  });
  const wTx = await db.walletTransaction.create({
    data: { walletId: cBtc.id, type: 'SEND', amount: 0.05, currency: 'BTC', counterparty: 'SBX-EXT-DEMO2', sandboxRef: `SBX-SEND-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, status: 'PENDING', memo: 'Above auto-approval limit', date: new Date(now.getTime() - 2 * 86400_000) },
  });
  await db.approval.create({
    data: {
      type: 'WALLET_SEND', reference: genRef('APR'), userId: chris.id, amount: 0.05, requestedBy: 'christopher111',
      payload: JSON.stringify({ walletTxId: wTx.id, walletId: cBtc.id, walletType: 'BTC', counterparty: 'SBX-EXT-DEMO2', memo: 'Above auto-approval limit', kind: 'WALLET_SEND' }),
    },
  });

  // ---- alerts ----
  await db.alert.create({ data: { userId: chris.id, type: 'BALANCE_BELOW', threshold: 500, accountId: cChecking.id } });
  await db.alert.create({ data: { userId: chris.id, type: 'LARGE_TRANSACTION', threshold: 2000 } });
  await db.alert.create({ data: { userId: alex.id, type: 'BALANCE_BELOW', threshold: 1000, accountId: aChecking.id } });

  // ---- appointments & messages ----
  await db.appointment.create({
    data: { userId: chris.id, type: 'BRANCH', topic: 'Wealth review', date: new Date(now.getTime() + 4 * 86400_000), status: 'SCHEDULED', branchId: 'bentonville', notes: 'Bring portfolio documents' },
  });
  await db.appointment.create({
    data: { userId: alex.id, type: 'PHONE', topic: 'Loan inquiry', date: new Date(now.getTime() + 2 * 86400_000), status: 'CONFIRMED' },
  });
  await db.message.create({
    data: { userId: chris.id, subject: 'Statements for Q3', body: 'Could you send the Q3 statement for my Private Client Reserve? Thank you!', fromBank: false, read: false, createdAt: new Date(now.getTime() - 3 * 86400_000) },
  });
  await db.message.create({
    data: { userId: chris.id, subject: 'Re: Statements for Q3', body: 'Certainly — the Q3 statement is available in your Statements tab. Let us know if you need anything else.', fromBank: true, read: true, createdAt: new Date(now.getTime() - 2 * 86400_000) },
  });

  // ---- notifications ----
  await db.notification.create({ data: { recipientRole: 'ADMIN', type: 'APPROVAL', title: 'External transfer needs review', body: 'Christopher Larosa — $4,000.00 to Whitmore Construction LLC exceeds the auto-approval limit.', userId: chris.id } });
  await db.notification.create({ data: { recipientRole: 'ADMIN', type: 'APPROVAL', title: 'Mobile deposit needs review', body: 'Christopher Larosa deposited a $2,850.00 check into Premier Checking.', userId: chris.id } });
  await db.notification.create({ data: { recipientRole: 'ADMIN', type: 'APPROVAL', title: 'Loan application received', body: 'Christopher Larosa applied for an Auto loan of $42,000.00 (60 mo).', userId: chris.id } });
  await db.notification.create({ data: { recipientRole: 'ADMIN', type: 'MESSAGE', title: 'New client message', body: 'Christopher Larosa: Statements for Q3', userId: chris.id } });
  await db.notification.create({ data: { recipientId: chris.id, userId: chris.id, type: 'TRANSFER', title: 'Transfer pending review', body: 'Your $4,000.00 external transfer to Whitmore Construction LLC is pending bank approval. Funds are on hold.' } });
  await db.notification.create({ data: { recipientId: chris.id, userId: chris.id, type: 'DEPOSIT', title: 'Deposit received', body: 'Your $2,850.00 mobile deposit is under review.' } });

  // ---- security events & audit ----
  await db.securityEvent.create({ data: { userId: chris.id, type: 'LOGIN', ip: '203.0.113.24', userAgent: 'Mozilla/5.0 (Macintosh)', detail: 'Seeded sign-in', createdAt: new Date(now.getTime() - 26 * 3600_000) } });
  await db.securityEvent.create({ data: { userId: alex.id, type: 'LOGIN', ip: '198.51.100.17', userAgent: 'Mozilla/5.0 (iPhone)', detail: 'Seeded sign-in', createdAt: new Date(now.getTime() - 50 * 3600_000) } });
  await db.securityEvent.create({ data: { userId: null, type: 'LOGIN_FAILED', ip: '203.0.113.99', userAgent: 'curl/8.0', detail: 'Unknown identifier: admin-test', createdAt: new Date(now.getTime() - 5 * 3600_000) } });
  await db.auditLog.create({ data: { userId: admin.id, actor: adminEmail, action: 'SYSTEM_SEED', detail: 'Database seeded (v6) — ledger-consistent demo data' } });

  // ---- persist balances & verify invariants ----
  for (const a of state.values()) {
    await db.account.update({
      where: { id: a.id },
      data: { balance: a.balance, available: a.available, held: a.held },
    });
    if (Math.abs(a.balance - (a.available + a.held)) > 0.005) {
      throw new Error(`Invariant broken for ${a.id}: ${a.balance} != ${a.available} + ${a.held}`);
    }
  }

  console.log(' seed complete.');
  console.log(' ----------------------------------------------');
  console.log(` Bank Manager:  ${adminEmail}  /  ${adminPassword}`);
  console.log(' Customer:      christopher111  /  1975@1975');
  console.log(' Customer:      alexandra.s7281 /  Sterling@2026');
  console.log(' Customer:      james.w4920     /  Whitfield@2026');
  console.log(' Customer:      maria.c8841     /  Castillo@2026');
  console.log(' ----------------------------------------------');
  console.log(` Accounts: ${state.size} · Operations Queue: 5 pending items`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
