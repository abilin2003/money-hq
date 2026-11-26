// Money HQ starts here: check the set-up, check the database is reachable, then sign in or show the app.
import './styles/app.css';
import { supabase, configured, checkReachable } from './lib/supabase.js';
import { loadEverything, enrich } from './lib/data.js';
import { splitTotals } from './lib/analytics.js';
import { dayDiff } from './lib/dates.js';
import { todayLondon } from './lib/dates.js';
import { loginScreen, unreachableScreen, notConfiguredScreen } from './auth/screens.js';
import { shell } from './ui/shell.js';
import { overviewPage, transactionsPage, placeholderPage } from './views/pages.js';
import { spendingPage } from './views/spending.js';
import { billsPage } from './views/bills.js';
import { comparePage } from './views/compare.js';
import { insightsPage } from './views/insights.js';
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
  const page = route === 'overview' ? overviewPage(ctx, render, param)
    : route === 'transactions' ? transactionsPage(ctx, param, render)
    : route === 'trends' ? trendsPage(ctx, render)
    : route === 'spending' ? spendingPage(ctx, param, render)
    : route === 'bills' ? billsPage(ctx, render)
    : route === 'compare' ? comparePage(ctx, param, render)
    : route === 'insights' ? insightsPage(ctx, param)
    : route === 'people' ? peoplePage(ctx, render)
    : route === 'add' ? addPage(ctx, render)
    : route === 'goals' ? goalsPage(ctx, render)
    : route === 'wealth' ? wealthPage(ctx, render)
    : route === 'moneyday' ? moneydayPage(ctx, render)
    : route === 'settings' ? settingsPage(ctx, render)
    : route === 'inbox' ? inboxPage(ctx, render)
    : route === 'import' ? importPage(ctx, render)
    : route === 'history' ? historyPage(ctx, render)
    : route === 'plan' ? planPage(ctx, render)
    : route === 'budgets' ? budgetsPage(ctx, param)
    : route === 'manage' ? managePage(ctx, render)
    : placeholderPage(route);
  main.append(page);
  const y = window.scrollY;
  show(root);
  // Stay in place when the same page redraws, or opens a detail panel or changes period; go to the top on a new page.
  window.scrollTo(0, route === (render.lastRoute ?? route) ? y : 0);
  render.lastRoute = route;
  const sub = main.querySelector('.subnav'); const open = sub?.querySelector('[aria-current]'); // phones: keep the open tab in view
  if (open && open.offsetLeft + open.offsetWidth > sub.offsetLeft + sub.clientWidth) sub.scrollLeft = open.offsetLeft - sub.offsetLeft - 12;
  document.title = `${main.querySelector('h1')?.textContent || 'Money HQ'} · Money HQ`;
}

window.addEventListener('hashchange', () => render());
// Escape closes a detail panel (it's part of the address, so this is the same as pressing its close button).
window.addEventListener('keydown', (e) => {
  const wrap = document.querySelector('.panel-wrap');
  if (e.key === 'Escape' && wrap) location.hash = wrap.dataset.close;
});
window.addEventListener('online', () => { if (!ctx) boot(); });
supabase?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && ctx) boot(); });
boot();
