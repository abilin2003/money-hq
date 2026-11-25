# Phase 4 plan: budget engine

Agreed with Abilin on 25 Nov 2026. The real amounts live in a private file (`data/plan-YYYY-MM-DD.json`, never
committed) and are saved with `npm run set-plan`. This repo is public, so no real figures appear here.

## Decisions
- Each payday has a plan: pay, payday lines (transfers such as the card repayment, investing, sinking funds,
  one-off payments, money left in Ulster) and bucket budgets. The plan page shows honestly when more is assigned
  than came in.
- Budgets change every payday; a new payday starts as a copy of the last plan.
- Leftover bucket money on payday: sweep (each cycle starts at its budget), changeable per bucket.
- The small Ulster buffer is not a bucket and not part of safe to spend. Reserve defaults to £0.
- Fuel (Capital One) is tracked with no budget; safe to spend ignores it.
- Bills come out of Essentials; bills still due before payday are held back from safe to spend.

## Built
- Safe to spend = money left in buckets − bills still due before payday − reserve, with the working shown.
- Pace per bucket; bills calendar for the next 14 days; recurring detection (about once a month, 3+ months).
- Payday plan page, Budgets page (leftovers, reserve, categories, bills), sinking funds with balances.
- Tests: `tests/unit/budget.test.js`.
