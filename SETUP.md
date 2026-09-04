# Setup & Operations Guide

## 1. Prerequisites

- Node.js 20+ (or Bun 1.1+)
- PostgreSQL 14+ — local, or a Supabase project provisioned through the Vercel Marketplace

## 2. Environment

Copy `.env.example` → `.env` and fill in:

```bash
# Local Postgres example
POSTGRES_PRISMA_URL="postgresql://postgres:postgres@localhost:5432/arvest"
POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@localhost:5432/arvest"

# Required before production
SESSION_SECRET="<random 48-byte base64url>"
CARD_ENCRYPTION_KEY="<random 32-byte base64>"

# First manager account (bootstrap)
ADMIN_EMAIL="manager@arvestprivate.bank"
ADMIN_INITIAL_PASSWORD="choose-a-strong-password"
DEMO_MODE="true"        # false in production
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # CARD_ENCRYPTION_KEY
```

The app **refuses to boot in production** with a missing/weak `SESSION_SECRET` and requires `CARD_ENCRYPTION_KEY`.

## 3. Database

```bash
npm install
npm run db:push        # create/sync the schema (uses directUrl for DDL)
npm run db:seed        # optional demo data (also provisions the manager account)
```

`prisma/schema.prisma` uses:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("POSTGRES_PRISMA_URL")       // pooled (PgBouncer-safe)
  directUrl = env("POSTGRES_URL_NON_POOLING")  // direct, for migrations
}
```

These are exactly the variables Vercel injects when you install Supabase from the Vercel Marketplace — no manual Supabase account needed.

## 4. Run

```bash
npm run dev      # development, port 3000
npm run build    # prisma generate + next build
npm start        # production server
```

## 5. Verify

```bash
npm run test:integrity   # every account: balance == available + held, entry chains reconcile
npm run test:api         # 63-check battery against http://localhost:3000 (override with BASE=…)
```

Both must pass before deploying.

## 6. Deploy (GitHub → Vercel → Supabase Marketplace)

1. Push the repository to GitHub.
2. Vercel → **Add New Project** → import the repo.
3. Vercel → **Storage → Marketplace → Supabase → Install & connect**. Vercel provisions the Postgres database and injects `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_*`, `SUPABASE_*` automatically.
4. Add `SESSION_SECRET`, `CARD_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `DEMO_MODE=false` under Settings → Environment Variables.
5. Deploy. The build command (`vercel.json`) runs `prisma generate && next build`.
6. Create the schema on the production database once, from your machine:

   ```bash
   # .env contains the same variables Vercel injected
   npm run db:push
   npm run db:seed       # optional — demo bank + manager account
   ```

   If you skip the seed, the first login with `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` provisions the manager account automatically.
7. Sign in, open **Bank Settings**, change the manager password (audited), and set `DEMO_MODE=false` + rotate `ADMIN_INITIAL_PASSWORD`.

### Optional: scheduled processing

Add a Vercel Cron hitting `GET /api/cron/process` every 5–15 minutes with header `Authorization: Bearer <CRON_SECRET>`. It settles bill payments that have come due. (The Command Center also processes due bills lazily on load, so the demo works without cron.)

## 7. Operational notes

- **Never** mutate balances with ad-hoc SQL. Use the console's Credit/Debit/Hold/Release actions — they write proper ledger entries, notify the customer, and appear in the audit log.
- To reverse a posted transaction: **Transactions → Reverse** (reason required). The original is marked REVERSED and stays in the ledger forever.
- Card PANs are encrypted; the Reveal action is audited per manager. CVV/PIN are shown once at issue time and cannot be recovered — that is intentional.
- Rate limits are per-instance in memory. For multi-instance hardened deployments, back `src/lib/rate-limit.ts` with a shared store (Redis) — the interface is a single function.
- Backups: use Supabase automated backups; the ledger design means point-in-time restores reconcile cleanly.
