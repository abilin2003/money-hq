# Redesign Phase 3: precise labels, merchant analytics and small usability fixes

Done 27 Nov 2026. No stored data was changed.

## Labels you can trust
- **Spending allowance left** (planned, from budgets) replaces "Safe to spend" on the Overview. **Safe-to-spend
  cash** (the lower of the allowance and what your current accounts hold after bills) appears only once those
  balances are entered; until then it says so instead of assuming.
- Missing balances show as **Not entered / Not verified**, never £0.00 (Wealth tiles, Overview net worth).
- **Cash savings** and **investments** are named separately wherever they're combined.
- **Saving + investing rate** (share of income saved or invested) replaces "Savings rate" on Trends, reports and the
  reports archive.
- **Left after spending and saving** replaces "Net cash flow" / "Left over", with a note that it isn't the change
  in your bank balance (it's income − spending − saving and investing).
- **Projections need 4 days of data:** before day 4 of a cycle Budgets says "Too early" and gives no pace
  warnings; projections are labelled "(estimate)". The Overview already waits the same 4 days.
- Every planned / actual / verified / estimated tag explains itself on hover.

## Merchants
A bank statement's description names the shop; a description you typed ("Gift for newborn", "Work breakfast")
doesn't. Shop rankings (Spending, Compare, reports, insights) now:
- use bank lines as they are;
- count a typed line as a shop only when it matches a shop seen in your bank lines (e.g. "Spotify");
- group the rest as **Unknown merchant** (tap it to see every description);
- name shops the way your bank spells them ("Lidl Ni Ltd", not "Lidl groceries").
Descriptions are kept and shown unchanged; no records were rewritten. Unknown merchants are left out of the
"frequent shop" and "first payment there" insights. Tested in `tests/unit/explore.test.js`.

## Small fixes
Figures use tabular digits everywhere so amounts line up; clickable rows show a pointer, a soft highlight and the
standard focus ring; Wealth with no balances shows one short note instead of three empty charts.
