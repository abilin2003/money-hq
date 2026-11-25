# Money HQ: how to build it with Claude Code

These are starting prompts, one per phase. Rewrite them in your own words if you like. The parts that matter are the references to `docs/SPEC.md` and the "done when" checks.

---

## Before you start (once)

1. **Back up your current data.** In Money HQ, Settings, Security & backups, export everything. Keep the file **outside** the repo folder.
2. **Add the pack to your repo:**
    - `CLAUDE.md` in the repo root. If one already exists, ask Claude Code to merge the two.
    - `docs/SPEC.md`, `docs/PROMPTS.md` and the `docs/design/` folder.
3. **Create a free Supabase project** at supabase.com. You'll need the Project URL and the **publishable** key later. Never copy the secret key anywhere.
4. In Supabase, **create your own login** (email and password) under Authentication. Then **turn off new sign-ups** so nobody else can register.
5. Take **screenshots** of the three Midnight screens on the design canvas. You'll paste them into Claude Code in Phase 1 and Phase 5.
6. Commit the pack: `git add CLAUDE.md docs && git commit -m "Add Money HQ spec"`.

---

## How to run every phase

1. Open Claude Code in the repo folder.
2. Start clean: run `/clear` (or open a new session) before each phase.
3. Turn on **plan mode**: press `Shift+Tab` until the status bar shows plan mode on. Claude reads and plans without changing files.
4. Paste the phase prompt. Read the plan. Press `Ctrl+G` to edit it in your editor if something's off, then approve.
5. Let it build. If it goes off track, press `Esc` to stop it and redirect. `Esc` twice (or `/rewind`) rolls back.
6. Check the "done when" list yourself, run `/code-review`, then ask it to commit.

If you've corrected it twice on the same thing, `/clear` and start again with a sharper prompt. A fresh session usually beats a long, messy one.

---

## Phase 0: audit and plan (no changes)

Plan mode on.

```
Read @CLAUDE.md and @docs/SPEC.md. Don't change any files.

Explore this repo and tell me, in plain English:
1. How the app works now: files, framework, how it's built and deployed, and where my data is stored.
2. Which features from the spec already exist, and which bugs from section 11 you can find in the code (file and line).
3. Whether any real financial data is committed in the repo or its git history. The repo is public, so this matters.

Then propose a plan for Phase 1 only: the target project structure (and whether to move to a Vite project), the Supabase schema, how login will work, and how we'll move my existing data into Supabase without losing anything.

Use AskUserQuestion for decisions that are mine, including the open questions in section 12 and checking the accounts list in section 2.
When I approve, save the plan to docs/plans/phase-1.md.
```

---

## Phase 1: foundations

`/clear`, plan mode on.

```
Phase 1 (foundations) from @docs/SPEC.md section 8, following @docs/plans/phase-1.md.

Show me the steps first. After I approve:
- Set up the agreed project structure and Vitest.
- Write the money and cycle helpers test-first. Cover: parsing "100.01", "£1,234.5" and "-12" to pence; cycle boundaries across month ends; day N of M; per-month worked out by days; pace.
- Write the Supabase migrations with RLS on every table, plus a script that proves a signed-out client gets no rows.
- Build login, sign out and a clear "can't reach the database" state.
- Set up the Midnight design tokens and the app shell (sidebar on laptop, bottom tab bar under 760px) from @docs/design/overview-laptop.dc.html and @docs/design/overview-phone.dc.html. I'll paste screenshots too.
- Move my existing data into Supabase. Show me counts and totals before and after.

Tell me exactly what to put in .env.local and where to find each value in Supabase.
Run the tests and show me the output before saying you're done.
```

---

## Phase 2: import and clean data

`/clear`, plan mode on.

```
Phase 2 (import and clean data) from @docs/SPEC.md sections 7 and 8. Save the approved plan to docs/plans/phase-2.md.

Header rows from my exports, with fake values:
Ulster: [paste the header row and 2 made-up rows]
Capital One: [paste the header row and 2 made-up rows]
How my salary and own-account transfers appear: [paste example descriptions; remove account numbers]

Build the importers, de-duplication, transfer rules and pairing, merchant clean-up, rules and learned rules, and the review inbox.
Put fake fixtures in tests/fixtures and test each parser and the pairing logic, including the old habit (pay on Ulster, then a matching Revolut pocket to Ulster move).
Before renaming categories, propose a merged list of about 15 and ask me.

Done when the Phase 2 checks in section 8 pass. Show me the test output, then import one of my real files locally and show the summary (new, duplicates, needs review).
```

---

## Phase 3: splits and IOUs

`/clear`, plan mode on.

```
Phase 3 (splits and IOUs) from @docs/SPEC.md section 8, with rules 6 and 7 from section 4. Save the approved plan to docs/plans/phase-3.md.

Write tests for the example in the "done when" check, plus: a three-way split, a partial repayment, and a repayment that matches two open IOUs.
Show me the test output, then walk me through splitting a real transaction in the app.
```

---

## Phase 4: budget engine

`/clear`, plan mode on.

```
Phase 4 (budget engine) from @docs/SPEC.md section 8, with rules 3, 4, 8, 9 and 11 from section 4. Save the approved plan to docs/plans/phase-4.md.

Fix every bug in section 11 that this phase touches, with a test for each one that fails before the fix and passes after.
Work out safe to spend for my current cycle by hand in your reply, then show that the app gives the same number.
```

---

## Phase 5: Midnight screens

`/clear`, plan mode on. Paste your screenshots of the three designs.

```
Phase 5 (Midnight screens) from @docs/SPEC.md sections 8, 9 and 10. The references are @docs/design/overview-laptop.dc.html, @docs/design/overview-phone.dc.html and @docs/design/quick-add-phone.dc.html, plus the screenshots I've pasted. Save the approved plan to docs/plans/phase-5.md.

Build the Overview for laptop and phone, quick add, the "needs attention" list, and make it installable on my phone's home screen.
Use my real data, not the numbers in the mockups.
Take screenshots at 1440px and 390px wide, compare them with the references, list the differences and fix them. If you can't take screenshots, tell me and I'll send you some.
```

---

## Phase 6: review and wealth

`/clear`, plan mode on.

```
Phase 6 (review and wealth) from @docs/SPEC.md section 8. Save the approved plan to docs/plans/phase-6.md.
Build the cycle review page, the money day checklist, net worth with stale-balance flags, and goals with dates.
Show me a cycle review for my November cycle using my real data.
```

---

## Phase 7: trends and later

`/clear`, plan mode on.

```
Phase 7 from @docs/SPEC.md section 8, using the chart list in section 9. Save the approved plan to docs/plans/phase-7.md.
Every chart must follow rule 10 in section 4 (needs 3 cycles of data). Show me screenshots of each chart, or of its "needs more data" state.
```

---

## Useful things to know

- `@file` puts a file in front of Claude. Pasting a screenshot works too.
- `/context` shows what's loaded, including CLAUDE.md.
- `/rewind` (or `Esc` twice) restores earlier code and conversation. It doesn't replace git, so commit after each phase.
- When Claude keeps ignoring a rule in CLAUDE.md, the file is probably too long. Keep it short.
- Claude Code's own guide to these habits: https://code.claude.com/docs/en/best-practices
