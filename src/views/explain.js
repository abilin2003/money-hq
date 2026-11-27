// "Explain in my own words" on a review inbox line: type what happened, see what Money HQ understood as changes
// you can edit, then confirm. Nothing is saved until you press Confirm. Reading the words uses fixed rules
// (src/lib/interpret.js), not AI: it matches your categories, funds, accounts and people, and asks about the rest.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { fundSelect, readFund } from '../ui/fund-picker.js';
import { shortDay, alertLine } from '../ui/parts.js';
import { updateTransaction, enrich, addPerson, addSplit } from '../lib/data.js';
import { interpretExplanation } from '../lib/interpret.js';
import { micButton } from '../ui/voice.js';

const KINDS = {
  out: [['spend', 'Spending'], ['transfer', 'Move between my accounts'], ['saved', 'Saved (sinking fund)'], ['invested', 'Invested']],
  in: [['repayment', 'A friend paying me back'], ['refund', 'Refund'], ['income', 'Income'], ['transfer', 'Move between my accounts'], ['invested', 'Taken out of investments']],
};

// Your words become the note; a question Money HQ left in the note is replaced by your answer.
export const noteWithAnswer = (old, words) => (!old || /^Question:/.test(old) ? words : `${words} (${old})`);

export function explainPanel(ctx, t, { waiting, vocab, rerender }) {
  const wrap = h('div', { class: 'explain', hidden: true });
  const box = h('textarea', { class: 'input', rows: 3, 'aria-label': `Explain ${t.raw_description} in your own words`, placeholder: 'e.g. This was my Bulgaria flight, paid on Capital One, out of my Bulgaria holiday fund' });
  const result = h('div', { class: 'understood', 'aria-live': 'polite' });
  const read = h('button', { class: 'btn primary', type: 'button', onclick: () => show() }, 'Work it out');
  const cancel = h('button', { class: 'linkbtn', type: 'button', onclick: () => { wrap.hidden = true; toggle.hidden = false; } }, 'Cancel');
  // Speak instead of typing: when you stop, it works out what you said straight away.
  const mic = micButton(box, { onStop: () => { if (box.value.trim()) show(); } });
  const ask = h('div', { class: 'explain-ask' }, box, h('div', { class: 'explain-btns' }, mic?.button, read, cancel), mic?.status);
  wrap.append(ask, result);
  const toggle = h('button', { class: 'linkbtn explain-toggle', type: 'button', 'aria-expanded': 'false', onclick: () => { wrap.hidden = false; toggle.hidden = true; box.focus(); } }, 'Explain in my own words');

  function show() {
    const words = box.value.trim();
    if (!words) { alertLine(read, 'Type what this was first.'); return; }
    const r = interpretExplanation(words, t, vocab, waiting);
    const out = t.amount_pence < 0;
    const kind = r.changes.kind || (out ? 'spend' : t.kind);

    // Editable proposal, filled from what was understood.
    const kindSel = h('select', { class: 'input', 'aria-label': 'Type' }, KINDS[out ? 'out' : 'in'].map(([v, l]) => h('option', { value: v, selected: v === kind }, l)));
    const catSel = h('select', { class: 'input', 'aria-label': 'Category' }, h('option', { value: '' }, 'Choose…'),
      ctx.ref.buckets.map((b) => h('optgroup', { label: b.name }, ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: c.id, selected: c.id === (r.changes.category_id || t.category_id) }, c.name)))));
    const fromSavings0 = r.changes.from_savings ?? t.from_savings;
    const fund0 = r.changes.fund_id || (fromSavings0 ? t.fund_id : null);
    const fundSel = fundSelect(ctx, { fromSavings: fromSavings0, fundId: fund0 });
    const tagIn = h('input', { class: 'input', value: r.changes.tag || t.tag || '', 'aria-label': 'For (tag)', placeholder: 'e.g. Bulgaria holiday' });
    // Every detail of the line can be corrected here too: where, how much, when, and what paid for it.
    const descIn = h('input', { class: 'input', value: t.raw_description || '', 'aria-label': 'Description' });
    const amountIn = h('input', { class: 'input money', inputmode: 'decimal', value: (Math.abs(t.amount_pence) / 100).toFixed(2), 'aria-label': 'Amount' });
    const dateIn = h('input', { class: 'input', type: 'date', value: t.date, 'aria-label': 'Date' });
    const accSel = h('select', { class: 'input', 'aria-label': out ? 'Paid with' : 'Into' }, ctx.ref.accounts.filter((a) => a.is_active !== false).map((a) => h('option', { value: a.id, selected: a.id === (r.changes.account_id || t.account_id) }, a.name)));
    const splits = r.splits.map((s) => ({ ...s, on: h('input', { type: 'checkbox', checked: true, 'aria-label': `${s.name} owes you ${formatPence(s.pence)}` }) }));
    const also = r.alsoApply.map((o) => ({ o, on: h('input', { type: 'checkbox', checked: true, 'aria-label': `Also apply to ${o.raw_description}` }) }));
    const row = (label, control, why) => h('div', { class: 'u-row' }, h('span', { class: 'u-label' }, label), control, why ? h('span', { class: 'u-why muted small' }, why) : h('span'));
    const why = (field) => r.understood.find((u) => u.field === field)?.why;

    const confirm = h('button', { class: 'btn primary', type: 'button', onclick: () => apply() }, 'Confirm and apply');
    const edit = h('button', { class: 'btn', type: 'button', onclick: () => { result.replaceChildren(); ask.hidden = false; box.focus(); } }, 'Change my words');
    const reject = h('button', { class: 'linkbtn', type: 'button', onclick: () => { result.replaceChildren(h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Nothing changed. Choose from the menu above, or change your words.')); ask.hidden = false; } }, 'Not right');

    result.replaceChildren(...[
      h('p', { class: 'u-title' }, 'Here’s what I understood:'),
      h('p', { class: 'muted small u-orig' }, `Was: ${t.raw_description} · ${formatPence(Math.abs(t.amount_pence))} ${out ? 'out' : 'in'} · ${t.accountName || ''} · ${shortDay(t.date)}`),
      row('Description', descIn),
      row('Amount', amountIn, out ? 'money out' : 'money in'),
      row('Date', dateIn),
      row(out ? 'Paid with' : 'Into', accSel, why('account_id') || (r.understood.some((u) => u.field === 'account') ? 'matches what you said' : null)),
      row('Type', kindSel, why('kind')),
      row('Category', catSel, why('category_id') || (r.understood.find((u) => u.field === 'bucket') ? `in your ${r.understood.find((u) => u.field === 'bucket').value} budget?` : null)),
      out ? row('Paid for by', fundSel, why('from_savings')) : null,
      row('For', tagIn, why('tag')),
      splits.length ? row('Owes you', h('div', { class: 'u-list' }, splits.map((s) => h('label', { class: 'check' }, s.on, `${s.name} ${formatPence(s.pence)}`))), 'only your share counts as spending') : null,
      also.length ? row('Also', h('div', { class: 'u-list' }, also.map(({ o, on }) => h('label', { class: 'check' }, on, `${o.raw_description} (${formatPence(Math.abs(o.amount_pence))})`))), 'same answer: type, category, fund and tag') : null,
      r.questions.length ? h('ul', { class: 'u-questions' }, r.questions.map((q) => h('li', null, q))) : null,
      h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Your words are kept as the note.'),
      h('div', { class: 'explain-btns' }, confirm, edit, reject)].filter(Boolean)); // replaceChildren would print null
    ask.hidden = true;

    async function apply() {
      const k = kindSel.value;
      const needsCat = k === 'spend' || k === 'refund';
      if (needsCat && !catSel.value) { alertLine(confirm, 'Choose a category (or press Not sure above).'); return; }
      const pence = parsePence(amountIn.value);
      if (!pence || pence <= 0) { alertLine(confirm, 'Type the amount, e.g. 42.00.'); return; }
      if (!dateIn.value) { alertLine(confirm, 'Choose the date.'); return; }
      const paid = readFund(fundSel, out && k === 'spend');
      const patch = { kind: k, category_id: needsCat ? catSel.value : null, ...paid, tag: tagIn.value.trim() || null, status: 'reviewed' };
      // Only what you changed about the line itself is saved, so nothing else is touched.
      const line = {};
      if (descIn.value.trim() && descIn.value.trim() !== t.raw_description) line.raw_description = descIn.value.trim();
      if (pence !== Math.abs(t.amount_pence)) line.amount_pence = out ? -pence : pence;
      if (dateIn.value !== t.date) line.date = dateIn.value;
      if (accSel.value !== t.account_id) line.account_id = accSel.value;
      confirm.disabled = true;
      confirm.textContent = 'Saving…';
      try {
        ctx.replace(enrich(await updateTransaction(t.id, { ...patch, ...line, note: noteWithAnswer(t.note, words) }), ctx.ref));
        for (const s of splits.filter((x) => x.on.checked)) {
          const person = ctx.ref.people.find((p) => p.name.toLowerCase() === s.name.toLowerCase()) || await addPerson(s.name);
          if (!ctx.ref.people.some((p) => p.id === person.id)) ctx.ref.people.push(person);
          ctx.ref.splits.push(await addSplit({ transaction_id: t.id, person_id: person.id, amount_pence: s.pence }));
        }
        for (const { o, on } of also) if (on.checked) ctx.replace(enrich(await updateTransaction(o.id, { ...patch, note: noteWithAnswer(o.note, `Same as ${t.raw_description}: ${words}`) }), ctx.ref));
        ctx.refresh();
        rerender();
      } catch (err) { confirm.disabled = false; confirm.textContent = 'Confirm and apply'; alertLine(confirm, err.message); }
    }
  }
  return { toggle, panel: wrap };
}
