# Arvest Private Banking — Rebuild Worklog

## Task Overview
Transform the uploaded Arvest Private Banking project into a complete premium private-banking
platform (Client + Bank-Manager Admin as one connected system). Coin Private = architecture
reference ONLY. Final deliverable: full GitHub/Vercel-ready project folder with Supabase
(Vercel Marketplace) database configuration.

---
Task ID: 1
Agent: main (Super Z)
Task: Inspect both uploaded projects before changing anything

Work Log:
- Extracted arvest-private-banking.zip → /home/z/my-project/work/arvest-raw/arvest-private-banking-main
- Extracted COIN PRIVATE.tar → /home/z/my-project/work/coin
- Ran two thorough Explore agents (full reports in conversation) covering all APIs, auth,
  components, schema, seed, tests, styling.

Stage Summary — ARVEST (target) findings:
- Next.js 16.1.1 + React 19 + Prisma 6 (postgresql) + Tailwind 4 + shadcn + zustand. Single-page
  app; hash-based client routing; per-tab HMAC session token via X-Tab-Session header.
- DUPLICATE full app copy inside public/ (public/src, public/prisma, public/package.json...) → must delete.
- next.config.ts has typescript.ignoreBuildErrors: true → must remove.
- SECURITY: hardcoded admin creds LUCIAN1975/PASSWORD@@1975 in api/auth/login + lookup;
  password-reset code returned in API response (takeover vector); SESSION_SECRET fallback constant;
  PAN/CVV/PIN + wallet private keys stored plaintext; no rate limiting.
- LEDGER: no double-entry; api/admin/set-balance god-mode; transaction-action approve has NO
  balance re-check (negative balances possible), NOT idempotent (double-approve double-debits),
  REVERSE repeatable; admin can edit/delete posted history.
- BROKEN/DEAD: /api/loans missing entirely (customer UI calls it); check deposits never reviewed
  or credited; wallet = closed fake loop (fake txHash, balance never debited, no funding path);
  alerts stored but never evaluated; Zelle/BillPay status never synchronized on approval;
  "Reverse" button actually sends DECLINE; AdminCustomerDetail shows ALL customers' accounts
  (userId not selected); unused safe-fetch/remember-cookie/hello-world stub.
- Admin = one long scroll page (admin-dashboard.tsx 1385 lines + admin-customer-detail.tsx 926).
  Missing: Loans, Deposits review, Wallets, Reports, Settings, Risk, dedicated Audit/Queue.
- Customer side largely solid (17 views) — keep and patch. Seed data rich (2 years of history).
- No tests at all. globals.css: cream bg, crimson primary, gold accent, dark espresso sidebar.

Stage Summary — COIN PRIVATE (reference) patterns to adapt:
- ledger.ts: postLedger/postLedgerInTx atomic double-entry (LedgerTransaction + LedgerEntry with
  balanceBefore/After), available⇄reserved bucket holds, mirrored-entry reverseLedger() with
  ALREADY_REVERSED/NOT_POSTED guards, INSUFFICIENT_FUNDS re-checked inside tx. THE core pattern.
- Unified Approval queue (type, reference, payload JSON, status, decidedBy/Note/At, 409 on
  non-pending) driving deposits/withdrawals/risk trades.
- Admin console: zustand view switching, grouped sidebar nav + mobile Sheet drawer + bottom bar,
  per-view files, useFetch hook, StatusPill/EmptyState/SkeletonBlock/SegmentedTabs primitives,
  user-detail view with section cards + reason-required Adjust Funds dialog.
- session.ts/api.ts: HttpError + handler wrapper, requireAuth/requireAdmin, auth guards reject
  FROZEN users; notify/audit/securityEvent trio after privileged mutations; Setting key/value store
  with defaults + TTL cache.
- api-tests.ts: 56-check HTTP smoke battery run against live server. reset-data + reconcile scripts.
- Weaknesses NOT to copy: no zod usage, no rate limiting, ignoreBuildErrors, plaintext secrets.

---
Task ID: 2
Agent: main (Super Z)
Task: Full rebuild of Arvest Private Banking (client + admin + ledger + security + tests)

Work Log:
- Purged the duplicate application under public/; public/ now holds only real assets.
- Rebuilt prisma/schema.prisma (v2, PostgreSQL/Supabase): LedgerTransaction + LedgerEntry double-entry,
  Approval queue, Loan/LoanPayment, Card (AES-256-GCM PAN, bcrypt PIN, no stored CVV), sandbox Wallet,
  SecurityEvent, Setting, IdempotencyKey; Account gains held bucket (balance = available + held).
- New lib layer: ledger.ts (atomic postLedgerInTx, holds, settle, release, reverseLedger with guards),
  banking.ts (every workflow: transfers, zelle, billpay scheduling, check deposits, loans, wallet sandbox,
  central decideApproval dispatcher with FOR UPDATE row locks), session.ts (HMAC + timingSafeEqual,
  httpOnly cookie fallback, no hardcoded creds), api.ts (HttpError/handler envelope, guards), rate-limit.ts,
  crypto.ts, settings.ts (key/value thresholds), alerts.ts (server-side evaluation engine), idempotency.ts.
- Rebuilt all 45+ API routes (auth, customer, admin, cron); removed set-balance/write-transaction/
  transaction-action god-modes; deleted /api/route.ts stub; notifications read/clear/[id] restored.
- Rebuilt the Admin experience as a real console: admin-console.tsx shell (grouped sidebar 18 items,
  queue badges, mobile drawer + bottom nav) + 19 views incl. Customer Control Center (13 tabs),
  Operations Queue, Risk, Reports (CSV), Bank Settings, Audit. Shared primitives module.
- Completed customer features: Loans (full API + admin approval + payments), Mobile Deposit (admin review
  with images, ledger crediting), Zelle status sync, Bill Pay scheduling/status, Alerts processing,
  Wallet relabeled sandbox (no private keys, no fake hashes, faucet + approval flow).
- Security: no source credentials, bcrypt reset codes (5 attempts), rate limiting (login/forgot/money),
  frozen-user enforcement everywhere, encrypted PANs, audited reveals, DEMO_MODE-gated reset codes.
- Fixed next.config (no ignoreBuildErrors), tsconfig excludes, package.json scripts (typecheck,
  test:api, test:integrity, db:seed), vercel.json build command, .env.example fully documented.
- Wrote scripts/seed.ts (v6, ledger-consistent 2-year history + 5 pending queue items),
  scripts/api-tests.ts (63-check HTTP battery), scripts/check-integrity.ts (reconciliation).
- Fixed all TypeScript errors; npx tsc --noEmit exits 0; production build (prisma generate + next build)
  succeeds; 63/63 API checks pass against the production server; integrity check passes for all 9 accounts.
- Browser-verified (agent-browser): login (2-step), customer home/loans, admin login, Command Center,
  Operations Queue + approve flow, Customer Control Center, mobile viewport (drawer + bottom nav).
  Fixed InactivityGuard children rendering bug and sidebar contrast during verification.
- Wrote README.md + SETUP.md (Vercel Marketplace Supabase deployment, env var table, ops guide).
- Generated package-lock.json for reproducible npm/Vercel installs.

Stage Summary:
- Deliverable: complete rebuilt project folder at /home/z/my-project, packaged for GitHub/Vercel.
- All acceptance criteria implemented: atomic ledger, approvals queue, admin financial control with
  audit trail, customer control center, completed workflows, security hardening, clean build, tests.
