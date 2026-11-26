// Planning → Manage: the set-up behind your budgets. Buckets and their categories (renaming keeps history), what
// happens to leftovers on payday (sweep or roll over), which buckets are essential, and the reserve. Bills are the
// second tab here (bills.js). The amounts themselves are set each payday on the Payday plan; how they're going is on
// Budgets.
import { h } from '../ui/dom.js';
import { parsePence } from '../lib/money.js';
import { head, alertLine } from '../ui/parts.js';
import { saveSettings, saveCategory } from '../lib/data.js';
import { DEFAULT_ESSENTIAL } from './explorer.js';

// The two tabs inside Manage.
export const manageTabs = (on) => h('div', { class: 'seg wide manage-tabs', role: 'group', 'aria-label': 'What to manage' },
  [['manage', 'Categories and rollover'], ['bills', 'Bills']].map(([id, label]) => h('a', { href: `#${id}`, class: 'segl', 'aria-current': on === id ? 'page' : null }, label)));

export function managePage(ctx, rerender) {
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 759px)').matches; // set-up folds away on a phone
  const leftover = ctx.ref.settings?.extra?.leftover || {};
  const essential = ctx.ref.settings?.extra?.essential_buckets || DEFAULT_ESSENTIAL;
  const saveExtra = async (patch, el) => {
    try { ctx.ref.settings = await saveSettings(ctx.ref.settings, patch); rerender(); } catch (err) { alertLine(el, err.message); }
  };

  // ---- buckets: leftovers and categories
  const bucketCards = ctx.ref.buckets.map((b) => {
    const cats = ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id);
    const sel = h('select', { class: 'input', 'aria-label': `${b.name}: leftover on payday`, onchange: (e) => saveExtra({ extra: { leftover: { ...leftover, [b.name]: e.target.value } } }, sel) },
      [['sweep', 'Sweep leftovers (start fresh)'], ['rollover', 'Roll leftovers over']].map(([v, l]) => h('option', { value: v, selected: (leftover[b.name] || 'sweep') === v }, l)));
    const catRow = (c) => h('div', { class: 'catrow' },
      h('input', { class: 'input', value: c.name, 'aria-label': `Rename ${c.name}`, onchange: async (e) => {
        const name = e.target.value.trim();
        if (!name || name === c.name) return;
        try { const saved = await saveCategory({ id: c.id, name }); ctx.ref.categories = ctx.ref.categories.map((x) => (x.id === saved.id ? saved : x)); ctx.relabel(); rerender(); } catch (err) { alertLine(e.target, err.message); }
      } }),
      h('select', { class: 'input', 'aria-label': `Move ${c.name} to another bucket`, onchange: async (e) => {
        try { const saved = await saveCategory({ id: c.id, bucket_id: e.target.value }); ctx.ref.categories = ctx.ref.categories.map((x) => (x.id === saved.id ? saved : x)); ctx.relabel(); rerender(); } catch (err) { alertLine(e.target, err.message); }
      } }, ctx.ref.buckets.map((k) => h('option', { value: k.id, selected: k.id === b.id }, k.name))));
    const add = h('input', { class: 'input', placeholder: 'New category', 'aria-label': `New category in ${b.name}`, onchange: async (e) => {
      const name = e.target.value.trim();
      if (!name) return;
      try { const saved = await saveCategory({ name, bucket_id: b.id, is_active: true }); ctx.ref.categories = [...ctx.ref.categories, saved]; rerender(); } catch (err) { alertLine(e.target, err.message); }
    } });
    const key = `manage:${b.id}`;
    return h('details', { class: 'card mcard', open: ctx.openCards?.[key] ?? !phone, 'aria-label': b.name, ontoggle: (e) => { (ctx.openCards ||= {})[key] = e.currentTarget.open; } },
      h('summary', { class: 'ch mcard-sum' }, h('h2', null, h('span', { class: 'dot', style: { background: b.colour, marginRight: '10px' } }), b.name), h('span', { class: 'muted small' }, `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} · ${(leftover[b.name] || 'sweep') === 'rollover' ? 'rolls over' : 'sweeps'}`)),
      h('div', { class: 'planrow', style: { gridTemplateColumns: 'minmax(0,1fr) auto' } }, h('span', { class: 'muted small' }, 'Leftover on payday'), sel),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: essential.includes(b.name), onchange: (e) => saveExtra({ extra: { essential_buckets: e.target.checked ? [...new Set([...essential, b.name])] : essential.filter((x) => x !== b.name) } }, e.target) }), 'Essential spending (for Analytics)'),
      b.description ? h('p', { class: 'muted small', style: { marginTop: 0 } }, b.description) : null,
      cats.map(catRow), add);
  });

  // ---- reserve
  const reserve = h('input', { class: 'input money', inputmode: 'decimal', value: ((ctx.ref.settings?.reserve_pence || 0) / 100).toFixed(2), 'aria-label': 'Reserve', onchange: (e) => {
    const p = parsePence(e.target.value);
    if (p === null || p < 0) { e.target.select(); return; }
    saveExtra({ reserve_pence: p }, reserve);
  } });

  return h('div', { class: 'page' },
    head('Manage', 'Category mappings, rollover, essential buckets, the reserve and bills. Amounts are set each payday on the Payday plan.', h('a', { href: '#budgets', class: 'btn tap' }, 'Budget overview')),
    manageTabs('manage'),
    h('section', { class: 'card', 'aria-labelledby': 'rs' },
      h('h2', { id: 'rs' }, 'Reserve'),
      h('div', { class: 'planrow' }, h('span', { class: 'muted small' }, 'Kept back from safe to spend. Your £25 Ulster buffer doesn’t need to be here, since it isn’t budget money.'), h('span'), reserve)),
    h('div', { class: 'grid2' }, bucketCards)
  );
}
