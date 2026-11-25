// Money HQ starts here: check the set-up, check the database is reachable, then sign in or show the app.
import './styles/app.css';
import { supabase, configured, checkReachable } from './lib/supabase.js';
import { loadSettings, loadTransactions, countTransactions } from './lib/data.js';
import { todayLondon } from './lib/dates.js';
import { loginScreen, unreachableScreen, notConfiguredScreen } from './auth/screens.js';
import { shell } from './ui/shell.js';
import { overviewPage, transactionsPage, morePage, placeholderPage } from './views/pages.js';

const app = document.querySelector('#app');
const show = (el) => app.replaceChildren(el);
let ctx = null; // the signed-in session's data

async function boot() {
  ctx = null;
  if (!configured) return show(notConfiguredScreen());
  const reach = await checkReachable();
  if (!reach.ok) return show(unreachableScreen(reach.reason, boot));
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return show(loginScreen(boot));
  try {
    const [settings, transactions, counts] = await Promise.all([loadSettings(), loadTransactions(), countTransactions()]);
    ctx = { email: session.user.email, settings, transactions, counts, today: todayLondon(), signOut };
  } catch (err) {
    console.error(err);
    const again = await checkReachable();
    return show(unreachableScreen(again.ok ? 'error' : again.reason, boot));
  }
  render();
}

async function signOut() {
  await supabase.auth.signOut();
  location.hash = '';
  boot();
}

function render() {
  if (!ctx) return;
  const [hashRoute, param] = location.hash.replace(/^#/, '').split('/');
  const route = hashRoute || 'overview'; // an empty address means Overview
  const { root, main } = shell({ route, email: ctx.email, onSignOut: signOut });
  const page = route === 'overview' ? overviewPage(ctx)
    : route === 'transactions' ? transactionsPage(ctx, param)
    : route === 'more' ? morePage(ctx)
    : placeholderPage(route);
  main.append(page);
  show(root);
  document.title = `${route === 'overview' ? 'Overview' : main.querySelector('h1')?.textContent || 'Money HQ'} · Money HQ`;
}

window.addEventListener('hashchange', render);
window.addEventListener('online', () => { if (!ctx) boot(); });
supabase?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && ctx) boot(); });
boot();
