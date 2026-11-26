# Upgrade Phase 6: end-of-cycle financial review

Done 27 Nov 2026.

## When it appears
- On a cycle's last day (the day before payday) the Overview shows **Review & Close Pay Cycle**.
- It stays there after payday until you close the cycle (the finished cycle's Overview has the same button).
- Nothing closes, and no transaction moves, until you tick "ready to close" and press Close.

## The report (`#review/<cycle start>`)
1. **Financial summary:** income, spending, saved, invested, net cash flow, savings rate, spending vs budget,
   against the cycle before (chart), and where the income went.
2. **Spending breakdown:** by bucket and category (tap through to Analytics), shops, biggest purchases, number
   of payments, average and typical payment, no-spend days, essential vs discretionary, recurring vs one-off.
3. **Budget performance:** each bucket's budget, spend and result, unused allocations, the pace chart and the
   day the budget ran out, and why each overspend happened (top categories against the cycle before, big
   single payments).
4. **Spending habits:** small payments, most frequent shops, takeaway and convenience, most expensive days,
   unusual purchases, and changes from the cycle before (split into more/fewer and bigger/smaller payments).
5. **Savings and wealth:** saved, invested, sinking-fund lines from the plan with their state, goal progress,
   and the net worth change when balances were typed in at both ends.
6. **Your review:** what went well, what could have been better, what cost the most and what changed, every
   sentence built from the figures; plus whether last cycle's chosen improvements happened.
7. **Plan the next cycle:** a reflection, measurable improvements to choose (checked in the next review),
   suggested budget changes (none suggested to raise a budget you've already cut), and a link that opens the
   next payday plan with the changes you picked. Then confirm and close.

## Closing
Saves the report (figures, budgets, final spending, narrative and your notes) on the cycle's row (migration
0008 adds one `report` column; additive only), and marks the cycle closed. Transactions are untouched, and the
cycle can be reopened (the saved report is kept). If lines for a closed cycle change later, the report says it may
need refreshing; a refresh is saved alongside the original, which is kept for comparison.

## Analytics → Reports
Every finished cycle with its status, trends across saved reports, compare two reports side by side (with a link
to compare their transactions), and your past reflections and improvements with whether they happened. Export
PDF on a report uses the browser's print (choose "Save as PDF"), on a light page with only the report.
