// Bills (Planning): your regular bills, and regular payments Money HQ has spotted that aren't on the list yet.
// Moved here from Budgets in Phase 2; it works the same.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { detectRecurring, upcomingBills } from '../lib/budget.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { saveBill } from '../lib/data.js';
import { historyRows } from './history.js';

export function billsPage(ctx, rerender) {
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
  const soon = upcomingBills(ctx.ref.bills || [], ctx.today, 31, ctx.transactions);
  const active = (ctx.ref.bills || []).filter((b) => b.is_active !== false);

  return h('div', { class: 'page' },
    head('Bills', active.length ? `${active.length} regular bill${active.length === 1 ? '' : 's'}, ${formatPence(soon.reduce((a, b) => a + b.amount_pence, 0))} due in the next 31 days. Bills come out of Essentials.` : 'Add your regular bills so safe to spend can set money aside for them.'),
    soon.length ? h('section', { class: 'card', 'aria-labelledby': 'bn' },
      h('h2', { id: 'bn' }, 'Coming up'),
      soon.map((b) => h('div', { class: 'billrow' }, h('span', { class: b.date === ctx.today ? 'today' : 'muted' }, b.date === ctx.today ? 'Today' : shortDay(b.date)), h('span', null, b.name), h('span', { class: 'r' }, formatPence(b.amount_pence))))) : null,
    h('section', { class: 'card', 'aria-labelledby': 'bl' },
      h('h2', { id: 'bl' }, 'Your bills'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Name, amount, next date, and the words in the bank line that show it’s been paid.'),
      bills.length ? bills : h('p', { class: 'muted' }, 'No bills yet.'),
      spotted.length ? [h('h3', { class: 'small-h', style: { marginTop: '18px' } }, 'Regular payments that aren’t on your list'), suggestions] : null));
}
