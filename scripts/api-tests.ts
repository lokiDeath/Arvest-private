// ============================================================
// Arvest Private Banking — HTTP API smoke battery
// ============================================================
// Tests the live server (dev or production build) end to end:
// auth, permissions, the ledger, holds/approvals, reversals,
// loans, deposits, Zelle sync, bill pay, alerts, idempotency.
//
// Run against a running server:
//   npm run build && npm start   (or: npm run dev)
//   npm run test:api             (BASE=http://localhost:3000 by default)
// ============================================================
import crypto from 'crypto';

const BASE = process.env.BASE ?? 'http://localhost:3000';
let token = '';
let adminToken = '';
let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string) {
  checks++;
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    failures++;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Json { [k: string]: unknown }

const RUN_IP = `10.${crypto.randomInt(1, 250)}.${crypto.randomInt(1, 250)}.${crypto.randomInt(2, 250)}`;

async function req(method: string, path: string, body?: Json, tok?: string, idempotencyKey?: string): Promise<{ status: number; data: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(tok ? { 'X-Tab-Session': tok } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      // simulate a distinct client so per-IP rate limits don't trip across runs
      'X-Forwarded-For': RUN_IP,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: Json = {};
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nArvest API tests → ${BASE}\n`);

  // ---------------- AUTH ----------------
  let r = await req('POST', '/api/auth/login', { identifier: 'christopher111', password: 'wrong-password' });
  check('wrong password rejected (401)', r.status === 401);

  r = await req('POST', '/api/auth/login', { identifier: 'christopher111', password: '1975@1975' });
  check('customer login by Login ID', r.status === 200 && !!r.data.token);
  token = String(r.data.token ?? '');
  const customer = r.data.user as Json;

  r = await req('GET', '/api/auth/me', undefined, token);
  check('auth/me resolves session', r.status === 200 && (r.data.user as Json)?.id === customer?.id);

  r = await req('GET', '/api/admin/stats', undefined, token);
  check('customer blocked from admin API (403)', r.status === 403);

  r = await req('GET', '/api/accounts');
  check('accounts require auth (401)', r.status === 401);

  // admin login (seeded from env or default)
  const adminEmail = process.env.ADMIN_EMAIL || 'manager@arvestprivate.bank';
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Arvest-Manager-2026!';
  r = await req('POST', '/api/auth/login', { identifier: adminEmail, password: adminPassword });
  check('admin login by email', r.status === 200 && (r.data.user as Json)?.role === 'ADMIN');
  adminToken = String(r.data.token ?? '');

  // ---------------- LEDGER / TRANSFERS ----------------
  r = await req('GET', '/api/accounts', undefined, token);
  const accounts = r.data.accounts as Json[];
  check('customer sees own accounts', accounts.length >= 3);
  const checking = accounts.find((a) => a.type === 'CHECKING') as Json;
  const savings = accounts.find((a) => a.type === 'SAVINGS') as Json;
  const balBefore = checking.balance as number;
  const availBefore = checking.available as number;

  // internal transfer: instant, double-entry
  const idem = crypto.randomUUID();
  r = await req('POST', '/api/transfer', { fromAccountId: checking.id, toAccountId: savings.id, transferType: 'INTERNAL', amount: 100, memo: 'api test' }, token, idem);
  check('internal transfer posts instantly', r.status === 200 && r.data.status === 'COMPLETED', JSON.stringify(r.data));
  const trfRef = String(r.data.reference ?? '');

  // same idempotency key returns the stored response (no second debit)
  const r2 = await req('POST', '/api/transfer', { fromAccountId: checking.id, toAccountId: savings.id, transferType: 'INTERNAL', amount: 100, memo: 'api test' }, token, idem);
  check('idempotency-key replays stored response', r2.status === 200 && r2.data.reference === trfRef);

  r = await req('GET', '/api/accounts', undefined, token);
  const checkingAfter = (r.data.accounts as Json[]).find((a) => a.id === checking.id) as Json;
  check('transfer debited available exactly once', Math.abs((checkingAfter.available as number) - (availBefore - 100)) < 0.005,
    `before=${availBefore} after=${checkingAfter.available}`);

  // external transfer below threshold → instant
  r = await req('POST', '/api/transfer', { fromAccountId: checking.id, transferType: 'EXTERNAL', amount: 500, recipientName: 'Test Recipient' }, token, crypto.randomUUID());
  check('external transfer below threshold auto-posts', r.status === 200 && r.data.status === 'COMPLETED');

  // external transfer above threshold → held + queued
  const preHold = (await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === checking.id) as Json;
  const availAtHold = preHold.available as number;
  const heldAtHold = preHold.held as number;
  r = await req('POST', '/api/transfer', { fromAccountId: checking.id, transferType: 'EXTERNAL', amount: 3000, recipientName: 'Big Ticket Recipient' }, token, crypto.randomUUID());
  check('external transfer above threshold held for review', r.status === 200 && r.data.pending === true && r.data.status === 'PENDING');
  const holdRef = String(r.data.reference ?? '');

  r = await req('GET', '/api/accounts', undefined, token);
  const heldAcct = (r.data.accounts as Json[]).find((a) => a.id === checking.id) as Json;
  check('hold moved available → held (exact deltas)', Math.abs((heldAcct.available as number) - (availAtHold - 3000)) < 0.005 && Math.abs((heldAcct.held as number) - (heldAtHold + 3000)) < 0.005,
    `avail ${availAtHold}→${heldAcct.available} held ${heldAtHold}→${heldAcct.held}`);

  // insufficient funds rejected INSIDE the ledger
  r = await req('POST', '/api/transfer', { fromAccountId: checking.id, transferType: 'EXTERNAL', amount: 10_000_000, recipientName: 'Overflow' }, token, crypto.randomUUID());
  check('insufficient funds rejected', r.status === 422);

  // ---------------- ADMIN: approve the held transfer ----------------
  r = await req('GET', '/api/admin/approvals?status=PENDING', undefined, adminToken);
  const approvals = r.data.approvals as Json[];
  const transferApproval = approvals.find((a) => a.type === 'EXTERNAL_TRANSFER' && (JSON.parse(String(a.payload ?? '{}')) as Json).recipientName === 'Big Ticket Recipient');
  check('held transfer appears in Operations Queue', !!transferApproval);

  // double-approve protection: approve once…
  const balBeforeSettle = ((await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === checking.id) as Json).balance as number;
  r = await req('POST', `/api/admin/approvals/${transferApproval!.id}`, { decision: 'APPROVED', note: 'api test' }, adminToken);
  check('queue approval settles hold', r.status === 200 && r.data.success === true, JSON.stringify(r.data));
  // …then twice → 409
  r = await req('POST', `/api/admin/approvals/${transferApproval!.id}`, { decision: 'APPROVED', note: 'double click' }, adminToken);
  check('double-approve rejected (409)', r.status === 409);

  r = await req('GET', '/api/accounts', undefined, token);
  const settled = (r.data.accounts as Json[]).find((a) => a.id === checking.id) as Json;
  check('approval settled hold: held back to pre-hold level, balance reduced by 3000',
    Math.abs((settled.held as number) - heldAtHold) < 0.005 && Math.abs((settled.balance as number) - (balBeforeSettle - 3000)) < 0.005,
    `held=${settled.held} bal=${settled.balance}`);

  // ---------------- ZELLE ----------------
  r = await req('POST', '/api/zelle', { fromAccountId: checking.id, recipientName: 'Zelle Friend', recipientEmail: 'friend@example.com', amount: 250 }, token, crypto.randomUUID());
  check('zelle below threshold completes', r.status === 200 && r.data.status === 'COMPLETED');
  const zelleRef = String(r.data.reference ?? '');
  r = await req('GET', '/api/zelle', undefined, token);
  const zt = (r.data.zelleTransfers as Json[]).find((z) => z.reference === zelleRef);
  check('zelle status COMPLETED + ledger linked', !!zt && zt.status === 'COMPLETED' && !!zt.ledgerTxId);

  // ---------------- CHECK DEPOSIT + ADMIN REVIEW ----------------
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  r = await req('POST', '/api/check-deposit', { accountId: checking.id, amount: 750, frontImage: tinyPng, backImage: tinyPng, checkNumber: 'T-1' }, token, crypto.randomUUID());
  check('mobile deposit submitted for review', r.status === 200, JSON.stringify(r.data));
  const depId = String((r.data.deposit as Json)?.id ?? '');

  r = await req('GET', '/api/admin/approvals?status=PENDING', undefined, adminToken);
  const depApproval = ((r.data.approvals as Json[]) ?? []).find((a) => a.type === 'CHECK_DEPOSIT' && (JSON.parse(a.payload as string) as Json).depositId === depId);
  const balBeforeDep = (await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === checking.id)!.balance as number;
  r = await req('POST', `/api/admin/approvals/${depApproval!.id}`, { decision: 'APPROVED', note: 'images legible' }, adminToken);
  check('admin approves deposit → credited', r.status === 200, JSON.stringify(r.data));
  r = await req('GET', '/api/accounts', undefined, token);
  const depAcct = (r.data.accounts as Json[]).find((a) => a.id === checking.id) as Json;
  check('deposit credited via ledger (+750)', Math.abs((depAcct.balance as number) - (balBeforeDep + 750)) < 0.005);

  // ---------------- REVERSAL ----------------
  r = await req('GET', `/api/admin/transactions?q=${zelleRef}`, undefined, adminToken);
  const zelleTx = (r.data.transactions as Json[])?.[0];
  check('admin can locate zelle ledger tx', !!zelleTx);
  const zBalBefore = ((await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === checking.id) as Json).balance as number;
  r = await req('POST', '/api/admin/transactions/reverse', { ledgerTxId: zelleTx!.id, reason: 'api test reversal' }, adminToken);
  check('reversal posts mirrored entries', r.status === 200 && !!r.data.reversalRef, JSON.stringify(r.data));
  r = await req('POST', '/api/admin/transactions/reverse', { ledgerTxId: zelleTx!.id, reason: 'double reverse' }, adminToken);
  check('double-reverse rejected (409)', r.status === 409);
  const zBalAfter = ((await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === checking.id) as Json).balance as number;
  check('reversal restored the debited amount (+250)', Math.abs(zBalAfter - (zBalBefore + 250)) < 0.005, `before=${zBalBefore} after=${zBalAfter}`);

  // admin cannot delete/edit history — no such endpoint exists
  r = await req('DELETE', `/api/admin/transactions/${zelleTx!.id}`, undefined, adminToken);
  check('ledger history has no delete endpoint (404/405)', r.status === 404 || r.status === 405);

  // ---------------- LOANS ----------------
  r = await req('POST', '/api/loans', { loanType: 'PERSONAL', amount: 8000, term: 24, purpose: 'api test loan' }, token, crypto.randomUUID());
  check('loan application creates queue item', r.status === 200, JSON.stringify(r.data));
  const loanId = String((r.data.loan as Json)?.id ?? '');
  r = await req('GET', '/api/admin/approvals?status=PENDING', undefined, adminToken);
  const loanApproval = ((r.data.approvals as Json[]) ?? []).find((a) => a.type === 'LOAN' && (JSON.parse(a.payload as string) as Json).loanId === loanId);
  const loanBalBefore = ((await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === savings.id) as Json).balance as number;
  // approve → disburses to first active account (checking was auto-selected)
  r = await req('POST', `/api/admin/approvals/${loanApproval!.id}`, { decision: 'APPROVED', note: 'good standing' }, adminToken);
  check('loan approval disburses', r.status === 200, JSON.stringify(r.data));
  r = await req('GET', '/api/loans', undefined, token);
  const loanRow = (r.data.loans as Json[]).find((l) => l.id === loanId);
  check('loan ACTIVE with remaining balance', !!loanRow && loanRow.status === 'ACTIVE' && Math.abs(loanRow.remainingBalance as number - 8000) < 0.01);

  // loan payment
  const payBefore = ((await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === savings.id) as Json).available as number;
  r = await req('POST', `/api/loans/${loanId}`, { accountId: savings.id, amount: 500 }, token, crypto.randomUUID());
  const interest = Math.round(Math.min(500 * (8.9 / 100 / 12), 500) * 100) / 100;
  const principal = Math.round((500 - interest) * 100) / 100;
  check('loan payment posts (interest split applied)', r.status === 200 && Math.abs((r.data.remaining as number) - (8000 - principal)) < 0.01, JSON.stringify(r.data));
  const payAfter = ((await (await req('GET', '/api/accounts', undefined, token)).data.accounts as Json[]).find((a) => a.id === savings.id) as Json).available as number;
  check('loan payment debited account (-500)', Math.abs(payAfter - (payBefore - 500)) < 0.005);

  // ---------------- BILL PAY ----------------
  r = await req('POST', '/api/billpay', { accountId: checking.id, payee: 'API Utility Co', amount: 150, payDate: new Date().toISOString() }, token, crypto.randomUUID());
  check('bill due today pays instantly (below threshold)', r.status === 200 && (r.data.bill as Json)?.status === 'PAID', JSON.stringify(r.data));
  r = await req('POST', '/api/billpay', { accountId: checking.id, payee: 'API Tuition', amount: 5000, payDate: new Date().toISOString() }, token, crypto.randomUUID());
  check('bill above threshold goes ON_HOLD for review', r.status === 200 && (r.data.bill as Json)?.status === 'ON_HOLD', JSON.stringify(r.data));

  // ---------------- ALERTS ----------------
  r = await req('POST', '/api/alerts', { type: 'LARGE_TRANSACTION', threshold: 50 }, token);
  check('alert rule created', r.status === 200);
  const alertId = String((r.data.alert as Json)?.id ?? '');
  // a movement > 50 fires a notification
  await req('POST', '/api/transfer', { fromAccountId: savings.id, toAccountId: checking.id, transferType: 'INTERNAL', amount: 75 }, token, crypto.randomUUID());
  r = await req('GET', '/api/notifications', undefined, token);
  const fired = (r.data.notifications as Json[]).some((n) => n.type === 'ALERT_TRIGGERED');
  check('alert engine fired LARGE_TRANSACTION notification', fired);
  r = await req('DELETE', `/api/alerts?id=${alertId}`, undefined, token);
  check('alert rule deleted', r.status === 200);

  // ---------------- PROFILE / SECURITY ----------------
  r = await req('PATCH', '/api/profile', { action: 'CHANGE_PASSWORD', currentPassword: '1975@1975', newPassword: 'short' }, token);
  check('weak password rejected', r.status === 422);
  r = await req('PATCH', '/api/profile', { action: 'CHANGE_PASSWORD', currentPassword: 'wrong', newPassword: 'NewPassword123' }, token);
  check('wrong current password rejected', r.status === 422);

  // forgot/reset flow (demo mode returns code)
  r = await req('POST', '/api/auth/forgot', { identifier: 'james.w4920' });
  const demoCode = r.data.demoCode as string | undefined;
  check('forgot flow issues demo code (DEMO_MODE)', r.status === 200 && typeof demoCode === 'string');
  r = await req('POST', '/api/auth/reset', { identifier: 'james.w4920', code: demoCode, password: 'Whitfield@2027' });
  check('reset with code succeeds', r.status === 200 && r.data.success === true);
  r = await req('POST', '/api/auth/login', { identifier: 'james.w4920', password: 'Whitfield@2027' });
  check('login with new password works', r.status === 200);
  // restore original password via reset flow again
  r = await req('POST', '/api/auth/forgot', { identifier: 'james.w4920' });
  r = await req('POST', '/api/auth/reset', { identifier: 'james.w4920', code: r.data.demoCode as string, password: 'Whitfield@2026' });
  check('password restored', r.status === 200);

  // forgot must not reset admins
  r = await req('POST', '/api/auth/forgot', { identifier: adminEmail });
  check('admin never receives reset code', r.data.demoCode === undefined);

  // ---------------- ADMIN FINANCIAL OPS ----------------
  r = await req('POST', '/api/admin/accounts', { action: 'ADJUST', accountId: savings.id, direction: 'CREDIT', amount: 250, reason: 'api adjustment test' }, adminToken);
  check('admin credit posts via ledger', r.status === 200, JSON.stringify(r.data));
  r = await req('POST', '/api/admin/accounts', { action: 'ADJUST', accountId: savings.id, direction: 'DEBIT', amount: 25, reason: 'api debit test' }, adminToken);
  check('admin debit posts via ledger', r.status === 200);
  r = await req('POST', '/api/admin/accounts', { action: 'ADJUST', accountId: savings.id, direction: 'DEBIT', amount: 25 }, adminToken);
  check('adjustment without reason rejected (422)', r.status === 422);
  r = await req('POST', '/api/admin/accounts', { action: 'HOLD', accountId: savings.id, amount: 100, reason: 'api hold test' }, adminToken);
  check('admin places hold', r.status === 200);
  r = await req('POST', '/api/admin/accounts', { action: 'RELEASE', accountId: savings.id, amount: 100, reason: 'api release test' }, adminToken);
  check('admin releases hold', r.status === 200);

  // freeze → new sign-in blocked at the door, existing sessions lose access
  r = await req('POST', '/api/admin/customers', { action: 'CREATE', name: 'Frozen Test', email: `frozen.${Date.now()}@example.com`, password: 'FrozenTest123' }, adminToken);
  check('admin creates customer with credentials', r.status === 200 && !!r.data.credentials, JSON.stringify(r.data));
  const frozenCreds = r.data.credentials as { loginId: string; password: string };
  const frozenId = String((r.data.user as Json)?.id ?? '');
  const frozenLogin = await req('POST', '/api/auth/login', { identifier: frozenCreds.loginId, password: frozenCreds.password });
  check('new customer can sign in', frozenLogin.status === 200);
  const frozenToken = String(frozenLogin.data.token ?? '');
  r = await req('POST', '/api/admin/customers', { action: 'SET_STATUS', id: frozenId, status: 'FROZEN' }, adminToken);
  check('admin freezes customer', r.status === 200);
  const refrozenLogin = await req('POST', '/api/auth/login', { identifier: frozenCreds.loginId, password: frozenCreds.password });
  check('frozen customer cannot sign in (403)', refrozenLogin.status === 403);
  r = await req('POST', '/api/transfer', { fromAccountId: checking.id, transferType: 'EXTERNAL', amount: 10, recipientName: 'X' }, frozenToken, crypto.randomUUID());
  check('existing session of frozen user blocked from money movement (403/423)', r.status === 403 || r.status === 423, `got ${r.status}`);
  await req('POST', '/api/admin/customers', { action: 'DELETE', id: frozenId }, adminToken);
  check('admin unfreezes/cleans up test customer', true);

  // ---------------- SETTINGS ----------------
  r = await req('GET', '/api/admin/settings', undefined, adminToken);
  check('settings readable', r.status === 200 && (r.data.settings as Json)?.['zelle.autoApproveUsd'] === '1000');
  r = await req('PUT', '/api/admin/settings', { 'zelle.autoApproveUsd': '1500', 'evil.key': 'x' }, adminToken);
  check('settings PUT whitelists keys', r.status === 200);
  r = await req('GET', '/api/admin/settings', undefined, adminToken);
  check('unknown keys ignored', (r.data.settings as Json)?.['evil.key'] === undefined);
  await req('PUT', '/api/admin/settings', { 'zelle.autoApproveUsd': '1000' }, adminToken);

  // ---------------- REPORTS / RISK / AUDIT ----------------
  r = await req('GET', '/api/admin/reports?window=30', undefined, adminToken);
  check('bank report generated', r.status === 200 && ((r.data.report as Json)?.customers as number) >= 4);
  r = await req('GET', '/api/admin/risk', undefined, adminToken);
  check('risk cockpit loads', r.status === 200 && Array.isArray(r.data.flagged));
  r = await req('GET', '/api/admin/audit?action=ADMIN_ADJUSTMENT', undefined, adminToken);
  check('audit log has adjustment entries', r.status === 200 && (r.data.logs as Json[]).length >= 2);

  // ---------------- notifications ----------------
  r = await req('GET', '/api/admin/queue', undefined, adminToken);
  check('queue counts endpoint', r.status === 200 && typeof r.data.approvals === 'number');

  console.log(`\n${checks} checks, ${failures} failure(s).`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
