# Redesign Phase 4: mobile navigation and end-of-cycle report polish

Done 27 Nov 2026.

## End-of-cycle reports (structure kept)
- **Report card** at the top of every report: total spending, against budget, against last cycle, saved and
  invested (with the share of income), the most important observation and the main improvement for next cycle
  (or the one you chose, once closed). Built from the report's own figures, so a saved report's card is fixed with it.
- **Section bar:** Report card · Summary · Spending · Budgets · Habits · Savings · Review · Next cycle. It stays at
  the top as you scroll (below the top bar on a phone), jumps straight to the section and moves keyboard focus there.
- "Most expensive days" names each day's biggest payment by what it was, not "Unknown merchant".
- **PDF:** the section bar is left out; the report card and each table row, tile and note stay in one piece across
  pages; headings stay with their content; bars, dots and section numbers print in colour; sections are separated
  by rules rather than dark boxes.

## Phone
- **Jump to a section** menu on long pages (Spending, Insights, Compare, Trends, Payday plan, Money day, Budgets,
  Wealth, Goals, Manage, Transactions) when they have five or more sections.
- **Section tabs** fade at an edge that has more tabs past it, so it's clear the row scrolls; the open tab is still
  brought into view.
- **Typing:** while a field has focus, the bottom tab bar steps aside so the keyboard can't push it over the field
  or the Save button; the Add page's Save bar then sits at the bottom of the screen.
- **Set-up folds away:** Manage's bucket cards and the editable bills list are collapsed on a phone (with a
  summary line) and open on larger screens. What's coming up on Bills stays visible.

## Needs checking on a real phone
The keyboard behaviour (iOS and Android differ) and the exported PDF's page breaks, which the in-app browser can't
print.
