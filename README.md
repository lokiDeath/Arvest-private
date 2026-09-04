# Arvest Private Banking

A premium private-banking platform where the **Client portal** and the **Bank Manager Console** operate as one connected system on a single double-entry ledger.

- **Client side** — dashboard, accounts, transfers, mobile check deposit, bill pay, Zelle, cards, markets, sandbox wallet, loans, statements (PDF), messages, appointments, branches, alerts, profile/security.
- **Manager side** — Command Center, Operations Queue, Customers + per-customer **Customer Control Center**, Accounts, Transactions (ledger), Transfers, Zelle, Bill Pay, Deposits, Cards, Loans, Wallets, Messages, Appointments, Risk/Review, Statements/Reports, Bank Settings, Audit Log.

---

## Financial architecture (the part that matters)

All money movement flows through a **double-entry ledger** (`src/lib/ledger.ts`):

- Every movement = one `LedgerTransaction` + N `LedgerEntry` rows written in the **same database transaction** as the balance updates.
- Account fields: `balance` (book) = `available` (spendable) + `held` (reserved by pending items). The invariant is enforced on every posting and can be verified with `npm run test:integrity`.
- **Holds**: requests above the configured auto-approval threshold move funds `available → held` and appear in the Operations Queue. Approval settles (`held → external`); rejection releases (`held → available`). Both are atomic and idempotent (409 on a second decision).
- **No silent balances**: admins can credit, debit, hold, and release — always through ledger `ADJUSTMENT`/`HOLD`/`RELEASE` transactions with a required reason, a customer notification, and an audit entry. There is no "set balance" endpoint by design.
- **Reversals, not deletions**: posted transactions are reversed with mirrored entries (`REVERSAL` type). There is no API to edit or delete posted history.
- **Race safety**: sufficient funds are re-checked atomically inside each transaction (`UPDATE … WHERE available >= amount`), approval decisions lock the queue row `FOR UPDATE`, and money endpoints accept an `Idempotency-Key` header to kill repeated-click duplicates.
- **Alerts engine**: `BALANCE_BELOW`, `BALANCE_ABOVE`, and `LARGE_TRANSACTION` rules are evaluated server-side after every committed movement (with re-arming and dedupe) and raise in-app notifications.

## Security

- No hard-coded credentials. The initial manager account is provisioned once from `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` (login bootstrap or seed). Rotate after first sign-in.
- Stateless per-tab session tokens (HMAC-SHA256, `timingSafeEqual`), mirrored in an httpOnly cookie. Role/status are re-read from the database on every request — frozen users lose access immediately.
- Password reset: bcrypt-hashed single-use codes, attempt limits, rate limiting, no admin resets through the public flow. With `DEMO_MODE=true` the code is returned in the API response for testability (documented demo affordance — set `false` in production).
- Card numbers are stored **AES-256-GCM encrypted**; revealing a full PAN is an audited action. CVV/PIN are never stored in recoverable form.
- Server-side rate limiting on auth and money endpoints; Zod-free but strictly validated inputs (`HttpError` envelopes); customers can only ever touch their own rows.

## Quick start (local)

```bash
cp .env.example .env          # fill in the values (see below)
npm install                   # runs prisma generate
npm run db:push               # create schema
npm run db:seed               # demo bank: 4 customers, 2 years of ledger-consistent history, pending queue items
npm run dev                   # http://localhost:3000
```

Seed prints the demo credentials:

| Role | Login | Password |
|---|---|---|
| Bank Manager | `manager@arvestprivate.bank` | `Arvest-Manager-2026!` |
| Customer | `christopher111` | `1975@1975` |
| Customer | `alexandra.s7281` | `Sterling@2026` |
| Customer | `james.w4920` | `Whitfield@2026` |
| Customer | `maria.c8841` | `Castillo@2026` |

(Values come from `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` when provided.)

## Testing

```bash
npm run test:integrity        # ledger reconciliation for every account
npm run test:api              # 63-check HTTP battery against a running server (dev or prod)
```

The API battery covers auth/permissions, ledger math, holds + approvals (and double-approval 409s), reversals (and double-reverse 409s), loans, deposits, Zelle status sync, bill scheduling, alerts, idempotency replay, freeze semantics, settings whitelist, reports and audit.

## Deployment — GitHub → Vercel → Supabase (Marketplace)

This project is designed for the **official Supabase integration installed from the Vercel Marketplace** — you do **not** need a separate Supabase account:

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project → import the repo** (framework auto-detects Next.js).
3. In the project: **Storage / Marketplace → Supabase → Install → Create new** (or connect an existing Supabase store). Vercel automatically injects `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, and the other `POSTGRES_*` / `SUPABASE_*` variables. `prisma/schema.prisma` already reads exactly those two.
4. Add the remaining environment variables (Project → Settings → Environment Variables):

   | Variable | Required | Notes |
   |---|---|---|
   | `POSTGRES_PRISMA_URL` | auto (Marketplace) | pooled connection used by Prisma |
   | `POSTGRES_URL_NON_POOLING` | auto (Marketplace) | direct connection used for migrations/push |
   | `SESSION_SECRET` | **yes** | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `CARD_ENCRYPTION_KEY` | **yes** | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `ADMIN_EMAIL` | recommended | bootstraps the first manager login |
   | `ADMIN_INITIAL_PASSWORD` | recommended | remove/rotate after first sign-in |
   | `DEMO_MODE` | optional | `false` in production (stops returning reset codes) |

5. Deploy, then create the schema and the manager account — run locally against the production database:

   ```bash
   # with the Supabase variables from Vercel in your local .env
   npm run db:push          # or: npx prisma migrate deploy
   npm run db:seed          # optional demo data; also provisions the admin
   ```

   (No admin exists? The first login attempt with `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` provisions it automatically.)

6. Optional: schedule `GET /api/cron/process` (e.g. Vercel Cron every 5–15 min) so scheduled bill payments post even when nobody is logged in. Protect it with `CRON_SECRET`. Bills also process lazily whenever the Command Center loads, so the demo works without a cron.

## Environment variables

See [`.env.example`](./.env.example) — every variable is documented there, including the local-development values and the Supabase connection string formats.

## Project layout

```
prisma/schema.prisma          20 models — ledger, approvals, banking products, security
src/lib/ledger.ts             atomic double-entry engine (holds, settle, release, reverse)
src/lib/banking.ts            all workflows (transfers, zelle, bills, deposits, loans, wallet, admin ops)
src/lib/{session,api,rate-limit,crypto,settings,alerts,idempotency,notify}.ts
src/app/api/…                 45+ route handlers (customer + admin + cron)
src/components/banking/       customer app (17 views) + admin console (19 views)
scripts/seed.ts               ledger-consistent demo bank
scripts/api-tests.ts          63-check HTTP battery
scripts/check-integrity.ts    ledger reconciliation
```

## Notes

- The **Digital Wallet** module is an explicitly labeled **sandbox**: internal `SBX-…` handles, no cryptographic keys, no fake blockchain confirmations; sends above the configured threshold require manager approval.
- Markets uses public TradingView widgets and public ticker data; no keys required.
- `reactStrictMode` is off by design (banking demo double-fetch hygiene); TypeScript build errors are **not** ignored.
