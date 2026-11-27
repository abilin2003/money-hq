// IOUs: who owes you what, oldest first, and a simple way to record them paying you back.
// "Record repayment" asks how much, when, and which account it went into; it can be part of what they owe.
// A repayment is money paid back, never income, and it's counted once: if the payment is already in your
// records (typed or imported), choose it instead of recording a new one. A repayment you record now is matched
// to the bank line when you import the statement later, so it isn't counted again.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { dayDiff } from '../lib/dates.js';
import { peopleBalances } from '../lib/analytics.js';
import { allocateRepayment, repaymentCandidates } from '../lib/ious.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { settleSplit, settlePartOfSplit, updateTransaction, addTransaction, enrich } from '../lib/data.js';

export function peoplePage(ctx, rerender) {
  const txById = Object.fromEntries(ctx.all.map((t) => [t.id, t]));
  const people = peopleBalances(ctx.ref.splits || [], ctx.ref.people || [], txById);
  const total = people.reduce((a, p) => a + p.owed, 0);
  const st = ctx.iouState || (ctx.iouState = { open: null });
  const accounts = ctx.ref.accounts.filter((a) => a.is_active !== false && ['current', 'savings', 'credit_card'].includes(a.type));

  const iou = (s) => {
    const t = txById[s.transaction_id];
    const age = t ? dayDiff(t.date, ctx.today) : 0;
    return h('div', { class: 'iou' },
      h('span', null, h('span', null, t?.raw_description || 'Payment'), h('br'), h('span', { class: `small ${age > 30 ? 'warn' : 'muted'}` }, t ? `${shortDay(t.date)} · ${age} days ago` : '')),
      h('span', { class: 'r' }, formatPence(s.amount_pence)));
  };

  const form = (p) => {
    const amount = h('input', { class: 'input money', inputmode: 'decimal', value: (p.owed / 100).toFixed(2), 'aria-label': 'Amount received' });
    const date = h('input', { class: 'input', type: 'date', value: ctx.today, max: ctx.today, 'aria-label': 'Date received' });
    const into = h('select', { class: 'input', 'aria-label': 'Account it went into' }, h('option', { value: '' }, 'Choose the account…'),
      accounts.map((a) => h('option', { value: a.id, selected: a.id === ctx.lastRepayAccount }, a.name)));
    const note = h('input', { class: 'input', placeholder: 'Note (optional)', 'aria-label': 'Note' });
    // Optional: the payment is already in your records (e.g. imported). Only money in that could be it is listed.
    const found = repaymentCandidates(ctx.transactions, ctx.ref.splits || [], p, p.owed, ctx.today);
    const existing = found.length ? h('select', { class: 'input', 'aria-label': 'Already in your records', onchange: (e) => { const t = found.find((x) => x.id === e.target.value); if (t) { amount.value = (t.amount_pence / 100).toFixed(2); date.value = t.date; into.value = t.account_id; } } },
      h('option', { value: '' }, 'No: record a new repayment'),
      found.map((t) => h('option', { value: t.id }, `${t.named ? '★ ' : ''}${shortDay(t.date)} · ${t.raw_description} · ${formatPence(t.amount_pence)} · ${t.accountName}${t.status === 'needs_review' ? ' (in your inbox)' : ''}`))) : null;
    const confirm = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const pence = parsePence(amount.value);
      const plan = allocateRepayment(p.open.map((s) => ({ ...s, date: txById[s.transaction_id]?.date })), pence);
      if (plan.error) { alertLine(confirm, plan.error); return; }
      const use = existing?.value ? found.find((t) => t.id === existing.value) : null;
      if (!use && !into.value) { alertLine(confirm, 'Choose the account it went into.'); return; }
      if (!date.value) { alertLine(confirm, 'Choose the date.'); return; }
      confirm.disabled = true; confirm.textContent = 'Saving…';
      try {
        let tx;
        if (use) {
          // The payment you already have becomes this repayment (and leaves the inbox if it was waiting there).
          tx = enrich(await updateTransaction(use.id, { kind: 'repayment', category_id: null, status: 'reviewed', note: [use.note, note.value.trim()].filter(Boolean).join(' · ') || null }), ctx.ref);
          ctx.replace(tx);
        } else {
          tx = enrich(await addTransaction({ account_id: into.value, date: date.value, amount_pence: pence, raw_description: `${p.name}: paid back`, kind: 'repayment', category_id: null, note: note.value.trim() || null }), ctx.ref);
          ctx.add(tx);
          ctx.lastRepayAccount = into.value;
        }
        for (const id of plan.settle) { const saved = await settleSplit(id, tx.id); ctx.ref.splits = ctx.ref.splits.map((x) => (x.id === saved.id ? saved : x)); }
        if (plan.partial) {
          const split = ctx.ref.splits.find((x) => x.id === plan.partial.id);
          const [done, left] = await settlePartOfSplit(split, tx.id, plan.partial.paid, plan.partial.rest);
          ctx.ref.splits = [...ctx.ref.splits.map((x) => (x.id === done.id ? done : x)), left];
        }
        st.open = null;
        st.done = `${p.name} paid back ${formatPence(pence)}.${plan.owedAfter ? ` Still owes ${formatPence(plan.owedAfter)}.` : ' All settled.'}`;
        ctx.refresh();
        rerender();
      } catch (err) { confirm.disabled = false; confirm.textContent = 'Confirm'; alertLine(confirm, err.message); }
    } }, 'Confirm');
    return h('div', { class: 'repay-form' },
      h('p', { class: 'small', style: { margin: '0 0 8px' } }, `${p.name} owes ${formatPence(p.owed)}. Change the amount if they paid part of it.`),
      h('div', { class: 'repay-grid' },
        h('label', { class: 'field' }, 'Amount received', amount),
        h('label', { class: 'field' }, 'Date received', date),
        h('label', { class: 'field' }, 'Into', into),
        h('label', { class: 'field' }, 'Note', note)),
      existing ? h('label', { class: 'field', style: { marginTop: '8px' } }, 'Already in your records? (optional)', existing) : null,
      h('div', { class: 'explain-btns' }, confirm, h('button', { class: 'btn', type: 'button', onclick: () => { st.open = null; rerender(); } }, 'Cancel')));
  };

  return h('div', { class: 'page' },
    head('IOUs', people.length ? `${formatPence(total)} owed to you by ${people.length} ${people.length === 1 ? 'person' : 'people'}.` : 'Nobody owes you anything.'),
    st.done ? h('p', { class: 'chip', role: 'status' }, st.done) : null,
    people.length ? people.map((p) => h('section', { class: 'card', 'aria-label': p.name },
      h('div', { class: 'ch' }, h('h2', null, p.name), h('span', { style: { fontWeight: 600 } }, formatPence(p.owed))),
      p.open.map(iou),
      st.open === p.id ? form(p) : h('button', { class: 'btn', type: 'button', style: { marginTop: '10px' }, onclick: () => { st.open = p.id; st.done = null; rerender(); } }, 'Record repayment')))
      : h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'When you pay for a group, open the payment (Transactions, or the + button) and split it. Each friend’s share shows here until they pay you back.')));
}
