# Money HQ

Personal finance app for one user (me, Abilin). Static site on GitHub Pages, data in Supabase.
The full spec is `docs/SPEC.md`. Read the sections relevant to the current task; don't load all of it every time.
Reference designs are in `docs/design/` (Midnight, dark theme).

## Rules that must never break
- IMPORTANT: Never commit bank data. No real CSV, Excel or JSON exports in the repo. Test data in `tests/fixtures/` must be fake.
- Never put the Supabase secret / service role key anywhere in this repo or the frontend. The frontend uses only the URL and publishable key from `.env.local`.
- Every Supabase table has Row Level Security on, with policies limited to `user_id = auth.uid()`. Schema changes go in a new file in `supabase/migrations/`, never edited in place.
- Money is integer pence everywhere. Format only for display.
- Dates use Europe/London. Periods are pay cycles (salary day to the day before next salary), not calendar months, unless I pick calendar months.
- Transfers between my own accounts are never spending or income. Friends paying me back is never income.
- Never lose saved data. Nothing on page load may wipe or overwrite existing data, and any change to the data's shape needs a migration and a test.
- Ask before pushing to GitHub: `main` is the live site.

## Workflow
- Work one phase of `docs/SPEC.md` section 8 at a time. Start each phase in plan mode and get my OK on the plan.
- Ask me (with AskUserQuestion) when the spec is unclear. Don't guess bank formats, category names or budgets.
- Write or update tests for any money, date, import or matching logic, and run them before saying a task is done. Show me the output.
- For UI work, take a screenshot at phone (390px) and laptop widths, check there are no console errors, and compare it with the matching file in `docs/design/` and any screenshot I paste. List the differences and fix them.
- No `alert()` or `confirm()` popups. Use in-page confirmations, such as tap twice to delete.
- Explain what you changed and why in plain English, UK English and £. I'm learning Claude Code with this project, so before a change say in a sentence or two what you're about to do and why.
- Tone in the app: calm, honest and encouraging. Show what's going well too; frame overspending as "here's what to adjust".

## Commands
- Dev server: `npm run dev`, then open http://localhost:5173 (needs `.env.local`, see `.env.example`)
- Unit tests (Vitest): `npm test`
- Build: `npm run build`
- Prove signed-out visitors see nothing: `npm run rls-check`
- Move data from old backups: `npm run migrate -- --dry-run` first, then `npm run migrate` (asks for my password)
- Apply the 16 agreed categories (`src/lib/categories.js`) to stored data: `npm run merge-categories` (asks for my password; safe to re-run)
- Save a payday plan from a private file: `npm run set-plan -- data/plan-YYYY-MM-DD.json`
- Migrations in `supabase/migrations/` are run in order in the Supabase SQL Editor; 0001 to 0006 have been run.
- The previous app lives in `legacy/`: `npm run legacy` (http://localhost:8080) and `npm run test:legacy`.
- Deploy: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on push to `main` (needs the two
  `VITE_` values as repository variables, and Pages source set to GitHub Actions).
- Never sign in to Supabase with my password on my behalf; scripts that need it are run by me in the terminal.
