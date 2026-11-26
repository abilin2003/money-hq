// Overview (a finished cycle until you close it, then the current one), Transactions and placeholders.
import { h } from '../ui/dom.js';
import { cycleFor, cycleList, cycleName } from '../lib/cycles.js';
import { pageLabel } from '../ui/sections.js';
import { head, shortDay, dayLabel, inCycle, txRow, twoStepButton } from '../ui/parts.js';
import { txEditor } from './tx-editor.js';
import { closeCycle, reopenCycle } from '../lib/data.js';
import { paydaysOf, usualDay } from './state.js';
import { overviewView } from './overview.js';
import { historyRows } from './history.js';

export function cyclesFor(ctx) {
  const first = ctx.transactions.map((t) => t.date).sort()[0] || ctx.today;
  return cycleList(paydaysOf(ctx), first, ctx.today, usualDay(ctx));
}
const cycleRow = (ctx, c) => ctx.ref.cycles.find((x) => x.start_date === c.start);
const isClosed = (ctx, c) => Boolean(cycleRow(ctx, c)?.closed_at);

// Which cycle the Overview shows: the most recent finished cycle you haven't closed yet, otherwise the current one.
export function focusCycle(ctx) {
  const current = { ...cycleFor(ctx.today, paydaysOf(ctx), usualDay(ctx)) };
  current.name = cycleName(current);
  const finished = cyclesFor(ctx).filter((c) => c.end < current.start && !isClosed(ctx, c) && ctx.transactions.some((t) => inCycle(t, c)));
  return { focus: finished[0] || current, current, finished: Boolean(finished[0]) };
}


export function overviewPage(ctx, rerender, param) {
  const { focus: c, current, finished } = focusCycle(ctx);
  const add = h('a', { href: '#add', class: 'btn tap hide-phone' }, 'Add transaction'); // phones have + in the top bar
  const imp = h('a', { href: '#import', class: 'btn primary tap' }, 'Import statements');
  // #overview/current shows the cycle you're in, even before the finished one is closed.
  if (param === 'current' || !finished) {
    const lastClosed = [...ctx.ref.cycles].reverse().find((x) => x.closed_at);
    const back = finished ? h('a', { href: '#overview', class: 'btn tap' }, `Back to ${c.name}`) : null;
    const reopen = !finished && lastClosed ? h('button', { class: 'linkbtn', type: 'button', onclick: async () => {
      const row = await reopenCycle(lastClosed.id);
      ctx.ref.cycles = ctx.ref.cycles.map((x) => (x.id === row.id ? row : x));
      rerender();
    } }, `Reopen ${cycleName({ end: lastClosed.end_date })}`) : null;
    return overviewView(ctx, current, { actions: [add, imp, back, reopen] });
  }
  const closeBtn = twoStepButton(`Close the ${c.name} cycle`, `Tap again to close ${c.name}`, async () => {
    const row = await closeCycle(c);
    ctx.ref.cycles = [...ctx.ref.cycles.filter((x) => x.start_date !== row.start_date), row].sort((x, y) => x.start_date.localeCompare(y.start_date));
    rerender();
  }, 'btn primary');
  const notice = h('section', { class: 'card notice-card' },
    h('p', { style: { margin: 0 } }, `The ${current.name} cycle started on ${dayLabel(current.start)}. When you've finished looking over ${c.name}, close it and the Overview moves on to ${current.name}. `, h('a', { href: '#overview/current', class: 'tap' }, `Peek at ${current.name} so far`)));
  return overviewView(ctx, c, { finished: true, actions: [add, closeBtn, imp], notice });
}

// Analytics → Transactions: any cycle in your history (older, archived lines included), searchable and editable.
export function transactionsPage(ctx, param, rerender) {
  const rows = historyRows(ctx.all);
  const first = rows.map((t) => t.date).sort()[0] || ctx.today;
  const cycles = cycleList(paydaysOf(ctx), first, ctx.today, usualDay(ctx));
  const c = cycles.find((x) => x.start === param) || cycles.find((x) => rows.some((t) => inCycle(t, x))) || cycles[0];
  const q = (ctx.txSearch || '').toLowerCase();
  const list = historyRows(ctx.all).filter((t) => inCycle(t, c) && (!q || `${t.raw_description} ${t.category || ''} ${t.note || ''} ${t.tag || ''}`.toLowerCase().includes(q)));
  const picker = h('select', { class: 'input', id: 'cycle', 'aria-label': 'Pay cycle', style: { width: 'auto', minWidth: '240px' }, onchange: (e) => { location.hash = `transactions/${e.target.value}`; } },
    cycles.map((x) => h('option', { value: x.start, selected: x.start === c.start }, `${x.name} cycle (${shortDay(x.start)} to ${shortDay(x.end)})`)));
  const search = h('input', { class: 'input', type: 'search', value: ctx.txSearch || '', placeholder: 'Search shop, category, note or tag', 'aria-label': 'Search transactions', onchange: (e) => { ctx.txSearch = e.target.value; rerender(); } });
  const groups = new Map();
  for (const t of list) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  const row = (t) => {
    const d = h('details', { class: 'txd', ontoggle: () => { if (d.open && d.childElementCount === 1) d.append(txEditor(ctx, t, rerender)); } }, h('summary', null, txRow(t)));
    return d;
  };
  return h('div', { class: 'page' },
    head('Transactions', `${list.length} in the ${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Tap one to change it or split it.`, picker, h('a', { href: '#import', class: 'btn primary tap' }, 'Import statements')),
    h('div', { class: 'searchbar' }, search),
    h('section', { class: 'card', 'aria-label': 'Transactions' },
      list.length ? [...groups].map(([date, txs]) => h('div', { class: 'txgroup' }, h('h3', null, dayLabel(date)), txs.map(row))) : h('p', { class: 'muted', style: { margin: 0 } }, q ? 'Nothing matches that search.' : 'No transactions in this cycle yet.')));
}

const COMING = {};
export function placeholderPage(id) {
  const label = pageLabel(id) || 'Not found';
  return h('div', { class: 'page' }, head(label),
    h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, COMING[id] ? `This screen is built in Phase ${COMING[id]} of the plan.` : 'This screen doesn’t exist yet.')));
}
