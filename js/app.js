import { loadData, saveData, emptyData } from './store.js';
import { toast } from './ui.js';
import { initHome } from './views/home.js';
import { initAdd } from './views/add.js';
import { initTransactions } from './views/transactions.js';
import { initImport } from './views/import.js';
import { initData } from './views/data.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['home', 'add', 'transactions', 'import', 'data'];
const views = {};

// Shared by every screen. `update` saves a change and refreshes the screens.
// If saved data could not be read, saving is switched off so nothing can overwrite it.
const ctx = {
  data: emptyData(),
  locked: false,
  async update(mutator) {
    if (ctx.locked) throw new Error('Your saved data could not be read, so changes are switched off to protect it.');
    const next = structuredClone(ctx.data);
    const result = mutator(next);
    await saveData(next);
    ctx.data = next;
    ctx.refresh();
    return result;
  },
  refresh() {
    for (const v of Object.values(views)) v.render();
  },
};

function show(name) {
  const view = VIEWS.includes(name) ? name : 'home';
  for (const v of VIEWS) {
    $(`view-${v}`).hidden = v !== view;
    const tab = document.querySelector(`.tabs [data-view="${v}"]`);
    tab.classList.toggle('active', v === view);
    if (v === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
}

function route() {
  show(location.hash.replace('#', ''));
}

views.home = initHome(ctx);
views.add = initAdd(ctx, $('view-add'));
views.transactions = initTransactions(ctx, $('view-transactions'));
views.import = initImport(ctx, $('view-import'));
views.data = initData(ctx);

for (const tab of document.querySelectorAll('.tabs [data-view]')) {
  tab.addEventListener('click', () => { location.hash = tab.dataset.view; });
}
$('home-go').addEventListener('click', () => { location.hash = 'import'; });
window.addEventListener('hashchange', route);

(async function start() {
  try {
    const saved = await loadData();
    if (saved) ctx.data = saved;
  } catch (err) {
    ctx.locked = true;
    toast(`Could not open your saved data, so saving is switched off: ${err.message}`, 'bad');
  }
  ctx.refresh();
  route();
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
