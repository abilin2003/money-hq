// Quick add (phone): amount, type, where, category, paid with, split, note. One tap from the home screen.
// Made for thumbs: your most-used categories are one tap, "Where" suggests recent shops and fills in the
// category you used there last, the account you paid with last time is remembered, and Save stays on screen.
import { h } from '../ui/dom.js';
import { parsePence } from '../lib/money.js';
import { addDays } from '../lib/dates.js';
import { equalShares } from '../lib/analytics.js';
import { head, alertLine } from '../ui/parts.js';
import { addTransaction, enrich, addPerson, addSplit } from '../lib/data.js';

export function addPage(ctx, rerender) {
  const st = ctx.addState || (ctx.addState = { type: 'out', date: ctx.today, saved: null });
  const account = ctx.ref.accounts.find((a) => a.id === ctx.lastAddAccount) || ctx.ref.accounts.find((a) => a.name === 'Revolut') || ctx.ref.accounts[0];
  // Recent shops (newest first) and the category last used at each; the categories you use most lately.
  const recent = ctx.transactions.filter((t) => t.kind === 'spend' && t.category_id && t.raw_description).slice(0, 400);
  const lastCat = new Map();
  for (const t of recent) if (!lastCat.has(t.raw_description.toLowerCase())) lastCat.set(t.raw_description.toLowerCase(), t.category_id);
  const counts = new Map();
  for (const t of recent.slice(0, 150)) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
  const topCats = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => ctx.ref.categories.find((c) => c.id === id && c.is_active)).filter(Boolean).slice(0, 6);
  const amount = h('input', { class: 'input money big-input', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Amount', autofocus: true, enterkeyhint: 'next' });
  const where = h('input', { class: 'input', placeholder: st.type === 'in' ? 'Who from, e.g. Kevin' : 'Where, e.g. Tesco', 'aria-label': 'Where', list: st.type === 'out' ? 'shop-list' : null, autocomplete: 'off', enterkeyhint: 'next',
    onchange: () => { const c = lastCat.get(where.value.trim().toLowerCase()); if (st.type === 'out' && c && !cat.value) { cat.value = c; markChips(); } } });
  const cat = h('select', { class: 'input', id: 'add-cat', 'aria-label': 'Category' }, h('option', { value: '' }, st.type === 'out' ? 'Category…' : 'What is it?'),
    st.type === 'out' ? ctx.ref.buckets.map((b) => h('optgroup', { label: b.name }, ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: c.id }, c.name))))
      : st.type === 'in' ? [['repayment', 'A friend paying me back'], ['income', 'Income'], ['refund', 'Refund']].map(([v, l]) => h('option', { value: v }, l)) : null);
  const paid = h('select', { class: 'input', 'aria-label': 'Paid with', onchange: (e) => { ctx.lastAddAccount = e.target.value; } }, ctx.ref.accounts.filter((a) => a.is_active !== false).map((a) => h('option', { value: a.id, selected: a.id === account?.id }, a.name)));
  const date = h('input', { class: 'input', type: 'date', value: st.date, 'aria-label': 'Date', onchange: (e) => { st.date = e.target.value; } });
  const split = h('input', { class: 'input', placeholder: 'Split with (names, commas)', 'aria-label': 'Split with', list: 'people-list' });
  const note = h('input', { class: 'input', placeholder: 'Note (optional)', 'aria-label': 'Note' });

  const chips = st.type === 'out' && topCats.length ? h('div', { class: 'chips quickcats', role: 'group', 'aria-label': 'Your most-used categories' },
    topCats.map((c) => h('button', { type: 'button', class: 'chip-btn', 'data-id': c.id, 'aria-pressed': 'false', onclick: () => { cat.value = c.id; markChips(); } }, c.name))) : null;
  const markChips = () => chips?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === cat.value)));
  cat.addEventListener('change', () => markChips());
  const typeBtn = (id, label) => h('button', { type: 'button', 'aria-pressed': String(st.type === id), onclick: () => { st.type = id; rerender(); } }, label);
  const dayBtn = (iso, label) => h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(st.date === iso), onclick: () => { st.date = iso; date.value = iso; rerender(); } }, label);

  async function save(another, btn) {
    const p = parsePence(amount.value);
    if (!p || p <= 0) { alertLine(btn, 'Type the amount, e.g. 4.50.'); amount.focus(); return; }
    if (!where.value.trim()) { alertLine(btn, 'Say where (or who from).'); where.focus(); return; }
    const out = st.type !== 'in';
    let kind = 'spend'; let category_id = null;
    if (st.type === 'out') { if (!cat.value) { alertLine(btn, 'Choose a category.'); return; } category_id = cat.value; }
    else if (st.type === 'in') { if (!cat.value) { alertLine(btn, 'Choose what it is.'); return; } kind = cat.value; }
    else kind = 'transfer';
    btn.disabled = true;
    try {
      const saved = await addTransaction({ account_id: paid.value, date: st.date, amount_pence: out ? -p : p, raw_description: where.value.trim(), kind, category_id, note: note.value.trim() || null });
      ctx.add(enrich(saved, ctx.ref));
      const names = split.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (names.length && kind === 'spend') {
        const each = equalShares(-p, names.length)[0];
        for (const name of names) {
          const person = ctx.ref.people.find((x) => x.name.toLowerCase() === name.toLowerCase()) || await addPerson(name);
          if (!ctx.ref.people.some((x) => x.id === person.id)) ctx.ref.people.push(person);
          ctx.ref.splits.push(await addSplit({ transaction_id: saved.id, person_id: person.id, amount_pence: each }));
        }
        ctx.refresh();
      }
      st.saved = `Saved ${where.value.trim()}.`;
      if (another) rerender(); else { ctx.addState = null; location.hash = 'overview'; }
    } catch (err) { btn.disabled = false; alertLine(btn, err.message); }
  }
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: (e) => save(false, e.currentTarget) }, 'Save');
  const againBtn = h('button', { class: 'btn', type: 'button', onclick: (e) => save(true, e.currentTarget) }, 'Save and add another');

  return h('div', { class: 'page narrow' },
    head('Add a transaction'),
    st.saved ? h('p', { class: 'chip', role: 'status' }, st.saved) : null,
    h('section', { class: 'card add-card' },
      h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Type' }, typeBtn('out', 'Spent'), typeBtn('in', 'Money in'), typeBtn('move', 'Move')),
      amount,
      h('label', { class: 'field' }, st.type === 'in' ? 'From' : 'Where', where),
      st.type !== 'move' ? h('div', { class: 'field' }, h('label', { for: 'add-cat' }, st.type === 'out' ? 'Category' : 'What is it?'), chips, cat) : null,
      h('label', { class: 'field' }, st.type === 'in' ? 'Into' : 'Paid with', paid),
      h('div', { class: 'field' }, 'When', h('div', { class: 'chips' }, dayBtn(ctx.today, 'Today'), dayBtn(addDays(ctx.today, -1), 'Yesterday'), date)),
      st.type === 'out' ? h('label', { class: 'field' }, 'Split equally with', split) : null,
      h('label', { class: 'field' }, 'Note', note),
      h('datalist', { id: 'people-list' }, ctx.ref.people.map((p) => h('option', { value: p.name }))),
      h('datalist', { id: 'shop-list' }, [...lastCat.keys()].slice(0, 40).map((k) => h('option', { value: recent.find((t) => t.raw_description.toLowerCase() === k).raw_description }))),
      h('div', { class: 'chips add-actions' }, saveBtn, againBtn)));
}
