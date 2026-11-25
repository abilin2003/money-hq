// The app shell: sidebar on laptop, bottom tab bar under 760px. Pages render into <main>.
// Overview and Trends come first; Transactions and History are further down (the bank files are the record);
// Import is a button on the pages that need it, not a menu item.
import { h, icon, logo } from './dom.js';

export const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'trends', label: 'Trends', icon: 'trends' },
  { id: 'inbox', label: 'Review inbox', short: 'Inbox', icon: 'inbox' },
  { id: 'budgets', label: 'Budgets', icon: 'budgets' },
  { id: 'plan', label: 'Payday plan', icon: 'plan' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'wealth', label: 'Wealth', icon: 'wealth' },
  { id: 'moneyday', label: 'Money day', icon: 'history' },
  { id: 'people', label: 'IOUs', icon: 'people' },
  { id: 'transactions', label: 'Transactions', icon: 'transactions', minor: true },
  { id: 'history', label: 'History', icon: 'history', minor: true },
];
const TABS = ['overview', 'trends', 'add', 'inbox', 'more'];

export function shell({ route, email, onSignOut, inboxCount = 0 }) {
  const current = (id) => (id === route ? 'page' : null);
  const initial = (email || '?').trim()[0].toUpperCase();
  const link = (p) => h('a', { href: `#${p.id}`, 'aria-current': current(p.id), class: p.minor ? 'minor' : null }, icon(p.icon), p.label,
    p.id === 'inbox' && inboxCount ? h('span', { class: 'badge', 'aria-label': `${inboxCount} to review` }, String(inboxCount)) : null);

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('nav', { class: 'nav', 'aria-label': 'Main' },
      PAGES.filter((p) => !p.minor).map(link),
      h('span', { class: 'nav-sep', role: 'separator' }),
      PAGES.filter((p) => p.minor).map(link)),
    h('div', { class: 'me' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initial),
      h('span', { class: 'who', title: email }, email),
      h('a', { href: '#settings', 'aria-label': 'Settings', 'aria-current': current('settings'), class: 'iconlink' }, icon('settings')),
      h('button', { class: 'linkbtn', type: 'button', onclick: onSignOut }, 'Sign out')));

  const tab = (id) => {
    if (id === 'add') return h('a', { href: '#add', class: 'add', 'aria-label': 'Add a transaction', 'aria-current': current('add') }, h('span', null, icon('add', 22, '#0B1016', 2.2)));
    if (id === 'more') return h('a', { href: '#more', 'aria-current': ['more', 'budgets', 'plan', 'goals', 'wealth', 'moneyday', 'people', 'transactions', 'history', 'settings', 'import'].includes(route) ? 'page' : null }, icon('more', 22), 'More');
    const p = PAGES.find((x) => x.id === id);
    return h('a', { href: `#${p.id}`, 'aria-current': current(p.id), class: 'tablink' }, icon(p.icon, 22), p.short || p.label,
      id === 'inbox' && inboxCount ? h('span', { class: 'tabbadge', 'aria-label': `${inboxCount} to review` }, String(inboxCount)) : null);
  };
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map(tab));

  const main = h('main', { class: 'main', id: 'content', tabindex: '-1' });
  const root = h('div', { class: 'shell' }, h('a', { class: 'skip', href: '#content' }, 'Skip to content'), sidebar, main, tabbar);
  return { root, main };
}
