// IOUs: who owes you what, oldest first. A friend's repayment clears an IOU (and is never income).
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { dayDiff } from '../lib/dates.js';
import { peopleBalances, suggestIouMatches } from '../lib/analytics.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { settleSplit, updateTransaction, enrich } from '../lib/data.js';

export function peoplePage(ctx, rerender) {
  const txById = Object.fromEntries(ctx.all.map((t) => [t.id, t]));
  const people = peopleBalances(ctx.ref.splits || [], ctx.ref.people || [], txById);
  const total = people.reduce((a, p) => a + p.owed, 0);
  const moneyIn = ctx.transactions.filter((t) => t.amount_pence > 0 && t.kind !== 'income' && !(ctx.ref.splits || []).some((s) => s.settled_by_transaction_id === t.id)).slice(0, 60);

  const iou = (s) => {
    const t = txById[s.transaction_id];
    const suggestions = moneyIn.filter((m) => suggestIouMatches(m, [s], ctx.ref.people, txById).length);
    const pick = h('select', { class: 'input', 'aria-label': 'Repayment that clears this' }, h('option', { value: '' }, 'Paid back by…'),
      [...suggestions, ...moneyIn.filter((m) => !suggestions.includes(m))].slice(0, 40).map((m) => h('option', { value: m.id }, `${suggestions.includes(m) ? '★ ' : ''}${shortDay(m.date)} · ${m.raw_description} · ${formatPence(m.amount_pence)}`)));
    const btn = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!pick.value) return;
      try {
        const saved = await settleSplit(s.id, pick.value);
        ctx.ref.splits = ctx.ref.splits.map((x) => (x.id === saved.id ? saved : x));
        const m = txById[pick.value];
        if (m.kind !== 'repayment') ctx.replace(enrich(await updateTransaction(m.id, { kind: 'repayment', category_id: null, status: 'reviewed' }), ctx.ref));
        ctx.refresh();
        rerender();
      } catch (err) { alertLine(btn, err.message); }
    } }, 'Link');
    const age = t ? dayDiff(t.date, ctx.today) : 0;
    return h('div', { class: 'iou' },
      h('span', null, h('span', null, t?.raw_description || 'Payment'), h('br'), h('span', { class: `small ${age > 30 ? 'warn' : 'muted'}` }, t ? `${shortDay(t.date)} · ${age} days ago` : '')),
      h('span', { class: 'r' }, formatPence(s.amount_pence)),
      h('div', { class: 'edit-grid' }, pick, btn));
  };

  return h('div', { class: 'page' },
    head('IOUs', people.length ? `${formatPence(total)} owed to you by ${people.length} ${people.length === 1 ? 'person' : 'people'}.` : 'Nobody owes you anything.'),
    people.length ? people.map((p) => h('section', { class: 'card', 'aria-label': p.name },
      h('div', { class: 'ch' }, h('h2', null, p.name), h('span', { style: { fontWeight: 600 } }, formatPence(p.owed))),
      p.open.map(iou)))
      : h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'When you pay for a group, open the payment (Transactions, or the + button) and split it. Each friend’s share shows here until their repayment comes in.')));
}
