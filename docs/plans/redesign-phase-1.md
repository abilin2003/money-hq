# Redesign Phase 1: collapsible sidebar and navigation

Done 26 Nov 2026.

## Laptop (1024px and wider)
- A 64px **icon rail** replaces the 232px sidebar: menu button, a compact **+** (Add transaction), the five
  sections and Settings. Each icon has a tooltip (on hover and keyboard focus) and an accessible name.
- The **menu button** opens the full menu (icons and names, Add transaction, Settings, your account and Sign out)
  as a 248px panel floating over the page, so content doesn't shift. Clicking outside it, pressing Escape or
  choosing a page closes it; Escape returns focus to the menu button, and opening it focuses the current section.
- **Pin** (in the open menu) keeps it open as a normal sidebar that takes its own space. The choice is remembered
  on this device (browser storage); the menu button folds a pinned sidebar back to the rail.
- The active section has a highlighted background and an accent bar; the page content can now be up to 1320px wide
  (was 1180), and with the rail it gets about 1290px on a 1440px screen.

## Smaller laptops and tablets (760–1023px)
No rail: a slim top bar (menu button, Money HQ, +, Settings) stays at the top, and the menu opens over the page.

## Phone (under 760px)
Unchanged: top bar and the five sections along the bottom. No sidebar or menu button.

## Navigation refinements
- Each section remembers the page you were last on (Analytics returns to Insights if that's where you were); the
  chosen period is kept across Analytics pages as before.
- With icons only in the rail, the section's name sits beside its tabs on laptops.
- Transitions are short and switched off when the device asks for reduced motion. Navigation is in-page (no reloads).

Files: `src/ui/shell.js`, `src/ui/dom.js` (menu, close and pin icons), `src/styles/app.css`.
