# Redesign Phase 5: final visual consistency and usability audit

Done 27 Nov 2026.

## Measured, then made consistent
An inventory of the real computed styles on all 21 pages (headings, buttons, fields, cards) showed drift between
pages that were built at different times. Now:
- one button height on laptops (40px; 44px for touch on phones, compact 40px header buttons);
- section headings 16px everywhere (the report card's title is the one larger heading);
- page titles 26px (the Overview's cycle title stays larger as the home page);
- every card header's "see more" link is the same accent link as on the Overview, without losing its 44px tap
  target on phones;
- paired cards in two-column rows are the same height, so short cards no longer leave gaps;
- "Unspent income" replaces the two-line "Left after spending and saving" (explanation kept underneath).

## Clutter removed
32 style classes left over from replaced components (the old Overview cards and columns, the old hero chart and
bucket table, the old phone menu) were removed; nothing on any page used them. A check confirms no unused classes
remain.

## Code review (Redesign Phases 2–5)
Eight findings, all fixed: phone set-up cards collapsing after every edit (they now remember being open); the
report's section bar hidden under the tablet top bar; phone header links losing their tap target; the Overview
capping "Needs attention" at five; the 4-day projection rule written twice; two insights of the same kind on the
Overview; and tests added for the last-cycle alignment and the report's expensive-day naming.

## Checked
All pages at 1440px, 900px and 375px: no sideways scrolling, no console errors, no "undefined"/"NaN" in the page.
215 tests pass; production build passes.

## Left for you (as asked)
Reviewing the inbox, entering balances, goals and pots. The pages around them say what's missing without nagging.
