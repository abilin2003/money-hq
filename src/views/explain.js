// "Explain in my own words" on a review inbox line: type what happened, see what Money HQ understood as changes
// you can edit, then confirm. Nothing is saved until you press Confirm. Reading the words uses fixed rules
// (src/lib/interpret.js), not AI: it matches your categories, funds, accounts and people, and asks about the rest.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { shortDay, alertLine } from '../ui/parts.js';
import { updateTransaction, enrich, addPerson, addSplit } from '../lib/data.js';
import { interpretExplanation } from '../lib/interpret.js';

const KINDS = {
  out: [['spend', 'Spending'], ['transfer', 'Move between my accounts'], ['saved', 'Saved (sinking fund)'], ['invested', 'Invested']],
  in: [['repayment', 'A friend paying me back'], ['refund', 'Refund'], ['income', 'Income'], ['transfer', 'Move between my accounts'], ['invested', 'Taken out of investments']],
};

// Your words become the note; a question Money HQ left in the note is replaced by your answer.
export const noteWithAnswer = (old, words) => (!old || /^Question:/.test(old) ? words : `${words} (${old})`);

export function explainPanel(ctx, t, { waiting, vocab, rerender, extras = [] }) {
  const wrap = h('div', { class: 'explain', hidden: true });
  const box = h('textarea', { class: 'input', rows: 3, 'aria-label': `Explain ${t.raw_description} in your own words`, placeholder: 'e.g. This was my Bulgaria flight, paid on Capital One, out of my Bulgaria holiday fund' });
  const result = h('div', { class: 'understood', 'aria-live': 'polite' });
  const read = h('button', { class: 'btn primary', type: 'button', onclick: () => show() }, 'Work it out');
  const cancel = h('button', { class: 'linkbtn', type: 'button', onclick: () => { wrap.hidden = true; toggle.hidden = false; } }, 'Cancel');
  const ask = h('div', { class: 'explain-ask' }, box, h('div', { class: 'explain-btns' }, ...extras.map((x) => x(box)), read, cancel));
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
    const fundSel = h('select', { class: 'input', 'aria-label': 'Paid for by' },
      h('option', { value: '' }, 'This cycle’s budget'),
      (ctx.ref.funds || []).map((f) => h('option', { value: f.id, selected: r.changes.from_savings && f.id === r.changes.fund_id }, `Savings: ${f.name}`)),
      h('option', { value: 'savings', selected: r.changes.from_savings && !r.changes.fund_id }, 'Savings (no particular fund)'));
    const tagIn = h('input', { class: 'input', value: r.changes.tag || t.tag || '', 'aria-label': 'For (tag)', placeholder: 'e.g. Bulgaria holiday' });
    let lastFundName = r.changes.fund_id ? (ctx.ref.funds || []).find((f) => f.id === r.changes.fund_id)?.name : null;
    fundSel.addEventListener('change', () => { const f = (ctx.ref.funds || []).find((x) => x.id === fundSel.value); if (f && (!tagIn.value || tagIn.value === lastFundName)) tagIn.value = f.name; lastFundName = f?.name || lastFundName; });
    const accSel = r.changes.account_id ? h('select', { class: 'input', 'aria-label': 'Paid with' }, ctx.ref.accounts.filter((a) => a.is_active !== false).map((a) => h('option', { value: a.id, selected: a.id === r.changes.account_id }, a.name))) : null;
    const splits = r.splits.map((s) => ({ ...s, on: h('input', { type: 'checkbox', checked: true, 'aria-label': `${s.name} owes you ${formatPence(s.pence)}` }) }));
    const also = r.alsoApply.map((o) => ({ o, on: h('input', { type: 'checkbox', checked: true, 'aria-label': `Also apply to ${o.raw_description}` }) }));
    const row = (label, control, why) => h('div', { class: 'u-row' }, h('span', { class: 'u-label' }, label), control, why ? h('span', { class: 'u-why muted small' }, why) : h('span'));
    const why = (field) => r.understood.find((u) => u.field === field)?.why;

    const confirm = h('button', { class: 'btn primary', type: 'button', onclick: () => apply() }, 'Confirm and apply');
    const edit = h('button', { class: 'btn', type: 'button', onclick: () => { result.replaceChildren(); ask.hidden = false; box.focus(); } }, 'Change my words');
    const reject = h('button', { class: 'linkbtn', type: 'button', onclick: () => { result.replaceChildren(h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Nothing changed. Choose from the menu above, or change your words.')); ask.hidden = false; } }, 'Not right');

    result.replaceChildren(...[
      h('p', { class: 'u-title' }, 'Here’s what I understood:'),
      h('p', { class: 'muted small u-orig' }, `${t.raw_description} · ${formatPence(Math.abs(t.amount_pence))} ${out ? 'out' : 'in'} · ${t.accountName || ''} · ${shortDay(t.date)}`),
      r.understood.some((u) => u.field === 'account') ? h('p', { class: 'muted small u-orig' }, `Paid with ${r.understood.find((u) => u.field === 'account').value}: matches this line.`) : null,
      row('Type', kindSel, why('kind')),
      row('Category', catSel, why('category_id') || (r.understood.find((u) => u.field === 'bucket') ? `in your ${r.understood.find((u) => u.field === 'bucket').value} budget?` : null)),
      out ? row('Paid for by', fundSel, why('from_savings')) : null,
      row('For', tagIn, why('tag')),
      accSel ? row('Paid with', accSel, why('account_id')) : null,
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
      const fromSavings = out && k === 'spend' && Boolean(fundSel.value);
      const patch = { kind: k, category_id: needsCat ? catSel.value : null, from_savings: fromSavings, tag: tagIn.value.trim() || null, status: 'reviewed' };
      if (accSel) patch.account_id = accSel.value;
      confirm.disabled = true;
      confirm.textContent = 'Saving…';
      try {
        ctx.replace(enrich(await updateTransaction(t.id, { ...patch, note: noteWithAnswer(t.note, words) }), ctx.ref));
        for (const s of splits.filter((x) => x.on.checked)) {
          const person = ctx.ref.people.find((p) => p.name.toLowerCase() === s.name.toLowerCase()) || await addPerson(s.name);
          if (!ctx.ref.people.some((p) => p.id === person.id)) ctx.ref.people.push(person);
          ctx.ref.splits.push(await addSplit({ transaction_id: t.id, person_id: person.id, amount_pence: s.pence }));
        }
        const { account_id, ...shared } = patch;
        for (const { o, on } of also) if (on.checked) ctx.replace(enrich(await updateTransaction(o.id, { ...shared, note: noteWithAnswer(o.note, `Same as ${t.raw_description}: ${words}`) }), ctx.ref));
        ctx.refresh();
        rerender();
      } catch (err) { confirm.disabled = false; confirm.textContent = 'Confirm and apply'; alertLine(confirm, err.message); }
    }
  }
  return { toggle, panel: wrap };
}
