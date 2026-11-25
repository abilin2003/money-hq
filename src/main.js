// Money HQ starts here: check the set-up, check the database is reachable, then sign in or show the app.
import './styles/app.css';
import { supabase, configured, checkReachable } from './lib/supabase.js';
import { loadEverything } from './lib/data.js';
import { todayLondon } from './lib/dates.js';
import { loginScreen, unreachableScreen, notConfiguredScreen } from './auth/screens.js';
import { shell } from './ui/shell.js';
import { overviewPage, transactionsPage, morePage, placeholderPage } from './views/pages.js';
import { inboxPage } from './views/inbox.js';
import { importPage } from './views/import.js';
import { historyPage } from './views/history.js';

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
    c.inboxCount = c.transactions.filter((t) => t.status === 'needs_review').length;
  };
  c.replace = (t) => { c.all = c.all.map((x) => (x.id === t.id ? t : x)); refresh(); };
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
  const route = hashRoute || 'overview'; // an empty address means Overview
  const { root, main } = shell({ route, email: ctx.email, onSignOut: signOut, inboxCount: ctx.inboxCount });
  const page = route === 'overview' ? overviewPage(ctx, render)
    : route === 'transactions' ? transactionsPage(ctx, param)
    : route === 'inbox' ? inboxPage(ctx, render)
    : route === 'import' ? importPage(ctx, render)
    : route === 'history' ? historyPage(ctx, render)
    : route === 'more' ? morePage(ctx)
    : placeholderPage(route);
  main.append(page);
  const y = window.scrollY;
  show(root);
  if (location.hash === (render.lastHash ?? location.hash)) window.scrollTo(0, y); // stay in place when the same page redraws
  render.lastHash = location.hash;
  document.title = `${main.querySelector('h1')?.textContent || 'Money HQ'} · Money HQ`;
}

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
window.addEventListener('online', () => { if (!ctx) boot(); });
supabase?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && ctx) boot(); });
boot();
