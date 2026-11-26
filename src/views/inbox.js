// Review inbox: lines Money HQ wasn't sure about. Pick what each one is, then approve.
// "Always do this for <shop>" saves a rule and sorts the other waiting lines from that shop too.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { merchantKey, normKey } from '../lib/text.js';
import { head, dayLabel, alertLine } from '../ui/parts.js';
import { updateTransaction, addLearnedRule, enrich } from '../lib/data.js';
import { historyRows } from './history.js';

// Everything still undecided: current lines and older (archived) history, minus the bank's duplicate copy of
// the fresh-start month. Newest first.
export const waitingLines = (all) => historyRows(all).filter((t) => t.status === 'needs_review').sort((a, b) => b.date.localeCompare(a.date));

const KINDS_OUT = [['kind:transfer', 'Move between my accounts'], ['kind:invested', 'Invested'], ['kind:saved', 'Saved (sinking fund)']];
const KINDS_IN = [['kind:repayment', 'A friend paying me back'], ['kind:income', 'Income (salary, freelance)'], ['kind:invested', 'Taken out of an ISA or investments'], ['kind:transfer', 'Move between my accounts']];

function choiceOptions(ctx, t) {
  const groups = ctx.ref.buckets.map((b) => h('optgroup', { label: t.amount_pence < 0 ? b.name : `Refund: ${b.name}` },
    ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: `cat:${c.id}`, selected: c.id === t.category_id && ['spend', 'refund'].includes(t.kind) }, c.name))));
  const kinds = (t.amount_pence < 0 ? KINDS_OUT : KINDS_IN).map(([v, l]) => h('option', { value: v, selected: v === `kind:${t.kind}` && !t.category_id }, l));
  return [h('option', { value: '', selected: !t.category_id && !['transfer', 'invested', 'saved', 'income', 'repayment'].includes(t.kind) }, 'Choose…'), h('optgroup', { label: 'Not spending' }, kinds), ...groups];
}

// "cat:<id>" -> spend (or refund for money in) in that category; "kind:transfer" -> that kind, no category.
export function decode(value, amount_pence) {
  if (value.startsWith('cat:')) return { kind: amount_pence < 0 ? 'spend' : 'refund', category_id: value.slice(4) };
  if (value.startsWith('kind:')) return { kind: value.slice(5), category_id: null };
  return null;
}

export function inboxPage(ctx, rerender) {
  const waiting = waitingLines(ctx.all);
  const current = waiting.filter((t) => !t.archived);
  const older = waiting.filter((t) => t.archived);

  const card = (t) => {
    const key = merchantKey(t.raw_description) || normKey(t.raw_description);
    const select = h('select', { class: 'input', 'aria-label': `What is ${t.raw_description}?` }, choiceOptions(ctx, t));
    const always = h('input', { type: 'checkbox', id: `al-${t.id}` });
    const approve = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const choice = decode(select.value, t.amount_pence);
      if (!choice) { alertLine(approve, 'Choose what this is first.'); return; }
      approve.disabled = true;
      approve.textContent = 'Saving…';
      try {
        const targets = [t];
        if (always.checked && key) {
          const rule = await addLearnedRule(key, t.amount_pence < 0 ? 'out' : 'in', { kind: choice.kind, category: ctx.ref.categories.find((c) => c.id === choice.category_id)?.name || null });
          ctx.ref.rules.push(rule);
          // The rule also sorts the other waiting lines from the same shop, going the same way.
          targets.push(...waiting.filter((o) => o.id !== t.id && Math.sign(o.amount_pence) === Math.sign(t.amount_pence) && (merchantKey(o.raw_description) || normKey(o.raw_description)) === key));
        }
        for (const x of targets) {
          const saved = await updateTransaction(x.id, { ...choice, status: 'reviewed' });
          ctx.replace(enrich(saved, ctx.ref));
        }
        rerender();
      } catch (err) {
        approve.disabled = false;
        approve.textContent = 'Approve';
        alertLine(approve, err.message);
      }
    } }, 'Approve');
    return h('div', { class: 'inbox-row' },
      h('div', { class: 'inbox-what' },
        h('span', { class: 'desc' }, t.raw_description || '(no description)'),
        h('span', { class: 'muted small' }, `${dayLabel(t.date)} · ${t.accountName}${t.note ? ` · ${t.note}` : ''}`)),
      h('span', { class: `amt${t.amount_pence > 0 ? ' in' : ''}` }, `${t.amount_pence > 0 ? '+' : ''}${formatPence(Math.abs(t.amount_pence))}`),
      h('div', { class: 'inbox-act' },
        select,
        key ? h('label', { class: 'check', for: `al-${t.id}` }, always, `Always do this for “${key}”`) : null,
        approve));
  };

  return h('div', { class: 'page' },
    head('Review inbox', waiting.length ? `${waiting.length} line${waiting.length === 1 ? '' : 's'} waiting. They aren't counted in any totals until you approve them.` : 'Nothing to review.'),
    ctx.oldIous ? h('section', { class: 'card notice-card' }, h('p', { style: { margin: 0 } }, `Also needs attention: ${ctx.oldIous} IOU${ctx.oldIous === 1 ? '' : 's'} older than 30 days. `, h('a', { href: '#people', class: 'tap' }, 'See who owes you'))) : null,
    h('section', { class: 'card', 'aria-label': 'Lines to review' },
      current.length ? current.map(card) : h('p', { class: 'muted', style: { margin: 0 } }, older.length ? 'Nothing new from your latest imports.' : 'The inbox is clear. Import new statements and anything Money HQ isn’t sure about lands here.')),
    older.length ? h('section', { class: 'card', 'aria-label': 'Older lines to review' },
      h('h2', null, `From your older records (${older.length})`),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Lines from before your fresh start that were never decided. Once approved they count in History and Trends.'),
      older.map(card)) : null);
}
