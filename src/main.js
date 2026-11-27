// Money HQ starts here: check the set-up, check the database is reachable, then sign in or show the app.
import './styles/app.css';
import { supabase, configured, checkReachable } from './lib/supabase.js';
import { loadEverything, enrich } from './lib/data.js';
import { splitTotals } from './lib/analytics.js';
import { dayDiff } from './lib/dates.js';
import { todayLondon } from './lib/dates.js';
import { loginScreen, unreachableScreen, notConfiguredScreen } from './auth/screens.js';
import { shell } from './ui/shell.js';
import { h } from './ui/dom.js';
import { overviewPage, transactionsPage, placeholderPage } from './views/pages.js';
import { spendingPage } from './views/spending.js';
import { billsPage } from './views/bills.js';
import { comparePage } from './views/compare.js';
import { insightsPage } from './views/insights.js';
import { reviewPage } from './views/review.js';
import { reportsPage } from './views/reports.js';
import { inboxPage, waitingLines } from './views/inbox.js';
import { importPage } from './views/import.js';
import { historyPage } from './views/history.js';
import { planPage } from './views/plan.js';
import { budgetsPage } from './views/budgets.js';
import { managePage } from './views/manage.js';
import { trendsPage } from './views/trends.js';
import { peoplePage } from './views/people.js';
import { addPage } from './views/add.js';
import { goalsPage } from './views/goals.js';
import { wealthPage } from './views/wealth.js';
import { moneydayPage } from './views/moneyday.js';
import { settingsPage } from './views/settings.js';

const app = document.querySelector('#app');
const show = (el) => app.replaceChildren(el);
let ctx = null; // the signed-in session's data
let booting = null;

// One start-up at a time: sign-out, coming back online and retries all funnel through here.
function boot() {
  booting = booting || start().finally(() => { booting = null; });
  return booting;
}

async function start() {
  ctx = null;
  if (!configured) return show(notConfiguredScreen());
  const reach = await checkReachable();
  if (!reach.ok) return show(unreachableScreen(reach.reason, boot));
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return show(loginScreen(boot));
  try {
    const { ref, all } = await loadEverything();
    ctx = makeContext(session.user.email, ref, all);
  } catch (err) {
    console.error(err);
    const again = await checkReachable();
    return show(unreachableScreen(again.ok ? 'error' : again.reason, boot));
  }
  render();
}

function makeContext(email, ref, all) {
  const c = { email, ref, all, today: todayLondon(), signOut };
  const refresh = () => {
    c.transactions = c.all.filter((t) => !t.archived);
    c.inboxCount = waitingLines(c.all).length;
    c.splitMap = splitTotals(c.ref.splits || []);
    c.settled = new Set((c.ref.splits || []).map((s) => s.settled_by_transaction_id).filter(Boolean));
    const dateOf = Object.fromEntries(c.all.map((t) => [t.id, t.date]));
    c.oldIous = (c.ref.splits || []).filter((s) => !s.settled_by_transaction_id && dateOf[s.transaction_id] && dayDiff(dateOf[s.transaction_id], c.today) > 30).length;
  };
  c.refresh = refresh;
  c.replace = (t) => { c.all = c.all.map((x) => (x.id === t.id ? t : x)); refresh(); };
  c.relabel = () => { c.all = c.all.map((t) => enrich(t, c.ref)); refresh(); };
  c.add = (t) => { c.all = [t, ...c.all.filter((x) => x.id !== t.id)].sort((a, b) => b.date.localeCompare(a.date)); refresh(); };
  refresh();
  return c;
}

async function signOut() {
  ctx = null; // so the SIGNED_OUT event below doesn't start the app a second time
  await supabase.auth.signOut();
  location.hash = '';
  boot();
}

function render() {
  if (!ctx) return;
  const [hashRoute, param] = location.hash.replace(/^#/, '').split('/');
  // An empty address means Overview. #more was the old phone menu; the five sections replace it.
  const route = !hashRoute || hashRoute === 'more' ? 'overview' : hashRoute;
  const { root, main } = shell({ route, email: ctx.email, onSignOut: signOut, inboxCount: ctx.inboxCount });
  let page;
  try {
  page = route === 'overview' ? overviewPage(ctx, render, param)
    : route === 'transactions' ? transactionsPage(ctx, param, render)
    : route === 'trends' ? trendsPage(ctx, render)
    : route === 'spending' ? spendingPage(ctx, param, render)
    : route === 'bills' ? billsPage(ctx, render)
    : route === 'compare' ? comparePage(ctx, param, render)
    : route === 'insights' ? insightsPage(ctx, param)
    : route === 'review' ? reviewPage(ctx, param, render)
    : route === 'reports' ? reportsPage(ctx, param, render)
    : route === 'people' ? peoplePage(ctx, render)
    : route === 'add' ? addPage(ctx, render)
    : route === 'goals' ? goalsPage(ctx, render)
    : route === 'wealth' ? wealthPage(ctx, render)
    : route === 'moneyday' ? moneydayPage(ctx, render)
    : route === 'settings' ? settingsPage(ctx, render)
    : route === 'inbox' ? inboxPage(ctx, render)
    : route === 'import' ? importPage(ctx, render)
    : route === 'history' ? historyPage(ctx, render)
    : route === 'plan' ? planPage(ctx, render, param)
    : route === 'budgets' ? budgetsPage(ctx, param)
    : route === 'manage' ? managePage(ctx, render)
    : placeholderPage(route);
  } catch (err) {
    // One page going wrong shouldn't take the app down: say so, and offer a way on. Nothing is saved or changed.
    console.error(err);
    page = h('div', { class: 'page' }, h('section', { class: 'card error-card', role: 'alert' },
      h('h1', { class: 'display', style: { fontSize: '20px', margin: '0 0 8px' } }, 'This page couldn’t be shown'),
      h('p', { class: 'muted' }, 'Your data is safe: nothing was saved or changed. Try again, or go back to the Overview.'),
      h('p', { class: 'muted small' }, `Details: ${err.message}`),
      h('div', { class: 'chips' }, h('button', { class: 'btn primary', type: 'button', onclick: () => render() }, 'Try again'), h('a', { href: '#overview', class: 'btn tap' }, 'Overview'))));
  }
  main.append(page);
  const y = window.scrollY;
  show(root);
  // Stay in place when the same page redraws, or opens a detail panel or changes period; go to the top on a new page.
  window.scrollTo(0, route === (render.lastRoute ?? route) ? y : 0);
  render.lastRoute = route;
  const sub = main.querySelector('.subnav'); const open = sub?.querySelector('[aria-current]'); // phones: keep the open tab in view
  if (open && open.offsetLeft + open.offsetWidth > sub.offsetLeft + sub.clientWidth) sub.scrollLeft = open.offsetLeft - sub.offsetLeft - 12;
  document.title = `${main.querySelector('h1')?.textContent || 'Money HQ'} · Money HQ`;
  openPanel(root);
  fitChartText(root);
  phoneHelpers(root, route);
}

// Charts scale to fit their card, and so does their text: a wide chart in a half-width card (or on a phone) would
// end up with 7px labels. After drawing, any chart that's been shrunk gets its text enlarged back to about 10.5px.
// A label that would then run off the chart's edge (a wide amount on the axis) is shrunk back just enough to fit.
// Charts inside a closed section have no width yet, so they're fitted when the section opens.
function fitChartText(root) {
  for (const svg of root.querySelectorAll('svg.chart')) {
    if (svg.dataset.fitted) continue;
    const vb = Number((svg.getAttribute('viewBox') || '').split(' ')[2]);
    const w = svg.getBoundingClientRect().width;
    if (!vb || !w) continue;
    svg.dataset.fitted = '1';
    const scale = w / vb;
    if (scale >= 0.9) continue;
    const factor = Math.min(1.5, 0.95 / scale);
    for (const t of svg.querySelectorAll('text')) {
      const size = Number(t.getAttribute('font-size') || 11) * factor;
      t.setAttribute('font-size', size.toFixed(1));
      const b = t.getBBox();
      const over = Math.max(0, -b.x, b.x + b.width - vb);
      if (over > 0 && b.width > 0) t.setAttribute('font-size', (size * Math.max(0.6, (b.width - over) / b.width)).toFixed(1));
      const c = over > 0 ? t.getBBox() : null; // still not fitting: nudge it back inside
      if (c && c.x + c.width > vb) t.setAttribute('x', Number(t.getAttribute('x')) - (c.x + c.width - vb) - 1);
      else if (c && c.x < 0) t.setAttribute('x', Number(t.getAttribute('x')) - c.x + 1);
    }
  }
  for (const d of root.querySelectorAll('details:not([open])')) {
    if (d.querySelector('svg.chart:not([data-fitted])')) d.addEventListener('toggle', () => { if (d.open) fitChartText(d); }, { once: true });
  }
}

// A detail panel that has just opened gets keyboard focus (so screen readers and keyboards land in it), and on a
// phone the sheet can be swiped down to close, like other apps' bottom sheets.
function openPanel(root) {
  const wrap = root.querySelector('.panel-wrap');
  if (!wrap) { render.panelKey = null; return; }
  const sheet = wrap.querySelector('.panel');
  if (render.panelKey !== location.hash) { render.panelKey = location.hash; sheet.querySelector('h2')?.setAttribute('tabindex', '-1'); sheet.querySelector('h2')?.focus({ preventScroll: true }); }
  if (!window.matchMedia?.('(max-width: 759px)').matches) return; // the laptop drawer isn't swiped
  let startY = null; let dy = 0;
  const head = sheet.querySelector('.panel-head');
  head.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
  head.addEventListener('touchmove', (e) => { if (startY === null) return; dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  head.addEventListener('touchend', () => {
    sheet.style.transition = ''; startY = null;
    if (dy > 90) location.hash = wrap.dataset.close; else sheet.style.transform = '';
  });
}

// Phone helpers, after each page is drawn:
// - the section tabs fade at an edge that has more tabs past it, so it's clear the row scrolls;
// - long pages get a "Jump to" menu of their sections (the report has its own section bar).
const PHONE = '(max-width: 759px)';
const JUMP_PAGES = new Set(['spending', 'insights', 'compare', 'trends', 'plan', 'moneyday', 'budgets', 'wealth', 'goals', 'manage', 'transactions']);
function phoneHelpers(root, route) {
  if (!matchMedia(PHONE).matches) return;
  const sub = root.querySelector('.subnav');
  if (sub) {
    const edges = () => { sub.classList.toggle('more-left', sub.scrollLeft > 4); sub.classList.toggle('more-right', sub.scrollLeft + sub.clientWidth < sub.scrollWidth - 4); };
    sub.addEventListener('scroll', edges, { passive: true });
    edges();
  }
  if (!JUMP_PAGES.has(route)) return;
  const page = root.querySelector('.page');
  const targets = [...page.querySelectorAll(':scope > section, :scope > div > section, :scope > div > div > section')].filter((s) => s.querySelector('h2') && s.offsetParent);
  if (targets.length < 5) return;
  const select = h('select', { class: 'input jump-select', 'aria-label': 'Jump to a section', onchange: (e) => { const t = targets[Number(e.target.value)]; if (t) t.scrollIntoView({ block: 'start' }); e.target.value = ''; } },
    h('option', { value: '' }, 'Jump to a section…'), targets.map((s, i) => h('option', { value: String(i) }, s.querySelector('h2').textContent.trim())));
  const after = page.querySelector(':scope > .periodbar') || page.querySelector(':scope > .page-head');
  if (after) after.after(select); else page.prepend(select);
}
// While you type on a phone, the bottom tab bar steps aside so it can't cover the field or the Save button
// (the on-screen keyboard often pushes fixed bars up over them).
const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)));
document.addEventListener('focusin', (e) => { if (matchMedia(PHONE).matches && isField(e.target)) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => { setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('typing'); }, 0); });

// Remember the page you were on, so Add's Close button can take you back to it.
window.addEventListener('hashchange', (e) => { if (ctx) { const from = new URL(e.oldURL).hash.slice(1); if (from && !from.startsWith('add')) ctx.cameFrom = from; } render(); });
// Charts are drawn for the screen size, so redraw when it crosses the phone/laptop width.
// Not when you're typing or have typed something not yet saved (rotating a phone mid-entry mustn't clear it),
// and only on pages that have charts.
window.matchMedia?.('(max-width: 759px)').addEventListener?.('change', () => {
  const fields = [...document.querySelectorAll('.page input, .page textarea, .page select, .panel input, .panel textarea')];
  if (fields.includes(document.activeElement) || fields.some((el) => (el.type === 'checkbox' ? el.checked !== el.defaultChecked : el.tagName === 'SELECT' ? false : el.value !== el.defaultValue))) return;
  if (document.querySelector('.page svg.chart')) render();
});
// Escape closes a detail panel (it's part of the address, so this is the same as pressing its close button).
window.addEventListener('keydown', (e) => {
  const wrap = document.querySelector('.panel-wrap');
  if (e.key === 'Escape' && wrap) location.hash = wrap.dataset.close;
});
window.addEventListener('online', () => { if (!ctx) boot(); });
supabase?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && ctx) boot(); });
boot();
