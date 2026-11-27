// "Explain in my own words" on a review inbox line: type what happened, see what Money HQ understood as changes
// you can edit, then confirm. Nothing is saved until you press Confirm. Reading the words uses fixed rules
// (src/lib/interpret.js), not AI: it matches your categories, funds, accounts and people, and asks about the rest.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { alertLine } from '../ui/parts.js';
import { updateTransaction, enrich } from '../lib/data.js';
import { reviewFields, saveReviewed } from './review-edit.js';
import { interpretExplanation } from '../lib/interpret.js';
import { micButton } from '../ui/voice.js';

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
    const hints = Object.fromEntries(r.understood.map((u) => [u.field === 'account' ? 'account_id' : u.field, u.field === 'account' ? 'matches what you said' : u.why]));
    const bucket = r.understood.find((u) => u.field === 'bucket');
    if (bucket && !hints.category_id) hints.category_id = `in your ${bucket.value} budget?`;
    // The same editor as "Edit & approve", filled from what was understood. Every field can still be changed.
    const ed = reviewFields(ctx, t, { ...r.changes, splits: r.splits }, hints);
    const also = r.alsoApply.map((o) => ({ o, on: h('input', { type: 'checkbox', checked: true, 'aria-label': `Also apply to ${o.raw_description}` }) }));

    const confirm = h('button', { class: 'btn primary', type: 'button', onclick: () => apply() }, 'Confirm and apply');
    const edit = h('button', { class: 'btn', type: 'button', onclick: () => { result.replaceChildren(); ask.hidden = false; box.focus(); } }, 'Change my words');
    const reject = h('button', { class: 'linkbtn', type: 'button', onclick: () => { result.replaceChildren(h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Nothing changed. Choose from the menu above, or change your words.')); ask.hidden = false; } }, 'Not right');

    result.replaceChildren(...[
      h('p', { class: 'u-title' }, 'Here’s what I understood:'),
      ...ed.rows,
      also.length ? h('div', { class: 'u-row' }, h('span', { class: 'u-label' }, 'Also'), h('div', { class: 'u-list' }, also.map(({ o, on }) => h('label', { class: 'check' }, on, `${o.raw_description} (${formatPence(Math.abs(o.amount_pence))})`))), h('span', { class: 'u-why muted small' }, 'same answer: type, category, fund and tag')) : null,
      r.questions.length ? h('ul', { class: 'u-questions' }, r.questions.map((q) => h('li', null, q))) : null,
      h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Your words are kept as the note.'),
      h('div', { class: 'explain-btns' }, confirm, edit, reject)].filter(Boolean)); // replaceChildren would print null
    ask.hidden = true;

    async function apply() {
      const bad = ed.problem();
      if (bad) { alertLine(confirm, bad); return; }
      const v = ed.read();
      confirm.disabled = true;
      confirm.textContent = 'Saving…';
      try {
        await saveReviewed(ctx, t, v, { note: noteWithAnswer(t.note, words) });
        // The same answer for similar waiting lines: how it's classified only, never their amounts or dates.
        const shared = { kind: v.kind, category_id: v.kind === 'spend' || v.kind === 'refund' ? v.category_id : null, from_savings: v.from_savings, fund_id: v.from_savings ? v.fund_id : null, tag: v.tag || null, status: 'reviewed' };
        for (const { o, on } of also) if (on.checked) ctx.replace(enrich(await updateTransaction(o.id, { ...shared, note: noteWithAnswer(o.note, `Same as ${t.raw_description}: ${words}`) }), ctx.ref));
        ctx.refresh();
        rerender();
      } catch (err) { confirm.disabled = false; confirm.textContent = 'Confirm and apply'; alertLine(confirm, err.message); }
    }
  }
  return { toggle, panel: wrap };
}
