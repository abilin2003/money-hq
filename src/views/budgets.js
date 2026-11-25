// Budgets: what happens to leftovers on payday, the reserve, buckets and categories (renaming keeps history),
// and the bills list (with regular payments Money HQ has spotted).
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { detectRecurring } from '../lib/budget.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { saveSettings, saveCategory, saveBill } from '../lib/data.js';
import { historyRows } from './history.js';

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

  // ---- bills
  const bills = (ctx.ref.bills || []).map((b) => {
    const set = (patch) => async (e) => {
      try { const saved = await saveBill({ id: b.id, ...patch(e.target) }); ctx.ref.bills = ctx.ref.bills.map((x) => (x.id === saved.id ? saved : x)); rerender(); } catch (err) { alertLine(e.target, err.message); }
    };
    return h('div', { class: 'billedit' },
      h('input', { class: 'input', value: b.name, 'aria-label': 'Bill name', onchange: set((el) => ({ name: el.value.trim() || b.name })) }),
      h('input', { class: 'input money', inputmode: 'decimal', value: (b.amount_pence / 100).toFixed(2), 'aria-label': `${b.name} amount`, onchange: set((el) => ({ amount_pence: parsePence(el.value) ?? b.amount_pence })) }),
      h('input', { class: 'input', type: 'date', value: b.next_date || '', 'aria-label': `${b.name} next date`, onchange: set((el) => ({ next_date: el.value || null })) }),
      h('input', { class: 'input', value: b.match || '', placeholder: 'Words in the bank line', 'aria-label': `${b.name}: words that identify the payment`, onchange: set((el) => ({ match: el.value.trim() || null })) }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: b.is_active !== false, onchange: set((el) => ({ is_active: el.checked })) }), 'Active'));
  });
  const spotted = detectRecurring(historyRows(ctx.all), ctx.ref.bills || []).slice(0, 8);
  const suggestions = spotted.map((r) => h('div', { class: 'billrow' },
    h('span', { class: 'muted small' }, `${r.months} months`), h('span', null, r.name, h('span', { class: 'muted small' }, ` · usually ${formatPence(r.amount_pence)}, last ${shortDay(r.last)}`)),
    h('button', { class: 'btn', type: 'button', onclick: async (e) => {
      const next = (() => { const d = new Date(`${ctx.today}T12:00:00Z`); d.setUTCDate(Math.min(r.day, 28)); if (d.toISOString().slice(0, 10) < ctx.today) d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
      try { const saved = await saveBill({ name: r.name, amount_pence: r.amount_pence, cadence: 'monthly', next_date: next, match: r.key, is_active: true }); ctx.ref.bills = [...ctx.ref.bills, saved]; rerender(); } catch (err) { alertLine(e.target, err.message); }
    } }, 'Add as bill')));

  return h('div', { class: 'page' },
    head('Budgets', 'Buckets, categories, leftovers and bills. Set each payday’s amounts on the Payday plan page.', h('a', { href: '#plan', class: 'btn primary tap' }, 'Payday plan')),
    h('section', { class: 'card', 'aria-labelledby': 'rs' },
      h('h2', { id: 'rs' }, 'Reserve'),
      h('div', { class: 'planrow' }, h('span', { class: 'muted small' }, 'Kept back from safe to spend. Your £25 Ulster buffer doesn’t need to be here, since it isn’t budget money.'), h('span'), reserve)),
    h('div', { class: 'grid2' }, bucketCards),
    h('section', { class: 'card', 'aria-labelledby': 'bl' },
      h('h2', { id: 'bl' }, 'Bills'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Name, amount, next date, and the words in the bank line that show it’s been paid. Bills come out of Essentials.'),
      bills.length ? bills : h('p', { class: 'muted' }, 'No bills yet.'),
      spotted.length ? [h('h3', { class: 'small-h', style: { marginTop: '18px' } }, 'Regular payments that aren’t on your list'), suggestions] : null));
}
