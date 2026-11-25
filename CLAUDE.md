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
Current app, before Phase 1 (update these once the new structure is in place):
- Unit tests: `node --test`
- Browser tests (phone and desktop): `npx playwright test`
- Local preview: `node scripts/serve.js 8080`, then open http://localhost:8080
