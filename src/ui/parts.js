// Small shared pieces: page heading, transaction rows, bars, dates.
import { h } from './dom.js';
import { formatPence } from '../lib/money.js';

export const dayLabel = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
export const shortDay = (iso) => dayLabel(iso, { day: 'numeric', month: 'short' });
export const pounds = (p) => formatPence(Math.round(p), { pence: false });
export const inCycle = (t, c) => { const d = t.cycle_date || t.date; return d >= c.start && d <= c.end; };

export function head(title, line, ...actions) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'display' }, title), line ? h('p', { class: 'muted' }, line) : null),
    actions.length ? h('div', { class: 'head-actions' }, actions) : null);
}

const KIND_LABEL = { transfer: 'Move between your accounts', saved: 'Saved', invested: 'Invested', income: 'Income', repayment: 'Paid back to you', refund: 'Refund' };

// "Snacks & drinks (Fun)" in bucket Fun -> "Snacks & drinks, Fun"; "Groceries" in Groceries -> "Groceries".
export function categoryLabel(name, bucket) {
  if (!bucket) return name;
  const plain = name.replace(` (${bucket})`, '');
  return plain === bucket ? plain : `${plain}, ${bucket}`;
}

export function txRow(t) {
  const label = t.category ? categoryLabel(t.category, t.bucket) : (KIND_LABEL[t.kind] || 'No category');
  return h('div', { class: 'tx' },
    h('span', { class: 'desc', title: t.raw_description }, t.raw_description || '(no description)'),
    h('span', { class: `amt${t.amount_pence > 0 ? ' in' : ''}` }, `${t.amount_pence > 0 ? '+' : ''}${formatPence(Math.abs(t.amount_pence))}`),
    h('span', { class: 'meta' },
      t.colour ? h('span', { class: 'dot', style: { background: t.colour }, 'aria-hidden': 'true' }) : null,
      label,
      h('span', null, `· ${t.accountName}`),
      t.status === 'needs_review' ? h('span', { class: 'tag review' }, 'Needs review') : null,
      t.note ? h('span', { class: 'tag' }, t.note) : null));
}

// Transactions grouped under day headings.
export function txList(list, empty = 'No transactions here yet.') {
  if (!list.length) return h('p', { class: 'muted', style: { margin: 0 } }, empty);
  const groups = new Map();
  for (const t of list) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  return [...groups].map(([date, txs]) => h('div', { class: 'txgroup' }, h('h3', null, dayLabel(date)), txs.map(txRow)));
}

// A 6px bar: fill = share of the whole (0..1), optional pace tick, over-budget turns the fill red.
export function bar(fill, { colour = 'var(--text-2)', tick = null, over = false, label } = {}) {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return h('span', { class: 'bar', role: 'img', 'aria-label': label || `${Math.round(pct)}%` },
    h('span', { class: 'fill', style: { width: `${pct}%`, background: over ? 'var(--over)' : colour } }),
    tick === null ? null : h('span', { class: 'tick', style: { left: `${Math.max(0, Math.min(1, tick)) * 100}%` } }));
}

// A button that needs two presses (no confirm() pop-ups). first: the label; second: the "are you sure" label.
export function twoStepButton(first, second, onConfirm, cls = 'btn') {
  let armed = false;
  const btn = h('button', { class: cls, type: 'button', onclick: async () => {
    if (!armed) { armed = true; btn.textContent = second; setTimeout(() => { if (armed) { armed = false; btn.textContent = first; } }, 6000); return; }
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try { await onConfirm(); } catch (err) { btn.disabled = false; armed = false; btn.textContent = first; alertLine(btn, err.message); }
  } }, first);
  return btn;
}

// Shows an error message next to an element (in the page, never a pop-up).
export function alertLine(el, message) {
  const p = h('p', { class: 'error', role: 'alert' }, message);
  el.after(p);
}
