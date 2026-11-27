// Every detail of a waiting line, editable before you approve it: description, amount, date, the pay cycle it
// counts in, account, type, category (and so its bucket), the savings fund that paid, a tag, who owes you, and a
// note. Used by "Edit & approve" and by "Explain in my own words". The bank's own record (t.bank) is never
// edited: it's shown, and you're warned when what you approve differs from it.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { shortDay } from '../ui/parts.js';
import { fundSelect, readFund } from '../ui/fund-picker.js';
import { addPerson, addSplit, updateTransaction, enrich } from '../lib/data.js';
import { cycleFor, cycleName } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { paydaysOf, usualDay } from './state.js';
import { parseSplitsText, splitsText } from './say.js';

export const KINDS = {
  out: [['spend', 'Spent'], ['transfer', 'Move between my accounts'], ['saved', 'Saved (sinking fund)'], ['invested', 'Invested']],
  in: [['repayment', 'Money in: a friend paying me back'], ['refund', 'Money in: a refund'], ['income', 'Money in: income'], ['transfer', 'Move between my accounts'], ['invested', 'Taken out of investments']],
};
const needsCategory = (kind) => kind === 'spend' || kind === 'refund';

// Which inbox filter a waiting line belongs to. Imports say so themselves (t.review.group); older lines are
// worked out: a complete suggestion is ready to approve, anything else needs information.
export function reviewGroup(t) {
  if (t.review?.group) return t.review.group;
  if (/^Question:/.test(t.note || '')) return 'info';
  if (needsCategory(t.kind)) return t.category_id ? 'ready' : 'info';
  return ['transfer', 'saved', 'invested', 'repayment', 'income'].includes(t.kind) ? 'ready' : 'info';
}

// Where what you're approving differs from the bank's record of the line. Allowed, but said out loud.
export function bankWarnings(bank, { amount_pence, accountName, date }) {
  if (!bank) return [];
  const w = [];
  if (Number.isInteger(bank.amount_pence) && amount_pence !== bank.amount_pence) w.push(`The statement says ${formatPence(Math.abs(bank.amount_pence))}; you’re approving ${formatPence(Math.abs(amount_pence))}.`);
  if (bank.account && accountName && bank.account !== accountName) w.push(`This line came from your ${bank.account} statement; you’re putting it on ${accountName}.`);
  if (bank.date && date && Math.abs((new Date(date) - new Date(bank.date)) / 86400000) > 7) w.push(`The statement date is ${shortDay(bank.date)}.`);
  return w;
}

// What to save, from the editor's values. Only fields that changed about the line itself are included, so
// nothing else is touched; how it's classified is always written, and it's approved.
export function buildPatch(t, v) {
  const out = t.amount_pence < 0;
  const patch = { kind: v.kind, category_id: needsCategory(v.kind) ? v.category_id : null, from_savings: out && v.kind === 'spend' ? v.from_savings : false, fund_id: out && v.kind === 'spend' && v.from_savings ? v.fund_id : null, tag: v.tag || null, cycle_date: v.cycle_date || null, status: 'reviewed' };
  if (v.description && v.description !== t.raw_description) patch.raw_description = v.description;
  const signed = out ? -v.pence : v.pence;
  if (signed !== t.amount_pence) patch.amount_pence = signed;
  if (v.date !== t.date) patch.date = v.date;
  if (v.account_id !== t.account_id) patch.account_id = v.account_id;
  if ((v.note || null) !== (t.note || null)) patch.note = v.note || null;
  return patch;
}

// The pay cycles a line could count in: the one its date falls in, the one before and the one after.
function cycleChoices(ctx, date) {
  const pd = paydaysOf(ctx); const ud = usualDay(ctx);
  const own = cycleFor(date, pd, ud);
  const before = cycleFor(addDays(own.start, -1), pd, ud);
  const after = cycleFor(addDays(own.end, 1), pd, ud);
  return { own, options: [[before, `${cycleName(before)} cycle (the one before)`], [after, `${cycleName(after)} cycle (the one after)`]] };
}

// init: proposed values (from the line's suggestion, or from an explanation). why: { field: hint }.
export function reviewFields(ctx, t, init = {}, why = {}) {
  const out = t.amount_pence < 0;
  const v0 = {
    kind: init.kind || t.kind || (out ? 'spend' : null), category_id: init.category_id ?? t.category_id ?? null,
    from_savings: init.from_savings ?? t.from_savings ?? false, fund_id: init.fund_id ?? t.fund_id ?? null, tag: init.tag ?? t.tag ?? '',
    account_id: init.account_id || t.account_id, description: t.raw_description || '', pence: Math.abs(t.amount_pence), date: t.date,
    cycle_date: t.cycle_date || '', note: init.note ?? t.note ?? '', splits: init.splits || [],
  };
  const descIn = h('input', { class: 'input', value: v0.description, 'aria-label': 'Description' });
  const amountIn = h('input', { class: 'input money', inputmode: 'decimal', value: (v0.pence / 100).toFixed(2), 'aria-label': 'Amount' });
  const dateIn = h('input', { class: 'input', type: 'date', value: v0.date, 'aria-label': 'Date' });
  const { own, options } = cycleChoices(ctx, v0.date);
  const cycleSel = h('select', { class: 'input', 'aria-label': 'Counts in pay cycle' },
    h('option', { value: '' }, `${cycleName(own)} cycle (its own date)`),
    options.map(([c, label]) => h('option', { value: c.start, selected: Boolean(v0.cycle_date) && v0.cycle_date >= c.start && v0.cycle_date <= c.end }, label)));
  const accSel = h('select', { class: 'input', 'aria-label': out ? 'Paid with' : 'Into' }, ctx.ref.accounts.filter((a) => a.is_active !== false).map((a) => h('option', { value: a.id, selected: a.id === v0.account_id }, a.name)));
  const kindSel = h('select', { class: 'input', 'aria-label': 'Type' }, h('option', { value: '' }, 'Choose…'), KINDS[out ? 'out' : 'in'].map(([k, l]) => h('option', { value: k, selected: k === v0.kind }, l)));
  const catSel = h('select', { class: 'input', 'aria-label': 'Category' }, h('option', { value: '' }, 'Choose…'),
    ctx.ref.buckets.map((b) => h('optgroup', { label: b.name }, ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: c.id, selected: c.id === v0.category_id }, c.name)))));
  const fundSel = fundSelect(ctx, { fromSavings: v0.from_savings, fundId: v0.fund_id });
  const tagIn = h('input', { class: 'input', value: v0.tag, 'aria-label': 'For (tag)', placeholder: 'e.g. Bulgaria holiday' });
  const splitIn = h('input', { class: 'input', value: splitsText(v0.splits), 'aria-label': 'Who owes you', placeholder: 'e.g. Ben 20, Dad 12.50', list: 'people-list' });
  const noteIn = h('input', { class: 'input', value: v0.note, 'aria-label': 'Note' });
  const warn = h('ul', { class: 'u-questions', 'aria-live': 'polite' });

  const row = (label, control, hint) => h('div', { class: 'u-row' }, h('span', { class: 'u-label' }, label), control, hint ? h('span', { class: 'u-why muted small' }, hint) : h('span'));
  const catRow = row('Category', catSel, why.category_id);
  const fundRow = out ? row('Paid for by', fundSel, why.from_savings || 'savings count in total spending, not this cycle’s budget') : null;
  const splitRow = out ? row('Who owes you', splitIn, 'only your share counts as spending') : null;
  const bucketOf = () => { const c = ctx.ref.categories.find((x) => x.id === catSel.value); return c ? ctx.ref.buckets.find((b) => b.id === c.bucket_id)?.name : null; };
  const bucketHint = catRow.querySelector('.u-why') || catRow.lastChild;
  const sync = () => {
    const k = kindSel.value;
    catRow.hidden = !needsCategory(k);
    if (fundRow) fundRow.hidden = k !== 'spend';
    if (splitRow) splitRow.hidden = k !== 'spend';
    if (!why.category_id) bucketHint.textContent = bucketOf() ? `bucket: ${bucketOf()}` : '';
    const vals = read();
    warn.replaceChildren(...bankWarnings(t.bank, { amount_pence: out ? -vals.pence : vals.pence, accountName: ctx.ref.accounts.find((a) => a.id === vals.account_id)?.name, date: vals.date }).map((x) => h('li', null, x)));
  };
  [kindSel, catSel, amountIn, accSel, dateIn].forEach((el) => el.addEventListener('change', sync));

  function read() {
    const paid = readFund(fundSel, out);
    return {
      kind: kindSel.value, category_id: catSel.value || null, ...paid, tag: tagIn.value.trim(), account_id: accSel.value,
      description: descIn.value.trim(), pence: parsePence(amountIn.value), date: dateIn.value, cycle_date: cycleSel.value || '',
      note: noteIn.value.trim(), splits: splitIn.value.trim() ? parseSplitsText(splitIn.value) : [],
    };
  }
  // Problems that stop it being saved, in plain words; null when it's fine.
  function problem() {
    const v = read();
    if (!v.kind) return 'Choose the type.';
    if (needsCategory(v.kind) && !v.category_id) return 'Choose a category.';
    if (!v.pence || v.pence <= 0) return 'Type the amount, e.g. 12.50.';
    if (!v.date) return 'Choose the date.';
    if (v.splits.some((s) => !s.name || !s.pence)) return 'Write who owes you like “Ben 20, Dad 12.50”.';
    if (v.splits.reduce((a, s) => a + s.pence, 0) > v.pence) return 'Friends can’t owe more than the whole amount.';
    return null;
  }
  const bankLine = t.bank ? h('p', { class: 'muted small u-orig' }, `From the bank: ${t.bank.description} · ${formatPence(Math.abs(t.bank.amount_pence))} · ${t.bank.account || t.accountName} · ${shortDay(t.bank.date)} (kept as it is)`) : null;
  const rows = [bankLine,
    row('Description', descIn), row('Amount', amountIn, out ? 'money out' : 'money in'), row('Date', dateIn), row('Counts in', cycleSel, 'pay cycle; the date stays as it is'),
    row(out ? 'Paid with' : 'Into', accSel, why.account_id), row('Type', kindSel, why.kind), catRow, fundRow, row('For', tagIn, why.tag), splitRow, row('Note', noteIn), warn].filter(Boolean);
  sync();
  return { rows, read, problem };
}

// Save what the editor says, plus any new IOUs. Returns the saved line.
export async function saveReviewed(ctx, t, v, { note } = {}) {
  const patch = buildPatch(t, { ...v, note: note ?? v.note });
  const saved = enrich(await updateTransaction(t.id, patch), ctx.ref);
  ctx.replace(saved);
  for (const s of v.kind === 'spend' ? v.splits : []) {
    const person = ctx.ref.people.find((p) => p.name.toLowerCase() === s.name.toLowerCase()) || await addPerson(s.name);
    if (!ctx.ref.people.some((p) => p.id === person.id)) ctx.ref.people.push(person);
    ctx.ref.splits.push(await addSplit({ transaction_id: t.id, person_id: person.id, amount_pence: s.pence }));
  }
  return saved;
}
