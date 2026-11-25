// The app shell: sidebar on laptop, bottom tab bar under 760px. Pages render into <main>.
import { h, icon, logo } from './dom.js';

export const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'transactions', label: 'Transactions', short: 'Activity', icon: 'transactions' },
  { id: 'inbox', label: 'Review inbox', icon: 'inbox' },
  { id: 'import', label: 'Import', icon: 'import' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'budgets', label: 'Budgets', icon: 'budgets' },
  { id: 'trends', label: 'Trends', icon: 'trends' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'wealth', label: 'Wealth', icon: 'wealth' },
  { id: 'plan', label: 'Payday plan', icon: 'plan' },
];
const TABS = ['overview', 'transactions', 'add', 'budgets', 'more'];

export function shell({ route, email, onSignOut, inboxCount = 0 }) {
  const current = (id) => (id === route ? 'page' : null);
  const initial = (email || '?').trim()[0].toUpperCase();

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, logo(), h('span', { class: 'display' }, 'Money HQ')),
    h('nav', { class: 'nav', 'aria-label': 'Main' },
      PAGES.map((p) => h('a', { href: `#${p.id}`, 'aria-current': current(p.id) }, icon(p.icon), p.label,
        p.id === 'inbox' && inboxCount ? h('span', { class: 'badge', 'aria-label': `${inboxCount} to review` }, String(inboxCount)) : null))),
    h('div', { class: 'me' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initial),
      h('span', { class: 'who', title: email }, email),
      h('a', { href: '#settings', 'aria-label': 'Settings', 'aria-current': current('settings'), style: { color: 'var(--muted)', display: 'flex', minWidth: '32px', minHeight: '32px', alignItems: 'center', justifyContent: 'center' } }, icon('settings')),
      h('button', { class: 'linkbtn', type: 'button', onclick: onSignOut }, 'Sign out')));

  const tab = (id) => {
    if (id === 'add') return h('a', { href: '#add', class: 'add', 'aria-label': 'Add a transaction', 'aria-current': current('add') }, h('span', null, icon('add', 22, '#0B1016', 2.2)));
    if (id === 'more') return h('a', { href: '#more', 'aria-current': ['more', 'inbox', 'import', 'history', 'trends', 'goals', 'wealth', 'plan', 'settings'].includes(route) ? 'page' : null }, icon('more', 22), 'More');
    const p = PAGES.find((x) => x.id === id);
    return h('a', { href: `#${p.id}`, 'aria-current': current(p.id) }, icon(p.icon, 22), p.short || p.label);
  };
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map(tab));

  const main = h('main', { class: 'main', id: 'content', tabindex: '-1' });
  const root = h('div', { class: 'shell' }, h('a', { class: 'skip', href: '#content' }, 'Skip to content'), sidebar, main, tabbar);
  return { root, main };
}
