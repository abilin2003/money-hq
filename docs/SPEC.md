# Money HQ: product spec

Owner: Abilin. Last updated: 25 Nov 2026.

This is the source of truth for what Money HQ does and how it should behave. Build it in the phases in section 8, one phase per session. If something in the code disagrees with this spec, ask me before changing either.

---

## 1. What Money HQ is for

A private, dark-themed personal finance app I use on my laptop and my phone. It answers one question first: **how much can I safely spend today?** Then it helps me:

- import my bank statements and clean them up with as little effort as possible
- track spending against a few budget buckets per pay cycle
- handle friends paying me back without it looking like income
- plan each payday so every pound has a job
- review each cycle and my net worth on a monthly "money day"

It is not an accounting system or an investing tool. Keep it simple, fast and calm.

---

## 2. My money setup

### Accounts

Check this list with me in Phase 0. It may be out of date.

| Account | Type | What it's for | How data gets in |
| --- | --- | --- | --- |
| Ulster Bank current account | Current | Salary lands here. Subscriptions and direct debits. Buffer. | CSV import |
| Revolut main balance | Current | **All day-to-day spending.** Topped up once per payday from Ulster. | CSV or Excel import |
| Revolut Pockets | Savings-style | Money set aside inside Revolut. Moves to and from the main balance are transfers. | Inside the Revolut export |
| Capital One credit card | Credit card | Fuel and the phone bill (about £10 a month), sometimes other purchases. Paid off in full from Ulster. | CSV import |
| Monzo savings accounts (several) | Savings | Sinking funds (Christmas, gifts, holidays etc.). | **Typed in by hand** on money day |
| Trading 212 Cash ISA | Savings | Cash ISA | Typed in by hand |
| InvestEngine Stocks and Shares ISA | Investment | Long-term investing | Typed in by hand |
| Workplace pension | Pension | Net worth only | Typed in by hand |

### How money flows (the agreed setup)

1. Salary lands in Ulster around the 24th or 25th of the month. Some months it's early (December 2026: Fri 18 Dec).
2. On payday +1, standing orders move money to the Cash ISA, investments, and **one transfer to Revolut for the cycle's spending money**.
3. Bills and subscriptions come out of Ulster.
4. Everything else is paid with the Revolut card. Fuel is paid with the Capital One card.
5. Money HQ assigns each purchase to a bucket. There are no per-purchase top-ups between accounts any more.

Older data (before 25 Nov 2026) still has the old habit: pay on Ulster, then move the same amount from a Revolut pocket back to Ulster. The importer must treat those moves as transfers too.

---

## 3. Buckets and categories

Budgets are set per **bucket**. Each transaction gets a **category**, and each category belongs to one bucket.

| Bucket | Meaning | Budget per cycle now |
| --- | --- | --- |
| Essentials | Subscriptions and bills billed to Ulster | £100 (too low: last cycle was £266) |
| Groceries | Food shopping | £100 |
| Personal Upkeep | Things for me: haircuts, skincare and similar | £60 |
| Life Fund | Spending on my girlfriend, friends and family (gifts, treats, plans) | £75 |
| Fun | Eating out, takeaways, padel, golf, cricket, cinema, nights out | £140 |
| Fuel | Fuel on the Capital One card | No budget yet (last cycle £163) |

Rules:

- About 5–7 buckets, about 15 categories in total. In Phase 2, propose a merged category list from my current categories (for example Snacks & drinks, Energy drink, Bakery and Work food overlap; Sport & fitness, Gym membership and Gym supplements overlap) and **ask me** before renaming anything.
- Buckets and categories are editable in Settings. Renaming a category must keep its history.
- Savings and investment transfers are not spending. Show them as "Saved" and "Invested".

---

## 4. Core rules

These apply everywhere. Most of the current bugs come from breaking them.

1. **Money is stored as integer pence.** Never floats. Format only for display (£1,234.56). Inputs are parsed to pence.
2. **Time zone is Europe/London.** Dates are calendar dates, not timestamps, unless a time matters.
3. **A pay cycle** runs from the day salary lands to the day before the next salary lands. The next payday is predicted (usually the 24th or 25th) and I can edit it. Day N of M uses the real cycle length.
4. **Per-cycle is the default period.** Calendar month is an option, never mixed into a pay-cycle view. "Per month" figures are worked out by days (total ÷ days × 30.44), never by counting calendar months touched.
5. **Transfers between my own accounts are not spending or income.** That includes Revolut pocket moves, Ulster to Revolut top-ups, credit card payoffs, and moves to ISAs (shown as Saved or Invested instead).
6. **Income** means salary, freelance income and genuine refunds. Money from friends paying me back is **not** income: it clears an IOU or reduces the original purchase.
7. **Splits:** when I pay for a group, only my share counts as spending. The rest is an IOU with each friend's name.
8. **Safe to spend** = money left in buckets this cycle − bills still due before payday − any reserve I set. Show how it was worked out.
9. **Pace:** expected spend by today = budget × (days elapsed ÷ cycle length). A bucket is "on pace" when spent ≤ expected.
10. **Don't draw charts without enough data.** Any trend chart needs at least 3 complete cycles; otherwise show "Needs 3 pay cycles" and what it's waiting for.
11. **Never invent reassurance.** With no transactions yet this cycle, say "No spending yet this cycle", not "every budget is on track".

---

## 5. Data model

Every table has `id`, `user_id` (default `auth.uid()`), `created_at`, `updated_at`. Amounts are integer pence.

- **accounts**: name, type (current, savings, credit_card, isa, investment, pension, cash), institution, import_format (revolut, ulster, capital_one, manual), is_active.
- **transactions**: account_id, date, amount_pence (negative = money out), raw_description, merchant_id, category_id, note, status (`needs_review`, `reviewed`), kind (`spend`, `income`, `transfer`, `saved`, `invested`, `repayment`, `refund`), transfer_pair_id, import_batch_id, fingerprint (unique per user).
- **merchants**: name (clean, e.g. "Lidl"), patterns (raw description fragments), default_category_id.
- **buckets**: name, colour, sort_order, is_active.
- **categories**: name, bucket_id, is_active.
- **budgets**: cycle_id, bucket_id, amount_pence.
- **cycles**: start_date, end_date, predicted_next_payday, salary_transaction_id.
- **rules**: match (merchant, description contains, amount range, account), set (category, kind, merchant), priority, created_from (manual or learned).
- **people**: name.
- **splits**: transaction_id, person_id, amount_pence, settled_by_transaction_id.
- **recurring**: name, merchant_id, amount_pence, cadence, next_date, account_id (for the bills calendar).
- **sinking_funds**: name, target_pence, due_date, monthly_pence, account_id.
- **balance_snapshots**: account_id, date, balance_pence (manual entries for Monzo, ISAs, pension, card).
- **goals**: name, target_pence, target_date, linked account or sinking fund.
- **import_batches**: file_name, account_id, imported_at, row_count, new_count, duplicate_count.
- **settings**: reserve_pence, payday rules, typeface and theme choices.

---

## 6. Storage, login and security

- **Supabase** (free plan) holds all data. Supabase Auth with email login, one user: me.
- After my account exists, **turn off new sign-ups** in Supabase Auth so nobody else can register.
- **Row Level Security on every table**, with policies that only allow rows where `user_id = auth.uid()`. Add a test or script that proves a signed-out client can't read anything.
- The frontend uses only the Supabase **URL and publishable key**. These are safe in the browser *only because* RLS is on. **Never** put the secret (service role) key in the frontend, the repo or a log.
- Keep config in `.env.local` (gitignored), with a committed `.env.example` that has no real values.
- **No bank data in the repo, ever.** Gitignore `*.csv`, `*.xlsx` and `exports/`, except `tests/fixtures/`, which holds **fake** data only.
- The site stays a static site on GitHub Pages (public repo). That's fine: the code is public, the data isn't.
- Free Supabase projects pause after a week with no activity. Show a clear message if the database can't be reached, rather than an empty dashboard.
- Keep a **Backup** button in Settings that downloads all my data as JSON, and a matching restore.

---

## 7. Import pipeline

One import screen. I drop in one or more files; Money HQ does the rest and shows a summary (new, duplicates, needs review).

1. **Detect the format** from the header row, never from column position.
2. **Revolut**: header is `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`. Use **Started Date** (completed dates lag and bunch weekend spends onto Monday). Import only `COMPLETED` rows. Subtract `Fee`. The app also exports Excel, so accept `.xlsx` too.
3. **Ulster** and **Capital One**: I'll give you a sample header (with fake values) in Phase 2. Build the parsers from that; don't guess the columns.
4. **De-duplicate** with a fingerprint of account + date + amount + normalised description (+ a counter for genuine same-day duplicates). Importing the same file twice must add nothing.
5. **Transfers:**
    1. Rules first: descriptions that name my own accounts (Revolut top-ups, "To pocket", card payoffs, ISA providers) become transfers.
    2. Then pairing: same absolute amount, opposite signs, different accounts, within 3 days. Link the pair with `transfer_pair_id`.
    3. Old-habit pairs (pay on Ulster, matching Revolut pocket → Ulster move) are transfers too.
6. **Merchant clean-up**: turn raw descriptions into a clean merchant name using merchant patterns.
7. **Rules**: apply rules in priority order. When I categorise a merchant in the review inbox, offer "Always do this for <merchant>" to create a learned rule.
8. **Everything not confidently sorted goes to the review inbox** with status `needs_review`.
9. **Reconcile**: per account, I type the statement's closing balance and Money HQ shows any gap.

### Review inbox

A keyboard-friendly queue (laptop) and a thumb-friendly list (phone). Each row offers: approve, change category, split, mark as transfer, link to an IOU, add a note. Shortcuts on laptop. Inbox count shows on the Overview when it's above zero.

---

## 8. Phases

Build in this order. Each phase ends with its checks passing, a `/code-review`, and a commit.

### Phase 0: audit and plan (no code changes)
Read this spec and the repo. Report how the app works now (files, framework, where data is stored), what already exists from this spec, and which bugs in section 11 you can see. Propose the Phase 1 plan, including whether to restructure into a Vite project, and how to move my existing data into Supabase without losing anything. Ask me about anything unclear.

### Phase 1: foundations
- Project structure agreed in Phase 0, with a test runner (Vitest).
- Money helpers (pence parsing and formatting) and cycle helpers (cycle boundaries, day N of M, pace, per-month), with unit tests.
- Supabase schema as SQL migrations in `supabase/migrations/`, with RLS and policies.
- Login screen, sign out, session handling, "database unreachable" state.
- Design tokens and the app shell (sidebar on laptop, bottom tab bar on phone) from section 9.
- Move my existing data into Supabase, then check counts and totals match.
- **Done when:** tests pass; I can sign in on laptop and phone and see my existing transactions; a signed-out request returns no rows.

### Phase 2: import and clean data
- Importers for Revolut, Ulster and Capital One, with fake fixtures in `tests/fixtures/`.
- De-duplication, transfer rules and pairing, merchant clean-up, the rules engine and learned rules.
- Review inbox (laptop and phone).
- Merged category list, agreed with me.
- **Done when:** importing the same file twice adds nothing; an Ulster → Revolut payday transfer shows once, as a transfer, in neither spending nor income; every imported row is either sorted or in the inbox; tests cover each parser and the pairing logic.

### Phase 3: splits and IOUs
- Split a transaction into my share and friends' shares (equal or custom amounts).
- Money in from a person suggests matching open IOUs (same name, amount within £1, last 60 days). One tap to link.
- Unmatched money in asks: repayment, gift, refund or income?
- People view: balance per person, oldest first.
- **Done when:** a £40 dinner split with one friend shows £20 spent in Fun and £20 owed; their £20 repayment clears it and doesn't count as income.

### Phase 4: budget engine
- Buckets and categories in Settings.
- Payday plan: enter salary, assign it to bills, savings, investments, sinking funds and buckets until £0 is unassigned. Can copy last cycle's plan.
- Sinking funds with manual Monzo balances and "amount needed per cycle".
- Pace per bucket, safe to spend (rule 8) with its working shown.
- Recurring detection and a bills calendar for the next 14 days.
- Rollover or sweep of leftover bucket money on payday (I choose per bucket).
- **Done when:** the bugs in section 11 are fixed and covered by tests; safe to spend matches a hand calculation.

### Phase 5: Midnight screens
- Overview for laptop and phone, matching the reference designs in `docs/design/`.
- Quick add on phone (amount, type, where, bucket, paid with, split, note).
- Make it installable on my phone's home screen (web app manifest and icons). Quick add should be one tap from the home screen.
- "Needs attention" list: budgets far below last cycle, buckets with no budget, buckets over budget, stale balances, IOUs older than 30 days, inbox items.
- **Done when:** screenshots of laptop and phone match the references closely; everything works at 390px wide.

### Phase 6: review and wealth
- Cycle review page: what I spent, where I went over or under, three key numbers, one change for next cycle (I type it).
- Money day checklist: reconcile accounts, update manual balances, review IOUs, review the cycle.
- Net worth from balance snapshots, with "last updated" and a flag after 35 days.
- Goals with dates: amount needed per cycle and on track or not.

### Phase 7: trends and later
- Trends page using the charts in section 9 (only with 3+ cycles of data).
- Income by source (salary versus freelance).
- Balance forecast for Ulster up to payday.
- Later, not now: automatic bank feeds via open banking (a local script that saves a file to import; never a secret key in the browser).

---

## 9. Design system: Midnight

Dark only for now. Calm, precise, professional. One clear hero per screen. Reference markup in `docs/design/` (read it for exact structure and spacing).

### Colour tokens

| Token | Hex | Use |
| --- | --- | --- |
| bg | #0B1016 | Page background |
| sidebar | #0D131A | Sidebar and phone tab bar |
| surface | #121923 | Cards |
| surface-2 | #18212D | Chips, active nav, avatar, icon tiles |
| border | #1E2833 | Card borders, row dividers, bar tracks |
| border-strong | #2A3644 | Outline buttons, dashed "no budget" bars |
| text | #E8ECF2 | Main text |
| text-2 | #C3CAD4 | Secondary emphasis, chart labels |
| muted | #8E99A8 | Labels and secondary text |
| faint | #5F6B7A | Pence after the hero number, axis labels only (never body text) |
| accent | #8B9CFF | "You" and "today" on charts, links, focus rings, switches |
| primary-bg / primary-text | #F2F4F7 / #0B1016 | Primary buttons (white on dark) |
| warning | #F7B955 | Needs attention |
| over | #FF8A80 | Over budget |
| good | #5BD6A0 | Under budget |

Bucket colours (use the same colour everywhere for a bucket): Essentials #7AA2FF, Groceries #5BD6A0, Personal Upkeep #B79CFF, Life Fund #F7B955, Fun #F472B6, Fuel #4FC9E0.

### Type

- **Archivo** (Google Fonts, variable: `wdth 100..125`, `wght 400..700`) for everything.
- Headings, the brand name and big numbers use `font-stretch: 125%`. Body text uses 100%.
- Tabular figures everywhere: `font-feature-settings: 'tnum' 1`.
- Sizes: page title 24/600, card title 15/600, body 14, small 12–13, laptop hero number 64/600, phone hero 52/600. Pence after the hero are about 45% size in `faint`.

### Shape and spacing

- Cards: `surface`, 1px `border`, radius 16, padding 22–24. No shadows, no gradients.
- Gap between cards 16. Buttons and inputs radius 10–12, minimum height 40 (44 on phone). Chips are fully rounded.
- Bars: 6px tall (5 on phone), radius 3, track `border`, fill the bucket colour, pace tick 2px wide in `text`.

### Components

Sidebar nav (laptop), bottom tab bar with a central add button (phone), card, segmented control, chip, switch, bucket row (dot, name, description, bar with pace tick, spent, left, last cycle), stat list (label left, value right), needs-attention item (dot, title, one line, action link), bill row (date, name, amount), stacked bar with legend.

### Rules

- No emoji, no gradient washes, no drop shadows on cards, no ALL-CAPS labels, no "A · B · C" strings of fragments. Write plain sentences.
- Colour always means something. Red only for over budget.
- Motion only when something changes (a bar moving after I approve a transaction). Respect reduced motion.
- Accessible: real buttons, links and labelled inputs; visible focus; text contrast at least 4.5:1; touch targets at least 44px.

### Charts (Trends page and Overview)

| Question | Chart |
| --- | --- |
| Am I on pace? | Running total this cycle vs budget line vs last cycle's average pace (Overview hero) |
| Which categories cost most? | One ranked horizontal bar list with change since last cycle |
| What changed since last cycle? | Bridge (waterfall) from last cycle's total to this one, one step per bucket |
| Where did my pay go? | Sankey: salary into bills, saved, invested and buckets |
| When do I spend? | Calendar of the current cycle, darker on bigger days |
| Am I getting richer? | Net worth line and savings rate per cycle |

Label directly instead of using legends where possible. No donuts. Every chart opens the transactions behind it.

---

## 10. Screens

- **Overview (laptop):** title and cycle line; Add transaction and Import buttons; hero card with safe to spend, "£x a day", days left and the pace chart; cycle card with next payday, a 1-box-per-day strip and the safe-to-spend working; review inbox strip; buckets table; needs attention; upcoming bills; last cycle by bucket (stacked bar). See `docs/design/overview-laptop.dc.html`.
- **Overview (phone):** the same in one column, with the tab bar. See `docs/design/overview-phone.dc.html`.
- **Quick add (phone):** see `docs/design/quick-add-phone.dc.html`.
- **Transactions:** searchable, filterable list; edit any field; bulk recategorise.
- **Budgets:** buckets, categories, payday plan, sinking funds.
- **Trends**, **Goals**, **Wealth**, **Settings** (accounts, rules, import, backup, sign out).

---

## 11. Known bugs to fix

Seen in the current app (Nov 2026):

1. "/month" figures divide a cycle's total by the number of calendar months it touches (fuel £163 in one cycle showed as £82/month). Yearly totals are halved the same way.
2. Money is stored as floats: the Groceries budget saved as 100.01 and HQ showed £400.09 safe to spend.
3. HQ says "every budget is on track" on day 2 with nothing spent, and projects £0 by payday.
4. Some charts use calendar months while everything else uses pay cycles.
5. Notes appear as shop names ("Gift for newborn", "Dentist appointment" in Top shops).
6. The same category gives different counts on different tabs (takeaways: 12 on Behaviour, 10 on Breakdown).
7. Net worth appears twice on HQ; empty cards show instead of a setup prompt.
8. 12-month, 26-week and 90-day charts are drawn from about one cycle of data.

---

## 12. Open questions to ask me

- Which bucket should the phone bill on the Capital One card go in?
- The exact descriptions my salary and my own-account transfers use in each bank's export (I'll paste examples).
- Whether to keep any screens or features from the current app that this spec doesn't mention.
