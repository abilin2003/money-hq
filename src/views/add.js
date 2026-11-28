// Quick add (phone): amount, type, where, category, paid with, split, note. One tap from the home screen.
// Made for thumbs: your most-used categories are one tap, "Where" suggests recent shops and fills in the
// category you used there last, the account you paid with last time is remembered, and Save stays on screen.
import { h } from '../ui/dom.js';
import { parsePence } from '../lib/money.js';
import { addDays } from '../lib/dates.js';
import { head, alertLine, clearInvalid } from '../ui/parts.js';
import { addTransaction, addTransfer, enrich, addPurchaseWithIous } from '../lib/data.js';
import { forPanel } from './add-for.js';
import { sayPanel } from './say.js';
import { possibleDuplicates } from '../lib/interpret.js';
import { formatPence } from '../lib/money.js';
import { shortDay } from '../ui/parts.js';

export function addPage(ctx, rerender) {
  const st = ctx.addState || (ctx.addState = { type: 'out', date: ctx.today, saved: null, mode: 'one' });
  // Leave without adding anything: back to where you came from (or the Overview), forgetting what was typed.
  const close = h('button', { class: 'btn add-close', type: 'button', 'aria-label': 'Close without adding', onclick: () => { ctx.addState = null; ctx.sayState = null; location.hash = ctx.cameFrom || 'overview'; } }, h('span', { 'aria-hidden': 'true' }, '✕'), ' Close');
  const modeBtn = (id, label) => h('button', { type: 'button', 'aria-pressed': String((st.mode || 'one') === id), onclick: () => { st.mode = id; rerender(); } }, label);
  const modes = h('div', { class: 'seg wide add-mode', role: 'group', 'aria-label': 'How to add' }, modeBtn('one', 'Type one'), modeBtn('say', 'Say or paste'));
  if (st.mode === 'say') return h('div', { class: 'page narrow' }, head('Add transactions', null, close), modes, sayPanel(ctx, rerender));
  const account = ctx.ref.accounts.find((a) => a.id === ctx.lastAddAccount) || ctx.ref.accounts.find((a) => a.name === 'Revolut') || ctx.ref.accounts[0];
  // Recent shops (newest first) and the category last used at each; the categories you use most lately.
  const recent = ctx.transactions.filter((t) => t.kind === 'spend' && t.category_id && t.raw_description).slice(0, 400);
  const lastCat = new Map();
  const lastAcc = new Map(); // the account you paid with last time at each shop
  for (const t of recent) { const k = t.raw_description.toLowerCase(); if (!lastCat.has(k)) lastCat.set(k, t.category_id); if (!lastAcc.has(k) && t.account_id) lastAcc.set(k, t.account_id); }
  const counts = new Map();
  for (const t of recent.slice(0, 150)) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
  const topCats = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => ctx.ref.categories.find((c) => c.id === id && c.is_active)).filter(Boolean).slice(0, 6);
  const amount = h('input', { class: 'input money big-input', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Amount', autofocus: true, enterkeyhint: 'next' });
  const where = h('input', { class: 'input', placeholder: st.type === 'in' ? 'Who from, e.g. Kevin' : 'Where, e.g. Tesco', 'aria-label': 'Where', list: st.type === 'out' ? 'shop-list' : null, autocomplete: 'off', enterkeyhint: 'next',
    onchange: () => { const k = where.value.trim().toLowerCase(); const c = lastCat.get(k); if (st.type === 'out' && c && !cat.value) { cat.value = c; markChips(); } const a = lastAcc.get(k); if (a && paidTouched === false) { paid.value = a; } } });
  let paidTouched = false;
  const cat = h('select', { class: 'input', id: 'add-cat', 'aria-label': 'Category' }, h('option', { value: '' }, st.type === 'out' ? 'Category…' : 'What is it?'),
    st.type === 'out' ? ctx.ref.buckets.map((b) => h('optgroup', { label: b.name }, ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: c.id }, c.name))))
      : st.type === 'in' ? [['repayment', 'A friend paying me back'], ['income', 'Income'], ['refund', 'Refund']].map(([v, l]) => h('option', { value: v }, l)) : null);
  const paid = h('select', { class: 'input', 'aria-label': 'Paid with', onchange: (e) => { ctx.lastAddAccount = e.target.value; paidTouched = true; } }, ctx.ref.accounts.filter((a) => a.is_active !== false).map((a) => h('option', { value: a.id, selected: a.id === account?.id }, a.name)));
  const others = ctx.ref.accounts.filter((a) => a.is_active !== false);
  const toAcc = h('select', { class: 'input', 'aria-label': 'To account' }, h('option', { value: '' }, 'Choose the account…'), others.map((a) => h('option', { value: a.id, selected: a.id === st.moveTo }, a.name)));
  toAcc.addEventListener('change', () => { st.moveTo = toAcc.value; });
  const date = h('input', { class: 'input', type: 'date', value: st.date, 'aria-label': 'Date', onchange: (e) => { st.date = e.target.value; } });
  // Who is this purchase for? (spending only): mine, someone paying me back, or split with others.
  const whoFor = st.type === 'out' ? forPanel(ctx, st, () => parsePence(amount.value) || 0) : null;
  amount.addEventListener('input', () => whoFor?.update());
  const note = h('input', { class: 'input', placeholder: 'Note (optional)', 'aria-label': 'Note' });

  const chips = st.type === 'out' && topCats.length ? h('div', { class: 'chips quickcats', role: 'group', 'aria-label': 'Your most-used categories' },
    topCats.map((c) => h('button', { type: 'button', class: 'chip-btn', 'data-id': c.id, 'aria-pressed': 'false', onclick: () => { cat.value = c.id; markChips(); } }, c.name))) : null;
  const markChips = () => chips?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === cat.value)));
  cat.addEventListener('change', () => markChips());
  const typeBtn = (id, label) => h('button', { type: 'button', 'aria-pressed': String(st.type === id), onclick: () => { st.type = id; rerender(); } }, label);
  const dayBtn = (iso, label) => h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(st.date === iso), onclick: () => { st.date = iso; date.value = iso; rerender(); } }, label);

  // One save at a time: a second tap (or the other Save button) while saving does nothing, so a purchase can
  // never be saved twice. The message for a refused save names the field and keeps everything you typed.
  let saving = false;
  const busy = (on) => { saving = on; saveBtn.disabled = on; againBtn.disabled = on; };
  async function save(another, btn) {
    if (saving) return;
    busy(true);
    try { await saveOnce(another, btn); } finally { if (document.contains(btn)) busy(false); }
  }
  async function saveOnce(another, btn) {
    clearInvalid(btn.closest('.add-card') || document);
    const p = parsePence(amount.value);
    if (!p || p <= 0) { alertLine(btn, amount.value.trim() && p === null ? `“${amount.value.trim()}” isn’t an amount. Type it in numbers, e.g. 4.50.` : 'Type the amount, e.g. 4.50.', amount); return; }
    if (st.type === 'move' && !where.value.trim()) where.value = 'Move between my accounts';
    if (!where.value.trim()) { alertLine(btn, 'Say where (or who from).', where); return; }
    if (st.type === 'move' && (!toAcc.value || toAcc.value === paid.value)) { alertLine(btn, 'Choose the account the money went to (a different one).'); return; }
    const out = st.type !== 'in';
    let kind = 'spend'; let category_id = null;
    // What others owe (if anyone): checked before anything is saved.
    const shares = whoFor ? whoFor.read() : null;
    if (shares?.error) { alertLine(btn, shares.error, shares.field); return; }
    // A category is needed for your share; when all of it is someone else's, it's optional.
    if (st.type === 'out') { if (!cat.value && shares.myShare > 0) { alertLine(btn, 'Choose a category.', cat); return; } category_id = cat.value || null; }
    else if (st.type === 'in') { if (!cat.value) { alertLine(btn, 'Choose what it is.', cat); return; } kind = cat.value; }
    else kind = 'transfer';
    const signed = out ? -p : p;
    const dupKey = `${paid.value}|${st.date}|${signed}`;
    const dups = possibleDuplicates({ date: st.date, amount_pence: signed, account_id: paid.value }, ctx.all.filter((t) => !t.archived));
    if (dups.length && st.dupOk !== dupKey) {
      st.dupOk = dupKey;
      alertLine(btn, `You already have ${dups.map((d) => `${d.raw_description} ${formatPence(Math.abs(d.amount_pence))} on ${shortDay(d.date)}`).join('; ')} on this account. Press Save again to add this one too.`);
      return;
    }
    // A move is saved as both halves, linked: out of one account, into the other.
    if (st.type === 'move') {
      try {
        const both = await addTransfer({ from: paid.value, to: toAcc.value, date: st.date, amount_pence: p, raw_description: where.value.trim(), note: note.value.trim() || null });
        for (const t of both) ctx.add(enrich(t, ctx.ref));
        st.saved = `Moved ${formatPence(p)}.`;
        if (another) rerender(); else { ctx.addState = null; location.hash = 'overview'; }
      } catch (err) { alertLine(btn, `Not saved: ${err.message}`); }
      return;
    }
    try {
      if (shares?.ious.length) {
        // The purchase and its IOUs are saved together, all or nothing. Names match the people you already have.
        const ious = shares.ious.map((i) => ({ ...i, name: ctx.ref.people.find((x) => x.name.toLowerCase() === i.name.toLowerCase())?.name || i.name }));
        const res = await addPurchaseWithIous({ account_id: paid.value, date: st.date, amount_pence: -p, raw_description: where.value.trim(), category_id, note: note.value.trim() || null }, ious);
        ctx.ref.people = res.people;
        ctx.ref.splits = [...ctx.ref.splits, ...res.splits];
        ctx.add(enrich(res.saved, ctx.ref));
        st.saved = `Saved ${where.value.trim()}: ${ious.map((i) => `${i.name} owes you ${formatPence(i.amount_pence)}`).join(', ')}${shares.myShare ? `; your share ${formatPence(shares.myShare)}` : ''}.`;
      } else {
        const saved = await addTransaction({ account_id: paid.value, date: st.date, amount_pence: out ? -p : p, raw_description: where.value.trim(), kind, category_id, note: note.value.trim() || null });
        ctx.add(enrich(saved, ctx.ref));
        st.saved = `Saved ${where.value.trim()}.`;
      }
      if (another) st.for = 'mine';
      if (another) rerender(); else { ctx.addState = null; location.hash = 'overview'; }
    } catch (err) { alertLine(btn, `Not saved: ${err.message}`); }
  }
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: (e) => save(false, e.currentTarget) }, 'Save');
  const againBtn = h('button', { class: 'btn', type: 'button', onclick: (e) => save(true, e.currentTarget) }, 'Save and add another');

  return h('div', { class: 'page narrow' },
    head('Add a transaction', null, close),
    modes,
    st.saved ? h('p', { class: 'chip', role: 'status' }, st.saved) : null,
    h('section', { class: 'card add-card' },
      h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Type' }, typeBtn('out', 'Spent'), typeBtn('in', 'Money in'), typeBtn('move', 'Move')),
      amount,
      h('label', { class: 'field' }, st.type === 'in' ? 'From' : st.type === 'move' ? 'What for (optional)' : 'Where', where),
      st.type !== 'move' ? h('div', { class: 'field' }, h('label', { for: 'add-cat' }, st.type === 'out' ? 'Category' : 'What is it?'), chips, cat) : null,
      h('label', { class: 'field' }, st.type === 'in' ? 'Into' : st.type === 'move' ? 'From account' : 'Paid with', paid),
      st.type === 'move' ? h('label', { class: 'field' }, 'To account', toAcc) : null,
      h('div', { class: 'field' }, 'When', h('div', { class: 'chips' }, dayBtn(ctx.today, 'Today'), dayBtn(addDays(ctx.today, -1), 'Yesterday'), dayBtn(addDays(ctx.today, -2), new Date(`${addDays(ctx.today, -2)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })), date)),
      whoFor?.el,
      h('label', { class: 'field' }, 'Note', note),
      h('datalist', { id: 'people-list' }, ctx.ref.people.map((p) => h('option', { value: p.name }))),
      h('datalist', { id: 'shop-list' }, [...lastCat.keys()].slice(0, 40).map((k) => h('option', { value: recent.find((t) => t.raw_description.toLowerCase() === k).raw_description }))),
      h('div', { class: 'chips add-actions' }, saveBtn, againBtn)));
}
