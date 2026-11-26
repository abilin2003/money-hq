# Upgrade Phase 7: mobile UX and final refinement

Done 27 Nov 2026. Same dark theme and colours throughout.

## How it was checked
An audit script visited every screen (23 addresses, including drill-down panels and the cycle review) at phone
(375px) and laptop (1366px) widths and checked: sideways scrolling, tap targets under 40px, unlabelled form
fields and buttons, console errors, render time, chart text size and uneven card columns. Findings were fixed and
the audit re-run until clean, then this phase's changes were code-reviewed and the six findings fixed.

## Improvements
- **Charts:** phones draw charts on a narrower canvas with 13px text, and any chart squeezed into a smaller card
  has its text enlarged to stay readable (it was about 5px on a phone, 7px in half-width laptop cards). Labels that
  would then run off the edge are shrunk or nudged to fit; crowded labels are thinned; charts redraw when you rotate
  a phone (but never while you have unsaved typing on the page). Every chart bar and day works with Enter/Space.
- **Touch:** every tappable row is at least 44px tall on touch screens; the phone's detail sheet can be swiped
  down to close; Money day steps, breadcrumbs and "How this is worked out" got bigger targets.
- **Mobile transaction entry:** your six most-used categories are one tap; "Where" suggests your recent shops
  and fills in the category you used there last; the account you paid with is remembered; Save stays on screen.
- **Drill-down:** an opened panel takes keyboard focus (screen readers land in it).
- **States:** a branded loading screen; a page that fails shows a calm "couldn't be shown, nothing was changed"
  card with Try again, instead of a blank screen; Goals has a proper empty state.
- **Layout:** side-by-side cards are the same height (no gaps under short cards); tighter, consistent spacing on
  phones; the Trends "what changed" chart gets a full row.
- **Performance:** the history list is worked out once per change of your data rather than on every page; the
  inbox builds its category menus once instead of once per row. Pages render in about 5–110ms.

## Code review (this phase)
Six findings, all fixed: rotating a phone could clear a half-filled form; phone card padding overrode the compact
summary cards and period bar; enlarged chart labels could be clipped; charts in collapsed sections weren't fitted;
the swipe gesture also applied to the laptop drawer; an unused export.
