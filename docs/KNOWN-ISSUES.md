# Known issues

To work through in later phases. Each fix comes with an automated test (see TESTING.md). Issues a test already
exposes are marked with the test's name.

## Critical / financial

1. **A recent purchase marked as reimbursable by a family member is missing.** Checked read-only: the purchase
   and its IOU are not in the database, so it was never saved. Whether it was rejected
   (and the error missed) or entered before "Who is this purchase for?" was live is not yet known. Note: the
   successful path of the database function `add_purchase_with_ious` has not yet been run against a real
   Postgres database (only its all-or-nothing failure was checked); the fake database copies its rules but
   can't prove the SQL. Investigate with a test Supabase project.
2. **Words in "Amount they owe" are taken as the whole amount.** Typing text into the reimbursement amount
   (which shows "The whole amount" in grey) saves the purchase with the full amount owed, with no error.
   Cause: `src/views/add-for.js` turns unreadable text into "no amount given", and no amount means the whole
   amount. Exposed by the browser test *"words typed as the amount owed are refused…"* (marked expected to fail).
3. **Capital One balance history in Wealth shows £0** although other sections show the right balance.
4. **Keep live balances and figures consistent** across every page.

## Transaction management

5. A central Transaction Hub to view, search, filter and edit transactions.
6. Reliable editing and saving of existing transactions.
7. **A recent credit-card fuel purchase has the wrong date** (one day late). Confirm the exact transaction
   before correcting; needs your approval.

## Usability

8. Collapse/expand the account balances on the Overview.
9. Clear back navigation throughout the app.
10. Settings → Manage categories: create, rename and archive.
11. Remove the Workplace Pension as a payment account for spending (keep it in wealth tracking).
12. Keep the phone and laptop experiences equally easy.

## Found while building the tests

- **An expected-by date that isn't a date** isn't checked before saving: the database refuses it (nothing is
  saved), and the date picker normally prevents it. Unit test *"KNOWN DIFFERENCE: an invalid expected-by date
  is caught before saving"* (marked expected to fail).
