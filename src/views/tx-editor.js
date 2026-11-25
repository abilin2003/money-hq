// Editing one transaction: what it is, a note, a tag, splitting it with friends (only your share counts as
// spending), and linking money in to an IOU it pays back.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { equalShares, suggestIouMatches } from '../lib/analytics.js';
import { shortDay, alertLine } from '../ui/parts.js';
import { updateTransaction, enrich, addPerson, addSplit, removeSplit, settleSplit, deleteTransaction } from '../lib/data.js';
import { decode } from './inbox.js';

const KINDS_OUT = [['kind:transfer', 'Move between my accounts'], ['kind:invested', 'Invested'], ['kind:saved', 'Saved (sinking fund)']];
const KINDS_IN = [['kind:repayment', 'A friend paying me back'], ['kind:income', 'Income (salary, freelance, gift)'], ['kind:transfer', 'Move between my accounts']];

export function choiceSelect(ctx, t, label = 'What is it?') {
  const groups = ctx.ref.buckets.map((b) => h('optgroup', { label: t.amount_pence < 0 ? b.name : `Refund: ${b.name}` },
    ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: `cat:${c.id}`, selected: c.id === t.category_id && ['spend', 'refund'].includes(t.kind) }, c.name))));
  const kinds = (t.amount_pence < 0 ? KINDS_OUT : KINDS_IN).map(([v, l]) => h('option', { value: v, selected: v === `kind:${t.kind}` && !t.category_id }, l));
  return h('select', { class: 'input', 'aria-label': label }, h('option', { value: '' }, 'Choose…'), h('optgroup', { label: 'Not spending' }, kinds), ...groups);
}

export function txEditor(ctx, t, rerender) {
  const txById = Object.fromEntries(ctx.all.map((x) => [x.id, x]));
  const personName = (id) => ctx.ref.people.find((p) => p.id === id)?.name || 'Someone';
  const mySplits = ctx.ref.splits.filter((s) => s.transaction_id === t.id);
  const kind = choiceSelect(ctx, t);
  const note = h('input', { class: 'input', value: t.note || '', placeholder: 'Note', 'aria-label': 'Note' });
  const tag = h('input', { class: 'input', value: t.tag || '', placeholder: 'Tag, e.g. Cousins visit', 'aria-label': 'Tag or event' });
  const savings = h('input', { type: 'checkbox', checked: Boolean(t.from_savings) });
  const save = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const choice = kind.value ? decode(kind.value, t.amount_pence) : null;
    save.disabled = true;
    try {
      const saved = await updateTransaction(t.id, { ...(choice || {}), note: note.value.trim() || null, tag: tag.value.trim() || null, from_savings: t.amount_pence < 0 && savings.checked, status: choice || t.status === 'reviewed' ? 'reviewed' : t.status });
      ctx.replace(enrich(saved, ctx.ref));
      rerender();
    } catch (err) { save.disabled = false; alertLine(save, err.message); }
  } }, 'Save');

  const parts = [h('div', { class: 'edit-grid' }, kind, note, tag, save)];
  if (t.amount_pence < 0) parts.push(h('label', { class: 'check' }, savings, 'Paid from savings or a pot (shown separately, not counted in this cycle)'));

  // ---- split (money out only)
  if (t.amount_pence < 0 && t.kind === 'spend') {
    const yours = -t.amount_pence - mySplits.reduce((a, s) => a + s.amount_pence, 0);
    const who = h('input', { class: 'input', placeholder: 'Friend’s name', 'aria-label': 'Split with', list: 'people-list' });
    const amt = h('input', { class: 'input money', inputmode: 'decimal', placeholder: (equalShares(t.amount_pence, 1)[0] / 100).toFixed(2), 'aria-label': 'Their share' });
    const many = h('input', { class: 'input', type: 'number', min: '1', max: '20', value: '1', 'aria-label': 'Number of friends for an equal split', style: { width: '80px' } });
    const add = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const names = who.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (!names.length) { alertLine(add, 'Type a name (or several, separated by commas).'); return; }
      const each = amt.value.trim() ? parsePence(amt.value) : equalShares(t.amount_pence, Math.max(names.length, +many.value || 1))[0];
      if (!each || each <= 0) { alertLine(add, 'Type their share, e.g. 20.00.'); return; }
      try {
        for (const name of names) {
          const person = ctx.ref.people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || await addPerson(name);
          if (!ctx.ref.people.some((p) => p.id === person.id)) ctx.ref.people.push(person);
          ctx.ref.splits.push(await addSplit({ transaction_id: t.id, person_id: person.id, amount_pence: each }));
        }
        ctx.refresh();
        rerender();
      } catch (err) { alertLine(add, err.message); }
    } }, 'Add split');
    parts.push(h('div', { class: 'split' },
      h('p', { class: 'small', style: { margin: '0 0 6px', fontWeight: 600 } }, `Split: your share ${formatPence(yours)}`),
      mySplits.map((s) => h('div', { class: 'billrow' }, h('span', { class: 'muted small' }, s.settled_by_transaction_id ? 'Paid' : 'Owes'), h('span', null, personName(s.person_id)), h('span', null, formatPence(s.amount_pence), ' ',
        h('button', { class: 'linkbtn', type: 'button', onclick: async () => { await removeSplit(s.id); ctx.ref.splits = ctx.ref.splits.filter((x) => x.id !== s.id); ctx.refresh(); rerender(); } }, 'Remove')))),
      h('div', { class: 'edit-grid' }, who, amt, h('label', { class: 'check' }, 'Equal split with', many, 'friend(s)'), add),
      h('datalist', { id: 'people-list' }, ctx.ref.people.map((p) => h('option', { value: p.name })))));
  }

  // ---- money in: link to an open IOU
  if (t.amount_pence > 0) {
    const open = ctx.ref.splits.filter((s) => !s.settled_by_transaction_id);
    const linked = ctx.ref.splits.filter((s) => s.settled_by_transaction_id === t.id);
    const suggested = suggestIouMatches(t, open, ctx.ref.people, txById);
    const pick = h('select', { class: 'input', 'aria-label': 'IOU this pays back' }, h('option', { value: '' }, 'Pays back an IOU…'),
      [...suggested, ...open.filter((s) => !suggested.includes(s))].map((s) => h('option', { value: s.id }, `${suggested.includes(s) ? '★ ' : ''}${personName(s.person_id)} · ${formatPence(s.amount_pence)} · ${txById[s.transaction_id]?.raw_description || ''} (${shortDay(txById[s.transaction_id]?.date || t.date)})`)));
    const link = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!pick.value) return;
      try {
        const saved = await settleSplit(pick.value, t.id);
        ctx.ref.splits = ctx.ref.splits.map((s) => (s.id === saved.id ? saved : s));
        if (t.kind !== 'repayment') ctx.replace(enrich(await updateTransaction(t.id, { kind: 'repayment', category_id: null, status: 'reviewed' }), ctx.ref));
        ctx.refresh();
        rerender();
      } catch (err) { alertLine(link, err.message); }
    } }, 'Link');
    parts.push(h('div', { class: 'split' },
      linked.length ? h('p', { class: 'small', style: { margin: '0 0 6px' } }, `Clears: ${linked.map((s) => `${personName(s.person_id)} ${formatPence(s.amount_pence)}`).join(', ')}`) : null,
      open.length ? h('div', { class: 'edit-grid' }, pick, link) : h('p', { class: 'muted small', style: { margin: 0 } }, 'No open IOUs to link.'),
      suggested.length ? h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, '★ matches the name and amount.') : null));
  }

  if (t.source === 'manual') {
    const del = h('button', { class: 'linkbtn', type: 'button', onclick: async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      try { await deleteTransaction(t.id); ctx.all = ctx.all.filter((x) => x.id !== t.id); ctx.refresh(); rerender(); } catch (err) { alertLine(del, err.message); }
    } }, 'Delete this entry');
    parts.push(del);
  }
  return h('div', { class: 'tx-edit' }, parts);
}
