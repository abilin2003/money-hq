# Redesign Phase 2: the Overview

Done 26 Nov 2026. Same calculations as before (state.js, summary.js); presentation only, plus a fairer last-cycle comparison.

## Hierarchy
1. **Header:** the cycle as the title ("December cycle"), with day x of y and payday above it, and the actions. No
   "Overview" heading repeating the menu (it's kept for screen readers and the browser tab).
2. **Financial position:** one band instead of four identical cards. Safe to spend (planned, with the cash check)
   or, for a finished cycle, how it went, is the large figure. Beside it, divided by hairlines:
   - Spent vs budget, with pace marker and the difference from the same point last cycle.
   - Saved and invested, against the payday plan.
   - Net worth, or "Not verified" until balances are entered (no nagging).
3. **Spending performance:** the chart sits on the page (no box), wider and taller, with a legend, weekly date
   marks, last cycle's real running total (lined up by how far through the cycle you are, since cycles differ in
   length), a dashed projection to payday once there are 4+ days to go on, and a tooltip that follows the pointer.
   Below it: against the budget line, projected at payday ("too early to say" before day 4), last cycle at this
   point. Beside it: a payday countdown, a cycle progress track and the next 14 days of bills.
4. **Financial control:** buckets, recent transactions and what needs attention as three columns of one panel.
   Each bucket opens its spending; alerts are one line each with a link. Lines waiting in the review inbox are
   listed last and quietly.
5. **Insights:** the two most useful, as two columns of text with a coloured rule (not two more cards), each linking
   to its payments.

## Reduced
The separate "Alerts" and "Insight" cards, the 24-block day bar, repeated "point at the chart" captions and the
large notice card (now a slim banner).

## Phone
Its own order: header, position (main figure, then the three figures as a list), anything urgent, chart, payday,
buckets, recent transactions, insights. Header buttons sit side by side.
