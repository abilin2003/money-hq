// Shared by the Analytics pages: the period you've picked, the filters you've clicked into, and the detail panel.
// All of it lives in the page address (#spending/p=c.2026-10-26&b=Fun&c=Going+out&t=<id>), so the period and
// filters carry from page to page, Back steps out of a drill-down, and any view can be linked to.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { monthName } from '../lib/summary.js';
import { resolvePeriod, stepPeriod, encodePeriod, decodePeriod } from '../lib/period.js';
import { spendLines, inRange, total, group, applyFilter, weekdayOf, shopName, merchantResolver } from '../lib/explore.js';
import { detectRecurring } from '../lib/budget.js';
import { shortDay, dayLabel, pounds, bar, txRow } from '../ui/parts.js';
import { panel } from '../ui/panel.js';
import { txEditor } from './tx-editor.js';
import { historyRows } from './history.js';
import { paydaysOf, usualDay } from './state.js';

// Address keys for the filters. Booleans are 1/0.
const KEYS = { b: 'bucket', c: 'category', cs: 'cats', m: 'merchant', we: 'weekend', mn: 'min', d: 'day', w: 'week', wd: 'weekday', mo: 'month', r: 'recurring', e: 'essential', sm: 'small', sv: 'savings', k: 'kind' };
const BOOL = new Set(['r', 'e', 'sv', 'we']);
export const DEFAULT_ESSENTIAL = ['Essentials', 'Groceries', 'Fuel'];

export function readState(ctx, param) {
  const q = new URLSearchParams(param && param.includes('=') ? param : '');
  const code = q.get('p') || (param && !param.includes('=') ? param : null);
  const sel = code ? decodePeriod(code) : (ctx.period || { kind: 'current' });
  ctx.period = sel; // remembered, so every Analytics page opens on the same period
  const f = {};
  for (const [k, name] of Object.entries(KEYS)) if (q.has(k)) f[name] = BOOL.has(k) ? q.get(k) === '1' : ['sm', 'mn'].includes(k) ? +q.get(k) : q.get(k);
  return { sel, f, tx: q.get('t'), q };
}

export function stateHref(route, sel, f = {}, tx = null, extra = {}) {
  const q = new URLSearchParams({ p: encodePeriod(sel) });
  for (const [k, name] of Object.entries(KEYS)) if (f[name] !== undefined && f[name] !== null) q.set(k, BOOL.has(k) ? (f[name] ? '1' : '0') : String(f[name]));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) q.set(k, v);
  if (tx) q.set('t', tx);
  return `#${route}/${q.toString()}`;
}

// Everything the period maths needs, worked out once per page.
export function periodInfo(ctx) {
  const rows = historyRows(ctx.all);
  if (ctx._merch?.all !== ctx.all) ctx._merch = { all: ctx.all, fn: merchantResolver(rows) }; // worked out once per version of your data
  return { rows, merchants: ctx._merch.fn, paydays: paydaysOf(ctx), today: ctx.today, usualDay: usualDay(ctx), firstDate: rows.reduce((m, t) => (t.date < m ? t.date : m), ctx.today) };
}

// The lines for a period, with what the filters and the recurring / essential splits need.
export function periodData(ctx, p, info) {
  const txs = info.rows.filter(inRange(p.from, p.to));
  const lines = spendLines(txs, ctx.splitMap, ctx.settled, info.merchants);
  ctx._recurring = ctx._recurring || new Set(detectRecurring(info.rows, ctx.ref.bills || []).map((r) => r.key));
  const fctx = { bills: ctx.ref.bills || [], recurringKeys: ctx._recurring, essential: new Set(ctx.ref.settings?.extra?.essential_buckets || DEFAULT_ESSENTIAL) };
  return { txs, lines, fctx };
}

// ---- the period selector: ‹ [period] › with every kind of period in one list, and dates for a custom range
export function periodBar(ctx, route, p, info) {
  const go = (sel) => { location.hash = stateHref(route, sel); };
  const prev = stepPeriod(p, -1, info); const next = stepPeriod(p, 1, info);
  const cycles = cycleList(info.paydays, info.firstDate, info.today, info.usualDay);
  const months = [];
  for (let ym = info.today.slice(0, 7); ym >= info.firstDate.slice(0, 7); ym = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)) months.push(ym);
  const value = p.current ? 'cur' : p.kind === 'range' ? 'custom' : encodePeriod(p.sel);
  const from = h('input', { class: 'input', type: 'date', value: p.from, min: info.firstDate, max: info.today, 'aria-label': 'From' });
  const to = h('input', { class: 'input', type: 'date', value: p.kind === 'range' ? p.to : (p.to > info.today ? info.today : p.to), min: info.firstDate, max: info.today, 'aria-label': 'To' });
  const custom = h('div', { class: 'custom-range', hidden: p.kind !== 'range' }, from, h('span', { class: 'muted small' }, 'to'), to,
    h('button', { class: 'btn', type: 'button', onclick: () => { if (from.value && to.value) go({ kind: 'range', from: from.value, to: to.value }); } }, 'Show'));
  const select = h('select', { class: 'input period-select', 'aria-label': 'Period to analyse', onchange: (e) => {
    if (e.target.value === 'custom') { custom.hidden = false; from.focus(); return; }
    go(decodePeriod(e.target.value));
  } },
  h('optgroup', { label: 'Pay cycles' }, h('option', { value: 'cur' }, 'Current cycle'),
    cycles.slice(1).map((c) => h('option', { value: `c.${c.start}` }, `${cycleName(c)} ${c.end.slice(0, 4)} cycle`))),
  h('optgroup', { label: 'Several cycles' }, [3, 6, 12].map((n) => h('option', { value: `l.${n}` }, `Last ${n} cycles`))),
  h('optgroup', { label: 'Calendar months' }, months.map((ym) => h('option', { value: `m.${ym}` }, monthName(ym)))),
  h('optgroup', { label: 'Your own dates' }, h('option', { value: 'custom' }, p.kind === 'range' ? p.label : 'Choose dates…')));
  select.value = value;
  const arrow = (sel, label, text) => h('button', { class: 'btn arrow', type: 'button', disabled: !sel, 'aria-label': label, onclick: () => sel && go(sel) }, text);
  return h('div', { class: 'periodbar card' },
    h('div', { class: 'period-row' }, arrow(prev, 'Previous period', '‹'), select, arrow(next, 'Next period', '›')),
    h('p', { class: 'muted small period-sub' }, `${p.sub}${p.cycle && p.current ? ` · day ${p.cycle.dayNumber} of ${p.cycle.totalDays}` : ` · ${p.days} days`}`),
    custom);
}

// ---- what a filter is called, for titles and breadcrumbs
export function filterLabel(name, v) {
  if (name === 'day') return dayLabel(v);
  if (name === 'week') return `Week of ${shortDay(v)}`;
  if (name === 'month') return monthName(v);
  if (name === 'recurring') return v ? 'Recurring' : 'One-off';
  if (name === 'essential') return v ? 'Essential' : 'Discretionary';
  if (name === 'small') return `Under ${pounds(v)}`;
  if (name === 'min') return `${pounds(v)} or more`;
  if (name === 'weekend') return v ? 'Weekends' : 'Weekdays';
  if (name === 'cats') return String(v).split('|').join(', ');
  if (name === 'savings') return v ? 'Paid from savings' : 'Paid from pay';
  if (name === 'kind') return { income: 'Money in', saved: 'Saved', invested: 'Invested', putaway: 'Saved and invested' }[v] || v;
  return v;
}
const ORDER = ['kind', 'savings', 'essential', 'recurring', 'small', 'min', 'month', 'week', 'weekend', 'weekday', 'day', 'bucket', 'cats', 'category', 'merchant'];

// One spending line in a panel: date, shop, category, your share. Tapping it opens the transaction.
export function lineRow(l, href) {
  return h('a', { href, class: 'pline linkrow' },
    h('span', { class: 'pl-date muted small' }, shortDay(l.date)),
    h('span', { class: 'pl-what' }, h('span', { class: 'pl-desc' }, l.t.raw_description || '(no description)'),
      h('span', { class: 'muted small' }, [l.category !== 'No category' ? l.category : l.bucket, l.kind === 'refund' ? 'refund' : null, l.kind === 'payback' ? 'paid back' : null, l.fromSavings ? 'from savings' : null, l.kind === 'spend' && l.cost !== -l.t.amount_pence ? `your share of ${formatPence(-l.t.amount_pence)}` : null].filter(Boolean).join(' · '))),
    h('span', { class: `r pl-amt ${l.cost < 0 ? 'in' : ''}` }, `${l.cost < 0 ? '−' : ''}${formatPence(Math.abs(l.cost))}`));
}

// The detail panel for the Spending page: whatever you clicked, broken down one level further, then every line.
export function drillPanel(ctx, route, p, f, txId, data, rerender) {
  const names = ORDER.filter((n) => f[n] !== undefined);
  const base = { ...f };
  const href = (ff, tx = null) => stateHref(route, p.sel, ff, tx);
  const crumbs = [{ label: p.label, href: href({}) }];
  const acc = {};
  const label = (n, v) => (n === 'merchant' ? shopName(data.lines.filter((l) => l.merchant === v)) || v : filterLabel(n, v));
  for (const n of names) { acc[n] = f[n]; crumbs.push({ label: label(n, f[n]), href: href({ ...acc }) }); }

  // Money in, saved and invested aren't spending: list those transactions as they are.
  if (f.kind) {
    const sign = (t) => (t.kind === 'income' ? t.amount_pence : t.kind === 'invested' ? -t.amount_pence : t.accountType === 'savings' ? t.amount_pence : -t.amount_pence);
    const kinds = f.kind === 'putaway' ? ['saved', 'invested'] : [f.kind];
    const list = data.txs.filter((t) => kinds.includes(t.kind) && t.status !== 'needs_review').sort((a, b) => b.date.localeCompare(a.date));
    const sum = list.reduce((a, t) => a + sign(t), 0);
    const tx = txId && list.find((t) => t.id === txId);
    if (tx) return txPanel(ctx, tx, [...crumbs, { label: tx.raw_description }], href(base), rerender, href({}));
    return panel({ title: filterLabel('kind', f.kind), crumbs, closeHref: href({}), summary: h('p', { class: 'panel-sum' }, `${pounds(sum)} · ${list.length} line${list.length === 1 ? '' : 's'}${f.kind === 'income' ? '' : ' (after withdrawals)'}`),
      body: list.length ? list.map((t) => h('a', { href: href(base, t.id), class: 'linkrow' }, txRow(t))) : h('p', { class: 'muted' }, 'Nothing in this period.') });
  }

  const lines = applyFilter(data.lines, f, data.fctx).sort((a, b) => b.date.localeCompare(a.date) || b.cost - a.cost);
  const sum = total(lines);
  const whole = total(data.lines);
  if (txId) {
    const l = lines.find((x) => x.id === txId) || data.lines.find((x) => x.id === txId);
    if (l) return txPanel(ctx, l.t, [...crumbs, { label: l.t.raw_description }], href(base), rerender, href({}));
  }
  const title = names.length ? label(names[names.length - 1], f[names[names.length - 1]]) : 'All spending';
  // One level further: a bucket shows its categories; anything else shows its shops (if there's more than one).
  const nextKey = f.bucket !== undefined && f.category === undefined ? 'category' : f.merchant === undefined ? 'merchant' : null;
  const parts = nextKey ? group(lines, (l) => l[nextKey]) : [];
  const top = Math.max(1, ...parts.map((g) => g.pence));
  const breakdown = parts.length > 1 ? h('div', { class: 'panel-sec' },
    h('h3', { class: 'small-h' }, nextKey === 'category' ? 'Categories' : 'Shops and payees'),
    parts.slice(0, 12).map((g) => h('a', { href: href({ ...base, [nextKey]: g.key }), class: 'crow linkrow' },
      h('span', { class: 'cname' }, nextKey === 'merchant' ? shopName(g.lines) : g.key, h('span', { class: 'muted small' }, g.count ? ` ×${g.count}` : '')), bar(g.pence / top, { label: pounds(g.pence) }), h('span', { class: 'r' }, pounds(g.pence))))) : null;
  return panel({ title, crumbs, closeHref: href({}),
    summary: h('p', { class: 'panel-sum' }, h('strong', null, pounds(sum)), ` · ${lines.filter((l) => l.kind === 'spend').length} payment${lines.filter((l) => l.kind === 'spend').length === 1 ? '' : 's'}`, whole > 0 && names.length ? ` · ${Math.round((sum / whole) * 100)}% of ${pounds(whole)}` : ''),
    body: [breakdown,
      h('div', { class: 'panel-sec' }, h('h3', { class: 'small-h' }, `Every line (${lines.length})`),
        lines.length ? lines.map((l) => lineRow(l, href(base, l.id))) : h('p', { class: 'muted' }, 'Nothing in this period.'),
        lines.length ? h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, `These ${lines.length} lines add up to ${formatPence(sum)}${f.weekday ? ` (every ${f.weekday})` : ''}.`) : null)] });
}

// A transaction in the panel: what it is, then the usual editor (category, note, split, paid from savings…).
export function txPanel(ctx, t, crumbs, backHref, rerender, closeHref = backHref) {
  return panel({ title: t.raw_description || 'Transaction', crumbs, closeHref,
    summary: h('p', { class: 'panel-sum' }, `${dayLabel(t.date)} · ${t.accountName || ''}`),
    body: [h('div', { class: 'panel-sec' }, txRow(t)), h('div', { class: 'panel-sec' }, txEditor(ctx, t, rerender)),
      h('p', null, h('a', { href: backHref, class: 'tap' }, '‹ Back to the list'))] });
}

export { weekdayOf };
