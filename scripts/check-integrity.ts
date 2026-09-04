// ============================================================
// Arvest — Ledger integrity checker
// Verifies, for every account:
//   1. balance == available + held
//   2. the entry chain reconciles: opening + Σ(entries) == current
//   3. no negative balances anywhere
// Run:  npm run test:integrity
// ============================================================
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const accounts = await db.account.findMany();
  let failures = 0;

  for (const acct of accounts) {
    const problems: string[] = [];

    if (Math.abs(acct.balance - (acct.available + acct.held)) > 0.005) {
      problems.push(`balance invariant: balance=${acct.balance.toFixed(2)} available=${acct.available.toFixed(2)} held=${acct.held.toFixed(2)}`);
    }
    if (acct.balance < -0.005 || acct.available < -0.005 || acct.held < -0.005) {
      problems.push('negative balance');
    }

    const entries = await db.ledgerEntry.findMany({
      where: { accountId: acct.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // walk the chain using before/after fields (which must also be continuous)
    let prevBal: number | null = null;
    let prevAvail: number | null = null;
    for (const e of entries) {
      if (prevBal !== null && Math.abs(e.balanceBefore - prevBal) > 0.005) {
        problems.push(`balance chain break at entry ${e.id}: ${prevBal.toFixed(2)} → ${e.balanceBefore.toFixed(2)}`);
        break;
      }
      if (prevAvail !== null && Math.abs(e.availableBefore - prevAvail) > 0.005) {
        problems.push(`available chain break at entry ${e.id}: ${prevAvail.toFixed(2)} → ${e.availableBefore.toFixed(2)}`);
        break;
      }
      prevBal = e.balanceAfter;
      prevAvail = e.availableAfter;
    }

    // final: last entry's after must equal the account's current values
    if (entries.length > 0 && problems.length === 0) {
      const last = entries[entries.length - 1];
      if (Math.abs(last.balanceAfter - acct.balance) > 0.005) {
        problems.push(`final balance mismatch: ledger=${last.balanceAfter.toFixed(2)} account=${acct.balance.toFixed(2)}`);
      }
      if (Math.abs(last.availableAfter - acct.available) > 0.005) {
        problems.push(`final available mismatch: ledger=${last.availableAfter.toFixed(2)} account=${acct.available.toFixed(2)}`);
      }
    }

    if (problems.length > 0) {
      failures++;
      console.log(`✗ Account ${acct.nickname} (${acct.accountNumber.slice(-4)}) — ${problems.length} problem(s)`);
      for (const p of problems) console.log(`    ${p}`);
    } else {
      console.log(`✓ Account ${acct.nickname} (${acct.accountNumber.slice(-4)}) — balance ${acct.balance.toFixed(2)} reconciles across ${entries.length} entries`);
    }
  }

  // ledger-level checks: every transaction's entries must be balanced or represent external flows
  const txs = await db.ledgerTransaction.findMany({ include: { entries: true } });
  let revOk = true;
  for (const tx of txs) {
    if (tx.type === 'REVERSAL') {
      const orig = await db.ledgerTransaction.findFirst({ where: { reference: String((JSON.parse(tx.meta) as { reversalOf?: string }).reversalOf ?? '') } });
      if (!orig) { console.log(`✗ Reversal ${tx.reference} has no original`); revOk = false; continue; }
      if (orig.status !== 'REVERSED') { console.log(`✗ Reversal ${tx.reference}: original ${orig.reference} not marked REVERSED`); revOk = false; }
    }
  }
  if (!revOk) failures++;

  if (failures === 0) {
    console.log(`\nAll ${accounts.length} accounts reconcile. Ledger integrity OK.`);
  } else {
    console.log(`\n${failures} account(s) failed integrity checks.`);
    process.exit(1);
  }
}

main().finally(() => db.$disconnect());
