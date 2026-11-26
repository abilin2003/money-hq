// The app shell.
// Laptop (1024px and wider): a slim 64px icon rail with a menu button. The menu button opens the full menu as a
//   panel floating over the page (it doesn't push the content sideways); clicking outside it, pressing Escape or
//   choosing a page closes it. It can be pinned open as a normal sidebar; that choice is remembered.
// Smaller laptops and tablets (760–1023px): no rail; a slim top bar with a menu button that opens the same panel.
// Phone (under 760px): the same top bar without the menu button, and the five sections along the bottom (unchanged).
// A section with more than one page gets a row of tabs above the page. Each section remembers the page you were
// last on, so going back to Analytics or Planning returns you to where you were.
import { h, icon, logo } from './dom.js';
import { SECTIONS, sectionOf, pageLabel, isPage } from './sections.js';

export { SECTIONS, sectionOf, pageLabel };

const PREF = 'mhq.sidebar'; // 'pinned' or 'rail'
const readPref = () => { try { return localStorage.getItem(PREF) === 'pinned'; } catch { return false; } };
const savePref = (pinned) => { try { localStorage.setItem(PREF, pinned ? 'pinned' : 'rail'); } catch { /* private mode: not remembered */ } };
const lastPage = {}; // section id -> the page you were last on in it

let current = null; // the shell on screen now, for the Escape key
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current?.isOpen()) { e.stopImmediatePropagation(); current.setOpen(false, true); } }, true);
}

export function shell({ route, email, onSignOut, inboxCount = 0 }) {
  const sec = sectionOf(route);
  if (sec) lastPage[sec.id] = route;
  const pinned = readPref();
  const initial = (email || '?').trim()[0].toUpperCase();
  const badge = (cls) => (inboxCount ? h('span', { class: cls, 'aria-label': `${inboxCount} to review` }, String(inboxCount)) : null);
  const hrefOf = (s) => `#${lastPage[s.id] && s.id !== sec?.id ? lastPage[s.id] : s.pages[0][0]}`;

  // ---- laptop: rail / expanded menu
  let root;
  const isOpen = () => root.classList.contains('nav-open');
  const toggleBtn = h('button', { class: 'navtoggle', type: 'button', 'aria-label': 'Open the menu', 'aria-expanded': 'false', 'aria-controls': 'side-panel', 'data-tip': 'Menu',
    // Pinned open on a laptop, the menu button folds it back to the rail; otherwise it opens or closes the panel.
    onclick: () => { if (root.classList.contains('nav-pinned') && matchMedia('(min-width: 1024px)').matches) pinBtn.click(); else setOpen(!isOpen(), true); } }, icon('menu', 20));
  const fab = h('button', { class: 'navfab', type: 'button', 'aria-label': 'Open the menu', 'aria-expanded': 'false', 'aria-controls': 'side-panel', onclick: () => setOpen(true, true) }, icon('menu', 20));
  const close = () => setOpen(false);
  const navLink = (s) => h('a', { href: hrefOf(s), class: 'navlink', 'aria-current': sec?.id === s.id ? 'page' : null, 'data-tip': s.label, onclick: close },
    icon(s.icon, 20), h('span', { class: 'lbl' }, s.label), s.id === 'activity' ? badge('badge') : null);
  const pinBtn = h('button', { class: 'navpin', type: 'button', 'aria-pressed': String(pinned), 'aria-label': pinned ? 'Unpin the menu' : 'Keep the menu open', title: pinned ? 'Unpin the menu' : 'Keep the menu open',
    onclick: () => {
      const now = !root.classList.contains('nav-pinned');
      savePref(now);
      setOpen(false);
      dispatchEvent(new HashChangeEvent('hashchange')); // redraw at the new width (charts size themselves to it)
    } }, icon('pin', 16));

  const panel = h('div', { class: 'side-panel', id: 'side-panel' },
    h('div', { class: 'side-top' }, toggleBtn, h('span', { class: 'brand lbl' }, logo(), h('span', { class: 'display' }, 'Money HQ')), pinBtn),
    h('a', { href: '#add', class: 'side-add', 'aria-current': route === 'add' ? 'page' : null, 'data-tip': 'Add transaction', onclick: close }, icon('add', 18, 'currentColor', 2.2), h('span', { class: 'lbl' }, 'Add transaction')),
    h('nav', { class: 'nav', 'aria-label': 'Main' }, SECTIONS.map(navLink)),
    h('div', { class: 'side-foot' },
      h('a', { href: '#settings', class: 'navlink', 'aria-current': route === 'settings' ? 'page' : null, 'data-tip': 'Settings', onclick: close }, icon('settings', 20), h('span', { class: 'lbl' }, 'Settings')),
      h('div', { class: 'me lbl' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, initial),
        h('span', { class: 'who', title: email }, email),
        h('button', { class: 'linkbtn', type: 'button', onclick: onSignOut }, 'Sign out'))));
  const scrim = h('div', { class: 'side-scrim', 'aria-hidden': 'true', onclick: close });
  const sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Navigation' }, panel);

  function setOpen(open, focus = false) {
    root.classList.toggle('nav-open', open);
    for (const b of [toggleBtn, fab]) { b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu'); }
    toggleBtn.replaceChildren(icon(open ? 'close' : 'menu', 20));
    if (focus) (open ? (panel.querySelector('.navlink[aria-current="page"]') || panel.querySelector('.navlink')) : (getComputedStyle(fab).display !== 'none' ? fab : toggleBtn))?.focus({ preventScroll: true });
  }

  // ---- phone: top bar and bottom tabs (unchanged)
  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, fab, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('div', { class: 'topbar-act' },
      h('a', { href: '#add', class: 'topadd', 'aria-label': 'Add a transaction', 'aria-current': route === 'add' ? 'page' : null }, icon('add', 20, '#0B1016', 2.2)),
      h('a', { href: '#settings', class: 'iconlink', 'aria-label': 'Settings', 'aria-current': route === 'settings' ? 'page' : null }, icon('settings', 22))));
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, SECTIONS.map((s) => h('a', { href: hrefOf(s), 'aria-current': sec?.id === s.id ? 'page' : null, class: 'tablink' },
    icon(s.icon, 22), s.label, s.id === 'activity' ? badge('tabbadge') : null)));

  // ---- the section's tabs, with the section's name (the rail shows icons only)
  const subnav = sec && sec.pages.length > 1 ? h('nav', { class: 'subnav', 'aria-label': `${sec.label} pages` },
    h('span', { class: 'subnav-sec', 'aria-hidden': 'true' }, sec.label),
    sec.pages.map((pg) => h('a', { href: `#${pg[0]}`, 'aria-current': isPage(pg, route) ? 'page' : null }, pg[1], pg[0] === 'inbox' ? badge('badge') : null))) : null;

  const main = h('main', { class: 'main', id: 'content', tabindex: '-1' }, subnav);
  root = h('div', { class: `shell${pinned ? ' nav-pinned' : ''}` }, h('a', { class: 'skip', href: '#content' }, 'Skip to content'), sidebar, scrim, topbar, main, tabbar);
  current = { isOpen, setOpen };
  return { root, main };
}
