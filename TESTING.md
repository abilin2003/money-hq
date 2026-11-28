# Testing Money HQ

Money HQ handles real money, so every change is checked automatically before you're asked to try it:
**build → test → verify → fix → retest → approve → deploy.**

## The short version

| What | Command | Time |
|---|---|---|
| Everything (unit tests, build, browser tests) | `npm run check` | about 1 minute |
| Quick (unit tests and build only) | `npm run check:quick` | a few seconds |
| Unit tests only | `npm test` | a few seconds |
| Browser tests only | `npm run test:e2e` | under a minute |
| Browser tests you can watch and step through | `npm run test:e2e:ui` | |
| Real-database tests (needs the test project, see below) | `npm run test:db` | under a minute |

None of these touch your real Supabase data.

## What's installed

- **Vitest** (`tests/unit/`): fast tests of the money rules, using the app's real code: balances
  (`src/lib/balances.js`), spending (`src/lib/summary.js`), purchases with IOUs (`src/lib/shares.js`),
  repayments (`src/lib/ious.js`), imports, dates, cycles and more. `tests/unit/scenarios.test.js` holds the
  core scenarios: transfers, spending, reimbursable and split purchases, repayments, the credit card and
  invalid input.
- **Playwright** (`tests/e2e/`): the real app in a real Chromium browser, at laptop (1280px) and phone
  (390px) sizes, signing in, filling forms and checking what was actually saved.
- **A fake Supabase** (`tests/e2e/fake-supabase.mjs`): see below.
- **GitHub Actions**: `.github/workflows/deploy.yml` runs the unit and browser tests before every publish
  (a failing test stops the site being updated); `.github/workflows/checks.yml` checks other branches and pull
  requests.

## The isolated test environment

Browser tests never use your real Supabase project. They use a **fake Supabase**: a small server that runs on
your computer (or on GitHub's test machine), answers the same requests the app makes, and keeps everything in
memory. It starts from made-up data in `tests/e2e/seed.mjs` (Test Bank £2,000, Test Spending £300, Test Cash ISA
£6,000, Test Card, Test Pension, a few categories) and is **reset before every test**.

Safeguards, in layers:
1. Playwright starts the app with the fake's address (`http://127.0.0.1:54329`) and a fake key, overriding
   `.env.local` for that run only.
2. Before any test runs, `tests/e2e/global-setup.mjs` checks the fake answers with its marker, and refuses to
   run if the address looks like any real Supabase project.
3. During every test, any request to `supabase.co` is blocked and the test fails (`tests/e2e/helpers.js`).
4. The fake only listens on `127.0.0.1`, so nothing outside your computer can reach it.
5. GitHub Actions' checks never receive your Supabase address or key.

**What the fake can't check:** it doesn't run the real database, so it can't prove Row Level Security or the
SQL inside `supabase/migrations/` (for example the `add_purchase_with_ious` function). Those still need a real
database. The safe way to add that is a second, free Supabase project used only for tests (see "Still to
set up" below). Never point tests at your real project instead.

## Making fake data for a test

- Add rows to `tests/e2e/seed.mjs` for data every test should start with.
- Or seed just for one test: `POST http://127.0.0.1:54329/__test/seed` with `{ "transactions": [...], "people": [...] }`
  (see `tests/e2e/ious.spec.js`).
- To check what was saved: `GET /__test/state` (the helper `fakeState()` does this).
- To simulate a database failure on the next request: `POST /__test/fail` with `{ "table": "transactions", "method": "POST" }`.
- You can run the fake on its own with `npm run fake-db` and look at `http://127.0.0.1:54329/__test/state`.

Only ever use made-up names, shops and amounts in tests. The repository is public.

## When a test fails

- The terminal says which test and which line, with what was expected and what happened.
- `npx playwright show-report` opens a report with a screenshot, a video and a step-by-step trace of the
  failed browser test (they're saved in `test-results/`).
- On GitHub, a failed run uploads the same report as an artifact called `playwright-report`.

## Adding tests

- **New money logic**: a Vitest test in `tests/unit/` next to similar ones, with made-up figures and
  the expected pence.
- **A new screen or form**: a Playwright test in `tests/e2e/` that does what you'd do and then checks the fake
  database (`fakeState()`), the screen, and the result after a reload. Use labels and roles to find things
  (`getByLabel('Amount', { exact: true })`), not page positions.
- **A bug**: first write a test that shows the bug (it fails), then fix the code until it passes. Keep the
  test: it stops the bug coming back.
- **A known bug not fixed yet**: write the correct test and mark it as expected to fail (`test.fail(...)` in
  Playwright, `it.fails(...)` in Vitest) with the issue number from `docs/KNOWN-ISSUES.md`. Don't weaken the
  test. When the bug is fixed the test starts passing, the runner flags it, and the marker comes off.

## Keeping it healthy

- If the app starts making a new kind of database request (a new filter, table or function), teach
  `tests/e2e/fake-supabase.mjs` to answer it the same way the real database would.
- Updating Playwright: `npm install -D @playwright/test@<version>` then `npx playwright install chromium`.

## Never

- Never run tests, scripts or seed data against your real Supabase project.
- Never put real transactions, names, balances or keys in tests or fixtures.
- Never weaken or delete a failing test to make a change pass; fix the change or report it.
- Never apply a database migration to production as part of testing.

## Expected failures right now

None. The two known problems found in Phase 1 (words in "Amount they owe" taken as the whole amount, and an
invalid expected-by date not checked before saving) were fixed in Phase 2A, and their tests are now normal
regression tests. If a known bug is ever recorded this way again, its test is marked expected-to-fail, its name
starts with "KNOWN", and it's listed here and in `docs/KNOWN-ISSUES.md`: "passed" then means "still broken, as
recorded", not "working".

## Real test database (Row Level Security and the SQL functions)

The fake database can't prove the real database's security rules or its SQL functions (such as
`add_purchase_with_ious`, which saves a purchase and its IOUs all or nothing). `tests/integration/` checks those
against a **separate, empty Supabase project used only for tests**. Until it exists, `npm run test:db` skips
itself and says why.

Safeguards: the tests read `.env.test.local` (never committed), refuse to run if its address is your real
project's (from `.env.local`) or the key looks secret, refuse if a test user has any account not named "TEST …",
only ever create rows named "TEST … run-…", and delete them again afterwards.

### Setting it up (once, about 10 minutes, in your browser)

1. Go to supabase.com/dashboard and choose **New project** (in the same organisation is fine; the free plan
   allows two projects).
2. Name it **money-hq-test**, choose a region, and let Supabase generate the database password. You won't need
   it for the tests, but keep it in your password manager. Create the project and wait for it to finish.
3. In this folder, run `npm run test-db:schema`. It writes `test-results/test-db-setup.sql`: every migration
   joined into one file, with structure and security rules only and no data.
4. In the **money-hq-test** project (check the project name at the top before you run anything): **SQL Editor →
   New query**, paste the whole file, **Run**.
5. **Authentication → Users → Add user → Create new user**, twice: `test-a@example.test` and
   `test-b@example.test`, each with a made-up password, and tick **Auto Confirm User**.
6. **Project Settings → API Keys**: copy the project URL and the **publishable** key (never the secret one).
7. Copy `.env.test.example` to `.env.test.local` and fill in the URL, the publishable key and the two test users.
8. Run `npm run test:db`. The six tests should pass: a fully repaid purchase, a part-repaid one, invalid
   amounts refused, all-or-nothing saving, still there after signing in again, and another user can't see or
   change them.

Never put real data in the test project, and never put your real project's details in `.env.test.local`.
When a migration is added later, run it in the test project first.
