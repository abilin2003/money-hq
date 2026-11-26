// Budgets: what happens to leftovers on payday, the reserve, buckets and categories (renaming keeps history).
// Bills have their own Planning tab (bills.js).
import { h } from '../ui/dom.js';
import { parsePence } from '../lib/money.js';
import { head, alertLine } from '../ui/parts.js';
import { saveSettings, saveCategory } from '../lib/data.js';

export function budgetsPage(ctx, rerender) {
  const leftover = ctx.ref.settings?.extra?.leftover || {};
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
    return h('section', { class: 'card', 'aria-label': b.name },
      h('div', { class: 'ch' }, h('h2', null, h('span', { class: 'dot', style: { background: b.colour, marginRight: '10px' } }), b.name), sel),
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
    head('Budgets', 'Buckets, categories, leftovers and the reserve. Set each payday’s amounts on the Payday plan; bills have their own tab.', h('a', { href: '#plan', class: 'btn primary tap' }, 'Payday plan')),
    h('section', { class: 'card', 'aria-labelledby': 'rs' },
      h('h2', { id: 'rs' }, 'Reserve'),
      h('div', { class: 'planrow' }, h('span', { class: 'muted small' }, 'Kept back from safe to spend. Your £25 Ulster buffer doesn’t need to be here, since it isn’t budget money.'), h('span'), reserve)),
    h('div', { class: 'grid2' }, bucketCards)
  );
}
