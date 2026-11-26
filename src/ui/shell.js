// The app shell. Laptop: a sidebar with the five sections, Add and Settings. Phone (under 760px): a top bar with
// Add and Settings, and a bottom tab bar with the five sections. A section with more than one page gets a row of
// tabs above the page, on both.
import { h, icon, logo } from './dom.js';
import { SECTIONS, sectionOf, pageLabel } from './sections.js';

export { SECTIONS, sectionOf, pageLabel };

export function shell({ route, email, onSignOut, inboxCount = 0 }) {
  const sec = sectionOf(route);
  const initial = (email || '?').trim()[0].toUpperCase();
  const badge = (cls) => (inboxCount ? h('span', { class: cls, 'aria-label': `${inboxCount} to review` }, String(inboxCount)) : null);
  const sectionLink = (s, phone) => h('a', { href: `#${s.pages[0][0]}`, 'aria-current': sec?.id === s.id ? 'page' : null, class: phone ? 'tablink' : null },
    icon(s.icon, phone ? 22 : 18), s.label, s.id === 'activity' ? badge(phone ? 'tabbadge' : 'badge') : null);

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('a', { href: '#add', class: 'btn primary side-add', 'aria-current': route === 'add' ? 'page' : null }, icon('add', 18, '#0B1016', 2.2), 'Add transaction'),
    h('nav', { class: 'nav', 'aria-label': 'Main' }, SECTIONS.map((s) => sectionLink(s, false))),
    h('div', { class: 'me' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initial),
      h('span', { class: 'who', title: email }, email),
      h('a', { href: '#settings', 'aria-label': 'Settings', 'aria-current': route === 'settings' ? 'page' : null, class: 'iconlink' }, icon('settings')),
      h('button', { class: 'linkbtn', type: 'button', onclick: onSignOut }, 'Sign out')));

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('div', { class: 'topbar-act' },
      h('a', { href: '#add', class: 'topadd', 'aria-label': 'Add a transaction', 'aria-current': route === 'add' ? 'page' : null }, icon('add', 20, '#0B1016', 2.2)),
      h('a', { href: '#settings', class: 'iconlink', 'aria-label': 'Settings', 'aria-current': route === 'settings' ? 'page' : null }, icon('settings', 22))));

  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, SECTIONS.map((s) => sectionLink(s, true)));

  const subnav = sec && sec.pages.length > 1 ? h('nav', { class: 'subnav', 'aria-label': `${sec.label} pages` },
    sec.pages.map(([id, label]) => h('a', { href: `#${id}`, 'aria-current': id === route ? 'page' : null }, label, id === 'inbox' ? badge('badge') : null))) : null;

  const main = h('main', { class: 'main', id: 'content', tabindex: '-1' }, subnav);
  const root = h('div', { class: 'shell' }, h('a', { class: 'skip', href: '#content' }, 'Skip to content'), sidebar, topbar, main, tabbar);
  return { root, main };
}
