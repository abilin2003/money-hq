# Upgrade Phase 4: intelligent spending insights

Done 27 Nov 2026. Also: a Miscellaneous category added to the Fun bucket (data change, asked for).

## Analytics → Insights
Follows the period selector. Each insight explains behaviour (how many payments, how big, against your usual),
says how it was worked out, and has a "See the payments" button that opens exactly the lines behind its figure.
The Overview shows the most important one for the cycle; Trends shows the top three across its cycles.

| Insight | When it appears |
|---|---|
| Frequent small purchases | 8+ payments under the small limit (£10 by default): count, how often, average, top category and shop, vs usual |
| Habits rising over time | a category above £0 that rose in each of the last three periods and is 20% and £15+ above its average |
| Unusual transactions | £30+ and 2.5× your typical payment at that shop, or £50+ somewhere new that's also 2.5× typical for its category |
| Expensive weekends | weekend days cost 1.5× a weekday or more |
| Frequently visited shops | 5+ payments to one shop or payee |
| Takeaway and convenience | takeaway, eating out, snacks, energy drinks and coffee together, 20% / £15 away from usual |
| One-off events | spending 15% / £50+ above usual, at least half explained by one-off payments of £75+ |
| Recurring expenses | bills on your list plus payments seen about monthly for 3+ months |
| Over budget again and again | a bucket over budget in 2+ of the last 3 cycles |
| Frequency vs purchase size | the category that moved most, split exactly into "more/fewer payments" and "bigger/smaller payments" |
| Savings opportunities | discretionary categories £10+ above their usual: what you'd have kept at your usual |

## Rules
- Only your own transactions and plain arithmetic (counts, totals, averages, medians). "Usual" is the average of
  up to three earlier periods of the same kind, scaled to the same number of days.
- Nothing appears without the data to back it (no comparisons without earlier periods; nothing for an empty period).
- Savings figures say what the numbers would have been, never advice. Essential spending gets no "you'd have kept".
- Tested: every insight's figure equals what its linked payments add up to; the frequency/size split adds up
  exactly to the change.
