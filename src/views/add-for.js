// "Who is this purchase for?" on Add: my own spending (the default, no extra questions), someone else paying
// me back, or split between me and others. Only the chosen option's questions are shown, and switching doesn't
// reload the form, so nothing you've typed is lost. read() gives what planShares (src/lib/shares.js) needs.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { equalSplit, planShares } from '../lib/shares.js';

const money = (p) => (Number.isInteger(p) ? (p / 100).toFixed(2) : '');

// People you've shared costs with most recently first (for quick picking), then everyone else.
function recentPeople(ctx) {
  const date = Object.fromEntries(ctx.all.map((t) => [t.id, t.date]));
  const last = new Map();
  for (const s of ctx.ref.splits || []) { const d = date[s.transaction_id] || ''; if (!last.has(s.person_id) || d > last.get(s.person_id)) last.set(s.person_id, d); }
  return [...(ctx.ref.people || [])].sort((a, b) => (last.get(b.id) || '').localeCompare(last.get(a.id) || '') || a.name.localeCompare(b.name));
}

export function forPanel(ctx, st, totalOf) {
  const people = recentPeople(ctx);
  const quick = people.slice(0, 6);
  st.for = st.for || 'mine';

  // ---- someone else is paying me back
  const who = h('input', { class: 'input', placeholder: 'e.g. Dad', 'aria-label': 'Who owes you', list: 'people-list', autocomplete: 'off' });
  const owed = h('input', { class: 'input money', inputmode: 'decimal', placeholder: 'The whole amount', 'aria-label': 'Amount they owe you' });
  const due = h('input', { class: 'input', type: 'date', 'aria-label': 'Expected repayment date (optional)' });
  const reason = h('input', { class: 'input', placeholder: 'e.g. Christmas present for my brother', 'aria-label': 'What it was for (optional)' });
  const whoChips = quick.length ? h('div', { class: 'chips' }, quick.map((p) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { who.value = p.name; } }, p.name))) : null;
  const payback = h('div', { class: 'for-panel', hidden: st.for !== 'payback' },
    h('label', { class: 'field' }, 'Who owes you?', whoChips, who),
    h('div', { class: 'repay-grid' },
      h('label', { class: 'field' }, 'Amount they owe', owed),
      h('label', { class: 'field' }, 'Expected back by (optional)', due)),
    h('label', { class: 'field' }, 'What it was for (optional)', reason),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'The whole amount leaves your account; what they owe isn’t your spending and shows on IOUs until they pay you back.'));

  // ---- split between me and others
  const mine = h('input', { class: 'input money', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'My share' });
  const rows = h('div', { class: 'split-rows' });
  const summary = h('p', { class: 'small split-sum', 'aria-live': 'polite' });
  const addRow = (name = '', pence = null) => {
    const n = h('input', { class: 'input', value: name, placeholder: 'Name', 'aria-label': 'Their name', list: 'people-list', autocomplete: 'off' });
    const a = h('input', { class: 'input money', inputmode: 'decimal', value: money(pence), placeholder: '0.00', 'aria-label': 'Amount they owe' });
    const row = h('div', { class: 'split-row' }, n, a, h('button', { class: 'linkbtn', type: 'button', 'aria-label': 'Remove this person', onclick: () => { row.remove(); update(); } }, 'Remove'));
    for (const el of [n, a]) el.addEventListener('input', update);
    rows.append(row);
    return n;
  };
  const splitChips = quick.length ? h('div', { class: 'chips' }, quick.map((p) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { const empty = [...rows.querySelectorAll('.split-row')].find((r) => !r.children[0].value.trim()); if (empty) empty.children[0].value = p.name; else addRow(p.name); update(); } }, `+ ${p.name}`))) : null;
  const equal = h('button', { class: 'btn', type: 'button', onclick: () => {
    const total = totalOf();
    const list = [...rows.querySelectorAll('.split-row')];
    if (!total || !list.length) { summary.textContent = 'Type the amount and add the people first.'; return; }
    const s = equalSplit(total, list.length);
    mine.value = money(s.mine);
    list.forEach((r, i) => { r.children[1].value = money(s.each[i]); });
    update();
  } }, 'Split equally');
  const split = h('div', { class: 'for-panel', hidden: st.for !== 'split' },
    h('label', { class: 'field' }, 'My share', mine),
    h('div', { class: 'field' }, 'Who else owes a share', splitChips, rows),
    h('div', { class: 'explain-btns' }, h('button', { class: 'btn', type: 'button', onclick: () => { addRow().focus(); update(); } }, 'Add a person'), equal),
    summary);
  mine.addEventListener('input', update);
  addRow();

  function update() {
    if (st.for !== 'split') return;
    const total = totalOf();
    const parts = [parsePence(mine.value) || 0, ...[...rows.querySelectorAll('.split-row')].map((r) => parsePence(r.children[1].value) || 0)];
    const assigned = parts.reduce((x, y) => x + y, 0);
    summary.className = `small split-sum ${total && assigned === total ? 'good' : 'warn'}`;
    summary.textContent = !total ? 'Type the amount above.' : assigned === total ? `Adds up: ${formatPence(total)}.` : assigned < total ? `${formatPence(total - assigned)} of ${formatPence(total)} still to assign.` : `${formatPence(assigned - total)} more than the ${formatPence(total)} paid.`;
  }

  // ---- the question
  const opt = (id, label) => h('button', { type: 'button', 'aria-pressed': String(st.for === id), onclick: (e) => {
    st.for = id;
    e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    payback.hidden = id !== 'payback';
    split.hidden = id !== 'split';
    update();
  } }, label);
  const el = h('div', { class: 'field for-q' }, 'Who is this purchase for?',
    h('div', { class: 'seg wide for-seg', role: 'group', 'aria-label': 'Who is this purchase for?' }, opt('mine', 'My own spending'), opt('payback', 'Someone’s paying me back'), opt('split', 'Split with others')),
    payback, split);

  // What was answered, checked: { myShare, ious } or { error }.
  function read() {
    const total = totalOf();
    if (st.for === 'payback') return planShares(total, 'payback', { name: who.value, owed: owed.value.trim() ? parsePence(owed.value) : total, due: due.value || null, reason: reason.value.trim() || null });
    if (st.for === 'split') {
      return planShares(total, 'split', {
        myShare: mine.value.trim() ? parsePence(mine.value) : null,
        people: [...rows.querySelectorAll('.split-row')].filter((r) => r.children[0].value.trim() || r.children[1].value.trim()).map((r) => ({ name: r.children[0].value, pence: parsePence(r.children[1].value) })),
      });
    }
    return planShares(total, 'mine');
  }
  return { el, read, update };
}
