# Known issues

To work through in later phases. Each fix comes with an automated test (see TESTING.md). Issues a test already
exposes are marked with the test's name.

## Critical / financial

1. **A recent purchase marked as reimbursable by a family member is missing.** Investigated in Phase 2A
   (read-only): the purchase and its IOU are not in the database. Supabase's request log (24 hours, covering
   the whole time the "paying me back" option has been live) shows **no save request of any kind** for it: the
   only call to `add_purchase_with_ious` was a deliberate failure test run by Claude before the feature went
   live, and the only other saves were three ordinary transactions that did save. So the save never left the
   browser: it was stopped by one of the form's checks. Which one can't be told from the logs. At the time, the
   form's error message was squeezed between the two Save buttons in small text (on a phone, in the bar fixed to
   the bottom of the screen), so it was easy to miss. **Fixed in Phase 2A:** messages now appear once, full width
   above the buttons and on screen, and the field at fault is outlined (browser test *"a refused save shows one
   clear message…"*). The database function itself still needs proving on a real database: see "Real test
   database" in TESTING.md (`npm run test:db`). The missing purchase will be re-entered with your approval.
2. **Fixed in Phase 2A: words in "Amount they owe" were taken as the whole amount.** Cause:
   `src/views/add-for.js` treated unreadable text as "no amount given", and no amount meant the whole amount.
   Now the field starts as the full amount in numbers, follows the purchase amount until you type your own
   figure, and anything that isn't an amount (or is empty, £0, negative or more than the purchase) is refused
   with a message naming the field. Regression test: *"words typed as the amount owed are refused, nothing is
   saved, and what you typed stays"*.
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

- **Fixed in Phase 2A: an expected-by date that isn't a date** wasn't checked before saving (the database
  refused it). Now checked first. Unit test: *"an invalid expected-by date is caught before saving"*.
