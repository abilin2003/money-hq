# Upgrade Phase 1: audit, financial accuracy and foundations

Done 26 Nov 2026. Real figures are in the private audit report in `data/` (never committed).

## Audited
- **Database (read-only queries):** every account/kind/status group matches the migration totals to the penny;
  no orphaned rows, no duplicate fingerprints; RLS on all 17 tables, 68 own-row policies, no anon grants,
  38 foreign keys. `npm run rls-check` still passes.
- **Code:** pay-cycle boundaries, categorisation, integer pence, totals on every page, card purchases vs
  repayments, transfers, savings and investing, IOUs and paybacks, budgets, safe to spend, balances.

## Fixed
1. **Planned vs actual vs verified** are now labelled everywhere they appear (Overview, Payday plan, Wealth).
   Safe to spend is *planned* (from budgets); a separate **cash check** compares it with the money in your
   current accounts once balances are typed in, and never assumes one (`src/lib/position.js`).
2. **Over-assigned payday plans** are explained, not hidden: the gap is shown as "not explained yet" until you
   record where the extra came from (a funding line), then it reconciles to £0.
3. **Sinking funds** show verified balance, this payday's planned contribution and the expected total separately.
4. **Credit card:** purchases count once, when made; repayments are transfers (and are now recognised on import
   even without an old rule). The amount to repay is shown as an estimate until the card balance is typed in.
5. **Consistency:** the finished-cycle headline and the bucket table now compare the same thing (budgeted
   buckets), the pace chart compares budgeted-bucket spending with the budget line, and a test proves the daily
   chart, Overview, History and Trends all give the same totals.
6. **Pay cycles:** cycles before the first payday you entered now start on your real salary dates, not an
   estimated 24th. Partial cycles at the start of your records are labelled and left out of Trends.
7. Goal projections with growth stay in whole pence.

## Needs your approval (not done)
See the private audit report for the proposed data changes and their effect.

## Applied after review
- Investing is counted **after withdrawals**: money taken out of an ISA counts against what was invested
  (imported ISA withdrawals are classified the same way), so savings-rate figures are realistic.
- **Monzo is savings**: own-account transfers on the Monzo statement count as Saved (money in) or taken out of
  savings (money out), net. Moves between Monzo pots and the other side of each transfer stay transfers.
- **Total spent includes big buys paid from savings.** Every period shows the total, split into "spent from your
  pay" (what budgets compare) and "paid from savings (your share)", with those buys listed by date. A payback
  linked to a savings-paid buy comes off that buy, not your everyday spending.

## Next (Phase 2 candidates)
- When money arrives from a person, the inbox asks what it was for and offers recent purchases to link it to.
