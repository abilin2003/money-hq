import { loadData, saveData, emptyData } from './store.js';
import { toast } from './ui.js';
import { todayIso } from './money.js';
import { makeDemoData } from './demo.js';
import { loadChartJs } from './charts.js';
import { initHQ } from './views/hq.js';
import { initSpending } from './views/spending.js';
import { initSavings } from './views/savings.js';
import { initWealth } from './views/wealth.js';
import { initPlanning } from './views/planning.js';
import { initSettings } from './views/settings.js';
import { initAdd } from './views/add.js';
import { initTransactions } from './views/transactions.js';
import { initImport } from './views/import.js';
import { initData } from './views/data.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['hq', 'spending', 'savings', 'wealth', 'planning', 'settings', 'add', 'transactions', 'import', 'data'];
const PARENT = { transactions: 'spending', add: 'settings', import: 'settings', data: 'settings' }; // which tab to light up
const ALIASES = { home: 'hq', dashboard: 'spending/overview' };
const views = {};

// Shared by every screen. `update` saves a change and refreshes the current screen.
// If saved data could not be read, saving is switched off so nothing can overwrite it.
const ctx = {
  data: emptyData(),
  locked: false,
  route: { view: 'hq', sub: '' },
  demo: false, // demo mode: fake data, kept in memory only, never saved
  real: null,  // your real data, set aside while the demo is showing
  enterDemo() {
    if (ctx.demo) return;
    ctx.real = ctx.data;
    ctx.data = makeDemoData(todayIso());
    ctx.demo = true;
    $('demo-banner').hidden = false;
    document.body.classList.add('is-demo');
    ctx.refresh();
  },
  exitDemo() {
    if (!ctx.demo) return;
    ctx.data = ctx.real;
    ctx.real = null;
    ctx.demo = false;
    $('demo-banner').hidden = true;
    document.body.classList.remove('is-demo');
    ctx.refresh();
  },
  async update(mutator) {
    if (ctx.demo) { // changes in demo mode only live in memory, so your real data can never be touched
      const next = structuredClone(ctx.data);
      const result = mutator(next);
      ctx.data = next;
      ctx.refresh();
      return result;
    }
    if (ctx.locked) throw new Error('Your saved data could not be read, so changes are switched off to protect it.');
    const next = structuredClone(ctx.data);
    const before = new Map(ctx.data.transactions.map((t) => [t.id, JSON.stringify(t)]));
    const result = mutator(next);
    recordEdits(before, next);
    await saveData(next);
    ctx.data = next;
    ctx.refresh();
    return result;
  },
  refresh() {
    applyTheme();
    views[ctx.route.view]?.render?.();
  },
};

// A trail of edits to existing transactions (not of imports, which only add new ones).
function recordEdits(before, next) {
  const now = new Set(next.transactions.map((t) => t.id));
  const notes = [];
  for (const t of next.transactions) {
    const b = before.get(t.id);
    if (b === undefined || b === JSON.stringify(t)) continue;
    const old = JSON.parse(b);
    const fields = Object.keys({ ...old, ...t }).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(t[k]));
    notes.push({ id: t.id, what: `Edited "${t.desc}": ${fields.map((k) => `${k} ${JSON.stringify(old[k] ?? '')} to ${JSON.stringify(t[k] ?? '')}`).join(', ')}` });
  }
  for (const [id, json] of before) if (!now.has(id)) { const o = JSON.parse(json); notes.push({ id, what: `Deleted "${o.desc}" (${o.date}, £${o.amount})` }); }
  if (notes.length && notes.length <= 60) {
    next.audit = [...(next.audit || []), ...notes.map((n) => ({ ts: new Date().toISOString(), ...n }))].slice(-2000);
  }
}

// Light / dark. "auto" follows the device.
function applyTheme() {
  const pref = ctx.data.settings?.theme || 'auto';
  const light = pref === 'light' || (pref === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f5f7fb' : '#0f1420');
  const btn = $('theme-btn');
  if (btn) btn.textContent = pref === 'auto' ? 'Auto' : pref === 'light' ? 'Light' : 'Dark';
}

function parseHash() {
  const raw = ALIASES[location.hash.replace('#', '')] || location.hash.replace('#', '');
  const [view, sub = ''] = raw.split('/');
  return { view: VIEWS.includes(view) ? view : 'hq', sub };
}

function show() {
  ctx.route = parseHash();
  const view = ctx.route.view;
  const tab = PARENT[view] || view;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  for (const t of document.querySelectorAll('.tabs [data-view]')) {
    t.classList.toggle('active', t.dataset.view === tab);
    if (t.dataset.view === tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  document.body.classList.toggle('narrow', ['add', 'import', 'data', 'transactions'].includes(view)); // forms read better narrow
  $('fab-add').hidden = view === 'add';
  applyTheme();
  try { views[view].render(); } catch (err) { toast(`This page could not be drawn: ${err.message}`, 'bad'); }
  window.scrollTo(0, 0);
}

views.hq = initHQ(ctx, $('view-hq'));
views.spending = initSpending(ctx, $('view-spending'));
views.savings = initSavings(ctx, $('view-savings'));
views.wealth = initWealth(ctx, $('view-wealth'));
views.planning = initPlanning(ctx, $('view-planning'));
views.settings = initSettings(ctx, $('view-settings'));
views.add = initAdd(ctx, $('view-add'));
views.transactions = initTransactions(ctx, $('view-transactions'));
views.import = initImport(ctx, $('view-import'));
views.data = initData(ctx);

for (const tab of document.querySelectorAll('.tabs [data-view]')) {
  tab.addEventListener('click', () => { location.hash = tab.dataset.view; });
}
$('fab-add').addEventListener('click', () => { location.hash = 'add'; });
$('demo-exit').addEventListener('click', () => ctx.exitDemo());
$('theme-btn').addEventListener('click', () => {
  const next = { auto: 'light', light: 'dark', dark: 'auto' }[ctx.data.settings.theme || 'auto'];
  ctx.update((d) => { d.settings.theme = next; }).catch((e) => toast(e.message, 'bad'));
});
window.addEventListener('hashchange', show);
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

(async function start() {
  try {
    const saved = await loadData();
    if (saved) ctx.data = saved;
  } catch (err) {
    ctx.locked = true;
    toast(`Could not open your saved data, so saving is switched off: ${err.message}`, 'bad');
  }
  show();
  loadChartJs().catch(() => {}); // start fetching the chart library now, so charts are ready by the time you open a page
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
