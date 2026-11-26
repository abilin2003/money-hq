# Upgrade Phase 3: interactive spending analytics

Done 27 Nov 2026.

## Pick any period
One selector, shared by Spending, Compare, Transactions and Trends, and kept in the page address (so Back,
refresh and links keep it): the current cycle, any finished cycle, the last 3 / 6 / 12 finished cycles, any
calendar month, or your own dates. ‹ and › step to the previous or next cycle, month or date range.

## Analytics → Spending
Everything below follows the period:
- Summary: total spent, from your pay, from savings, money in, saved and invested, left over.
- Spending by category (bucket → category → shop → payment), with the change against the period before.
- Budget vs actual (pay-cycle periods; budgets of several cycles are added together).
- Spending by shop or payee.
- Biggest changes by category against the period before.
- Spending by pay cycle and by calendar month (tap a bar to open that period).
- Daily and weekly spending, a spending heatmap, and day-of-the-week patterns.
- How often you spend: payments, no-spend days, typical and average payment.
- Recurring vs one-off, essential vs discretionary (choose the essential buckets on Budgets), small purchases
  (under £5 / £10 / £20) and where they go.
- Money in, saved, invested and spent, with money in by source.

## Drill down anywhere
Every row, bar, day and tile opens a detail panel (a drawer on a laptop, a bottom sheet on a phone) with the
next level of breakdown and every line behind the number. Tapping a line opens the transaction with its editor.
Breadcrumbs, Back and Escape step back out; the period and filters are kept throughout.

## Analytics → Compare
Any two cycles or months: totals, a bridge chart by bucket, and tables by category and by shop with the change.
Tap a row to see the payments on each side that make up the difference, then any payment to inspect or edit it.

## Everything reconciles
All analytics are built from one list of spending lines (`src/lib/explore.js`) using the same rules as the rest
of the app. Tests prove every breakdown adds back up to the total, the totals match the Overview's, filters pick
exactly the lines behind a number, and compare rows add up to the whole difference.
