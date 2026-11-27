// Review inbox: lines Money HQ wasn't sure about. Pick what each one is, then approve.
// "Always do this for <shop>" saves a rule and sorts the other waiting lines from that shop too.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { merchantKey, normKey } from '../lib/text.js';
import { head, dayLabel, alertLine, shortDay } from '../ui/parts.js';
import { updateTransaction, addLearnedRule, enrich, deleteTransaction } from '../lib/data.js';
import { historyRows } from './history.js';
import { explainPanel } from './explain.js';
import { vocabFrom } from '../lib/interpret.js';
import { reviewGroup, reviewFields, saveReviewed } from './review-edit.js';

// Everything still undecided: current lines and older (archived) history, minus the bank's duplicate copy of
// the fresh-start month. Newest first.
export const waitingLines = (all) => historyRows(all).filter((t) => t.status === 'needs_review').sort((a, b) => b.date.localeCompare(a.date));

const KINDS_OUT = [['kind:transfer', 'Move between my accounts'], ['kind:invested', 'Invested'], ['kind:saved', 'Saved (sinking fund)']];
const KINDS_IN = [['kind:repayment', 'A friend paying me back'], ['kind:income', 'Income (salary, freelance)'], ['kind:invested', 'Taken out of an ISA or investments'], ['kind:transfer', 'Move between my accounts']];

// One menu for money out and one for money in, built once per page and copied for each row.
function menuFor(ctx, t, cache) {
  const key = t.amount_pence < 0 ? 'out' : 'in';
  if (!cache.has(key)) { const sel = h('select', null, choiceOptions(ctx, { amount_pence: t.amount_pence, kind: null, category_id: null })); cache.set(key, sel); }
  const select = cache.get(key).cloneNode(true);
  const want = t.category_id && ['spend', 'refund'].includes(t.kind) ? `cat:${t.category_id}` : `kind:${t.kind}`;
  select.value = [...select.options].some((o) => o.value === want) ? want : '';
  return select;
}

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

// "Not sure what this is": the line leaves the inbox, marked so you can find it later (search "not sure").
// Money out still counts as spending (it did leave your account), in Miscellaneous; money in isn't counted as
// income, so an unknown amount can't make your pay or savings rate look better than it is.
export const UNSURE_NOTE = 'Not sure what this was';
export function unsureChoice(t, categories) {
  const misc = categories.find((c) => c.is_active !== false && /^misc/i.test(c.name));
  const note = t.note ? (t.note.includes(UNSURE_NOTE) ? t.note : `${UNSURE_NOTE} · ${t.note}`) : UNSURE_NOTE;
  return t.amount_pence < 0 ? { kind: 'spend', category_id: misc?.id || null, note } : { kind: 'transfer', category_id: null, note };
}

const GROUPS = [['ready', 'Ready to approve'], ['match', 'Possible match'], ['info', 'Needs info']];
const GROUP_LABEL = Object.fromEntries(GROUPS);

// The choice a card's menu stands for, in words ("Groceries", "Move between my accounts").
const choiceLabel = (select) => select.options[select.selectedIndex]?.textContent || '';

export function inboxPage(ctx, rerender) {
  const waiting = waitingLines(ctx.all);
  const st = ctx.inboxState || (ctx.inboxState = { filter: 'all', selected: new Set(), later: new Set(), editing: null, confirming: false });
  const ids = new Set(waiting.map((t) => t.id));
  for (const id of [...st.selected]) if (!ids.has(id)) st.selected.delete(id);
  const counts = { all: waiting.length, ready: 0, match: 0, info: 0 };
  for (const t of waiting) counts[reviewGroup(t)] += 1;
  const inFilter = (t) => st.filter === 'all' || reviewGroup(t) === st.filter;
  // "Leave for later" moves a line to the end of the list for now; it stays pending.
  const order = (list) => [...list.filter((t) => !st.later.has(t.id)), ...list.filter((t) => st.later.has(t.id))];
  const current = order(waiting.filter((t) => !t.archived && inFilter(t)));
  const older = order(waiting.filter((t) => t.archived && inFilter(t)));

  const menus = new Map();
  const selects = new Map(); // each card's menu, so a bulk approval uses exactly what each card shows
  const vocab = vocabFrom(ctx);

  // Approve one line with a choice from its menu (or Not sure); "Always do this" also sorts the same shop's lines.
  async function approveWith(t, choice, always, btn) {
    const key = merchantKey(t.raw_description) || normKey(t.raw_description);
    const targets = [t];
    if (always && key) {
      const rule = await addLearnedRule(key, t.amount_pence < 0 ? 'out' : 'in', { kind: choice.kind, category: ctx.ref.categories.find((c) => c.id === choice.category_id)?.name || null });
      ctx.ref.rules.push(rule);
      targets.push(...waiting.filter((o) => o.id !== t.id && reviewGroup(o) !== 'match' && Math.sign(o.amount_pence) === Math.sign(t.amount_pence) && (merchantKey(o.raw_description) || normKey(o.raw_description)) === key));
    }
    for (const x of targets) ctx.replace(enrich(await updateTransaction(x.id, { ...choice, status: 'reviewed' }), ctx.ref));
  }

  const card = (t) => {
    const group = reviewGroup(t);
    const key = merchantKey(t.raw_description) || normKey(t.raw_description);
    const select = menuFor(ctx, t, menus);
    select.className = 'input';
    select.setAttribute('aria-label', `What is ${t.raw_description}?`);
    selects.set(t.id, select);
    const always = h('input', { type: 'checkbox', id: `al-${t.id}` });
    const busy = (on) => { for (const b of [approve, notSure, editBtn]) b.disabled = on; };
    const decide = async (btn, unsure) => {
      const choice = unsure ? unsureChoice(t, ctx.ref.categories) : decode(select.value, t.amount_pence);
      if (!choice) { alertLine(btn, 'Choose what this is first, or press Edit.'); return; }
      const label = btn.textContent;
      busy(true);
      btn.textContent = 'Saving…';
      try { await approveWith(t, choice, always.checked && !unsure, btn); rerender(); } catch (err) { busy(false); btn.textContent = label; alertLine(btn, err.message); }
    };
    const approve = h('button', { class: 'btn primary', type: 'button', onclick: () => decide(approve, false) }, group === 'match' ? 'It’s new: approve' : 'Approve');
    const notSure = h('button', { class: 'btn', type: 'button', title: t.amount_pence < 0 ? 'Counts it as Miscellaneous spending, marked “Not sure what this was”' : 'Not counted as income, marked “Not sure what this was”', onclick: () => decide(notSure, true) }, 'Not sure');
    const editBtn = h('button', { class: 'btn', type: 'button', 'aria-expanded': String(st.editing === t.id), onclick: () => { st.editing = st.editing === t.id ? null : t.id; rerender(); } }, st.editing === t.id ? 'Close' : 'Edit');
    const later = h('button', { class: 'linkbtn', type: 'button', onclick: () => { st.later.add(t.id); st.selected.delete(t.id); rerender(); } }, 'Later');
    // Quick types: set the menu to a move, a payback or a refund (refunds need a category: pick it in Edit).
    const quick = (t.amount_pence < 0 ? [['kind:transfer', 'Transfer']] : [['kind:repayment', 'Repayment'], ['kind:transfer', 'Transfer'], ['refund', 'Refund']]).map(([v, l]) =>
      h('button', { class: 'chip-btn', type: 'button', 'aria-pressed': String(select.value === v), onclick: () => { if (v === 'refund') { st.editing = t.id; st.editKind = { [t.id]: 'refund' }; rerender(); return; } select.value = v; select.dispatchEvent(new Event('change')); } }, l));
    select.addEventListener('change', () => quick.forEach((b, i) => b.setAttribute('aria-pressed', String(select.value === (t.amount_pence < 0 ? ['kind:transfer'] : ['kind:repayment', 'kind:transfer', 'refund'])[i]))));
    const pick = group !== 'match' ? h('input', { type: 'checkbox', class: 'inbox-pick', checked: st.selected.has(t.id), 'aria-label': `Select ${t.raw_description} for bulk approval`, onchange: (e) => { if (e.target.checked) st.selected.add(t.id); else st.selected.delete(t.id); st.confirming = false; rerender(); } }) : null;
    const question = (group === 'ready' && t.review?.reason ? `Suggested because: ${t.review.reason}` : t.review?.reason) || (/^Question:/.test(t.note || '') ? t.note.replace(/^Question:\s*/, '') : null);
    const ex = explainPanel(ctx, t, { waiting, vocab, rerender });
    return h('div', { class: `inbox-row g-${group}${st.later.has(t.id) ? ' later' : ''}` },
      h('div', { class: 'inbox-what' },
        h('span', { class: 'desc' }, pick, t.raw_description || '(no description)'),
        h('span', { class: 'muted small' }, `${dayLabel(t.date)} · ${t.accountName}`, h('span', { class: `ibadge b-${group}` }, GROUP_LABEL[group]), st.later.has(t.id) ? h('span', { class: 'ibadge' }, 'Later') : null, t.bank ? '' : (t.note && !question ? ` · ${t.note}` : '')),
        question ? h('span', { class: 'inbox-q' }, question) : null),
      h('span', { class: `amt${t.amount_pence > 0 ? ' in' : ''}` }, `${t.amount_pence > 0 ? '+' : ''}${formatPence(Math.abs(t.amount_pence))}`),
      h('div', { class: 'inbox-act' },
        select,
        h('div', { class: 'chips inbox-quick' }, quick),
        key ? h('label', { class: 'check', for: `al-${t.id}` }, always, `Always do this for “${key}”`) : null,
        h('div', { class: 'inbox-btns' }, editBtn, notSure, approve, later)),
      group === 'match' ? matchChoices(ctx, t, rerender) : null,
      st.editing === t.id ? editPanel(ctx, t, st, rerender) : null,
      h('div', { class: 'inbox-explain' }, ex.toggle, ex.panel));
  };

  const cards = { current: current.map(card), older: older.map(card) };

  // ---- bulk approval: only lines you tick, each with what its own menu shows, after a summary
  const chosen = [...st.selected].map((id) => waiting.find((t) => t.id === id)).filter(Boolean);
  const plan = chosen.map((t) => ({ t, choice: decode(selects.get(t.id)?.value || '', t.amount_pence), label: selects.get(t.id) ? choiceLabel(selects.get(t.id)) : '' }));
  const ok = plan.filter((p) => p.choice);
  const blocked = plan.filter((p) => !p.choice);
  const readyIds = waiting.filter((t) => reviewGroup(t) === 'ready' && inFilter(t)).map((t) => t.id);
  const bulkBar = waiting.length ? h('div', { class: 'bulkbar' },
    h('button', { class: 'linkbtn', type: 'button', onclick: () => { const all = readyIds.every((id) => st.selected.has(id)); for (const id of readyIds) { if (all) st.selected.delete(id); else st.selected.add(id); } st.confirming = false; rerender(); } }, readyIds.length && readyIds.every((id) => st.selected.has(id)) ? 'Clear selection' : `Select all ready (${readyIds.length})`),
    chosen.length ? h('button', { class: 'btn primary', type: 'button', onclick: () => { st.confirming = true; rerender(); } }, `Approve ${chosen.length} selected…`) : null) : null;
  let confirmBox = null;
  if (st.confirming && chosen.length) {
    const go = h('button', { class: 'btn primary', type: 'button', disabled: !ok.length, onclick: async () => {
      go.disabled = true; go.textContent = 'Saving…';
      try {
        for (const p of ok) ctx.replace(enrich(await updateTransaction(p.t.id, { ...p.choice, status: 'reviewed' }), ctx.ref));
        for (const p of ok) st.selected.delete(p.t.id);
        st.confirming = false;
        rerender();
      } catch (err) { go.disabled = false; go.textContent = `Approve ${ok.length}`; alertLine(go, err.message); }
    } }, `Approve ${ok.length}`);
    const total = ok.reduce((a, p) => a + p.t.amount_pence, 0);
    confirmBox = h('section', { class: 'card bulk-confirm', role: 'dialog', 'aria-label': 'Check before approving' },
      h('h2', { style: { marginTop: 0 } }, `Approve ${ok.length} line${ok.length === 1 ? '' : 's'}?`),
      h('ul', { class: 'bulk-list' }, ok.map((p) => h('li', null, h('span', null, `${shortDay(p.t.date)} · ${p.t.raw_description}`), h('span', { class: 'muted' }, p.label), h('span', null, formatPence(Math.abs(p.t.amount_pence)))))),
      h('p', { class: 'muted small' }, `Net ${total < 0 ? 'out' : 'in'}: ${formatPence(Math.abs(total))}. Each is approved exactly as its menu shows.`),
      blocked.length ? h('p', { class: 'warn small' }, `${blocked.length} selected line${blocked.length === 1 ? '' : 's'} not included: choose what ${blocked.length === 1 ? 'it is' : 'they are'} first (${blocked.map((p) => p.t.raw_description).join(', ')}).`) : null,
      h('div', { class: 'explain-btns' }, go, h('button', { class: 'btn', type: 'button', onclick: () => { st.confirming = false; rerender(); } }, 'Cancel')));
  }

  const tab = (id, label) => h('button', { type: 'button', 'aria-pressed': String(st.filter === id), onclick: () => { st.filter = id; st.confirming = false; rerender(); } }, `${label} (${counts[id]})`);
  return h('div', { class: 'page' },
    head('Review inbox', waiting.length ? `${waiting.length} line${waiting.length === 1 ? '' : 's'} waiting. Nothing here counts in your totals until you approve it.` : 'Nothing to review.'),
    ctx.oldIous ? h('section', { class: 'card notice-card' }, h('p', { style: { margin: 0 } }, `Also needs attention: ${ctx.oldIous} IOU${ctx.oldIous === 1 ? '' : 's'} older than 30 days. `, h('a', { href: '#people', class: 'tap' }, 'See who owes you'))) : null,
    waiting.length ? h('div', { class: 'seg wide inbox-filter', role: 'group', 'aria-label': 'Show' }, tab('all', 'All'), ...GROUPS.map(([id, label]) => tab(id, label))) : null,
    bulkBar,
    confirmBox,
    h('section', { class: 'card', 'aria-label': 'Lines to review' },
      cards.current.length ? cards.current : h('p', { class: 'muted', style: { margin: 0 } }, waiting.length ? 'Nothing here with this filter.' : 'The inbox is clear. Import new statements and anything Money HQ isn’t sure about lands here.')),
    cards.older.length ? h('section', { class: 'card', 'aria-label': 'Older lines to review' },
      h('h2', null, `From your older records (${cards.older.length})`),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Lines from before your fresh start that were never decided. Once approved they count in History and Trends.'),
      cards.older) : null,
    h('datalist', { id: 'people-list' }, (ctx.ref.people || []).map((p) => h('option', { value: p.name }))));
}

// "Edit & approve": every field, then save. The bank's own record is shown and never changed.
function editPanel(ctx, t, st, rerender) {
  const kind = st.editKind?.[t.id];
  const ed = reviewFields(ctx, t, kind ? { kind } : {});
  const save = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const bad = ed.problem();
    if (bad) { alertLine(save, bad); return; }
    save.disabled = true; save.textContent = 'Saving…';
    try { await saveReviewed(ctx, t, ed.read()); st.editing = null; if (st.editKind) delete st.editKind[t.id]; ctx.refresh(); rerender(); } catch (err) { save.disabled = false; save.textContent = 'Save and approve'; alertLine(save, err.message); }
  } }, 'Save and approve');
  return h('div', { class: 'explain review-edit' }, ...ed.rows,
    h('div', { class: 'explain-btns' }, save, h('button', { class: 'btn', type: 'button', onclick: () => { st.editing = null; rerender(); } }, 'Cancel')));
}

// A statement line that might be one of your own entries. "Same as my entry" attaches the bank's record to your
// entry (your description, category, notes, splits and funds stay as they are; it's marked verified) and removes
// this pending copy, so the payment is only counted once. Approve above instead if it's a different payment.
// If the amounts differ you choose which is right.
export function matchChoices(ctx, t, rerender) {
  const entries = (t.review.match_ids || []).map((id) => ctx.all.find((x) => x.id === id)).filter((x) => x && !x.bank);
  if (!entries.length) return h('p', { class: 'muted small inbox-match' }, 'The entry it might match has since been verified or removed: approve this if it’s a separate payment.');
  const link = async (btn, entry, useStatement) => {
    btn.disabled = true;
    try {
      const patch = { bank: t.bank || null };
      if (useStatement) patch.amount_pence = t.amount_pence;
      if (entry.status === 'needs_review' && entry.review?.reason) { patch.status = 'reviewed'; patch.review = null; }
      ctx.replace(enrich(await updateTransaction(entry.id, patch), ctx.ref));
      await deleteTransaction(t.id); // the pending copy: never approved, so nothing was counted
      ctx.all = ctx.all.filter((x) => x.id !== t.id);
      ctx.refresh();
      rerender();
    } catch (err) { btn.disabled = false; alertLine(btn, err.message); }
  };
  return h('div', { class: 'inbox-match' },
    h('p', { class: 'muted small', style: { margin: '0 0 6px' } }, entries.length === 1 ? 'Your entry it might be:' : 'Your entries it might be:'),
    entries.map((e) => {
      const same = e.amount_pence === t.amount_pence;
      const label = `${e.raw_description} · ${formatPence(Math.abs(e.amount_pence))} · ${e.accountName} · ${shortDay(e.date)}${e.category ? ` · ${e.category}` : ''}`;
      const keep = h('button', { class: 'btn', type: 'button', onclick: () => link(keep, e, false) }, same ? 'Same as my entry' : `Same, keep ${formatPence(Math.abs(e.amount_pence))}`);
      const use = same ? null : h('button', { class: 'btn', type: 'button', onclick: () => link(use, e, true) }, `Same, use statement’s ${formatPence(Math.abs(t.amount_pence))}`);
      return h('div', { class: 'match-row' }, h('span', { class: 'small' }, label), h('div', { class: 'inbox-btns' }, keep, use));
    }),
    h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Different payment? Approve it above as new.'));
}
