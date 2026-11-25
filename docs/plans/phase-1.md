# Phase 1 plan: foundations

Approved 25 Nov 2026. Follows `docs/SPEC.md` section 8, Phase 1.

## Decisions (Phase 0)

- Move to **Vite** (plain JavaScript, no React). Vitest for unit tests, Playwright for browser tests. A GitHub Action builds and publishes to GitHub Pages on push to `main`.
- **Accounts (8):** Ulster Bank current; Revolut main balance; Revolut Pockets; Capital One credit card; Monzo savings (several, typed in by hand); Trading 212 Cash ISA; Trading 212 Stocks and Shares ISA (the InvestEngine ISA was moved here and is closed); workplace pension.
- **Phone bill** on the Capital One card goes in **Essentials**.
- **Data:** live data is the fresh start (the November cycle, 26 Oct to 23 Nov 2026, 76 transactions, with older months as summary totals). The full 12 months (2,743 transactions) is stored too, marked `archived`, and never counted in live views.
- **Keep from the current app**, beyond the spec: goals what-if sliders, insight cards, encrypted backups. The spec comes first where they clash.
- The current app is kept in `legacy/` and in commit `398d5dc` while its logic is ported phase by phase.

## 1. Project structure

```
index.html
src/main.js            app start, routing
src/lib/               money.js (pence), cycles.js, dates.js (Europe/London), supabase.js, data access
src/auth/              login, sign out, session, "can't reach the database" screen
src/ui/                Midnight tokens (CSS), app shell: sidebar on laptop, tab bar under 760px
supabase/migrations/   0001_schema.sql, 0002_rls.sql
scripts/               migrate-backup.mjs, rls-check.mjs
tests/                 Vitest unit tests, Playwright browser tests, tests/fixtures (fake data only)
legacy/                the previous app, runnable for reference
.env.example           committed, no real values
.github/workflows/     deploy.yml
```

## 2. Money and cycle helpers (test-first)

- Pence: text to integer pence without float maths ("100.01" -> 10001, "£1,234.5" -> 123450, "-12" -> -1200). Format only for display.
- Cycles: boundaries across month ends; day N of M using the real cycle length; predicted next payday (editable); pace = budget × days elapsed ÷ cycle length; "per month" = total ÷ days × 30.44.
- Dates are plain calendar dates in Europe/London.

## 3. Supabase schema

All tables from spec section 5, plus:

- `archived` flag on transactions (the 12-month history),
- `tag` on transactions,
- `monthly_pence` and `growth_rate` on goals (what-if sliders),
- `cycle_summaries` for the old months' headline totals.

Every row has `id`, `user_id` (default `auth.uid()`), `created_at`, `updated_at`. Amounts are integer pence. `(user_id, fingerprint)` is unique.

## 4. Security

- RLS on every table; select, insert, update and delete limited to `user_id = auth.uid()`.
- The browser gets only the URL and publishable key, from `.env.local`. The secret key is never used, including by scripts.
- `scripts/rls-check.mjs` proves a signed-out client gets zero rows from every table.

## 5. Login

- Supabase Auth, email and password. Sign-ups turned off once the account exists.
- Session kept on laptop and phone; sign-out button.
- "Can't reach your data" state with a retry when the project is paused or offline.

## 6. Moving the existing data

1. Copy both backup files first; the originals in `data/` are never changed.
2. `scripts/migrate-backup.mjs` signs in as Abilin (so RLS applies) and creates accounts, buckets (including Fuel), current categories (merged in Phase 2), the November cycle's budgets in pence, paydays as cycles, bills and shop rules.
3. Live data: the fresh-start backup.
4. Archive: the 12-month backup with `archived = true`, skipping rows already loaded (by fingerprint).
5. Print counts and £ totals per account, per kind, live vs archived, before and after; they must match to the penny. Running the script twice adds nothing.

## Needed from Abilin

1. Create the free Supabase project and a login; turn off new sign-ups.
2. Put the Project URL and the publishable key in `.env.local`.

## Done when

- All tests pass.
- Sign in on laptop and phone and see the November cycle's transactions.
- A signed-out request returns no rows.
- Migration totals match.
- Nothing is pushed until Abilin says so.
