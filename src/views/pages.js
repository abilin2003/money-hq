// Overview (a finished cycle until you close it, then the current one), Transactions, More and placeholders.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleFor, cycleList, cycleName, pace } from '../lib/cycles.js';
import { summarise, ranked } from '../lib/summary.js';
import { PAGES } from '../ui/shell.js';
import { head, shortDay, dayLabel, pounds, inCycle, txList, bar, twoStepButton } from '../ui/parts.js';
import { closeCycle, reopenCycle } from '../lib/data.js';
import { budgetsFor } from './state.js';
import { currentOverview } from './overview-current.js';

export function cyclesFor(ctx) {
  const first = ctx.transactions.map((t) => t.date).sort()[0] || ctx.today;
  return cycleList(ctx.ref.settings?.paydays || [], first, ctx.today, ctx.ref.settings?.payday_usual_day || 24);
}
const cycleRow = (ctx, c) => ctx.ref.cycles.find((x) => x.start_date === c.start);
const isClosed = (ctx, c) => Boolean(cycleRow(ctx, c)?.closed_at);

// Which cycle the Overview shows: the most recent finished cycle you haven't closed yet, otherwise the current one.
export function focusCycle(ctx) {
  const current = { ...cycleFor(ctx.today, ctx.ref.settings?.paydays || [], ctx.ref.settings?.payday_usual_day || 24) };
  current.name = cycleName(current);
  const finished = cyclesFor(ctx).filter((c) => c.end < current.start && !isClosed(ctx, c) && ctx.transactions.some((t) => inCycle(t, c)));
  return { focus: finished[0] || current, current, finished: Boolean(finished[0]) };
}


export function overviewPage(ctx, rerender, param) {
  const { focus: c, current, finished } = focusCycle(ctx);
  // #overview/current shows the cycle you're in, even before the finished one is closed.
  if (param === 'current') return currentOverview(ctx, current, finished ? h('a', { href: '#overview', class: 'btn tap' }, `Back to ${c.name}`) : null);
  const txs = ctx.transactions.filter((t) => inCycle(t, c));
  const s = summarise(txs);
  const { budgets } = budgetsFor(ctx, c);
  const budgetTotal = Object.values(budgets).reduce((a, v) => a + v, 0);
  const daysIn = finished ? c.totalDays : current.dayNumber;
  const paceShare = finished ? 1 : c.dayNumber / c.totalDays;

  const lastClosed = [...ctx.ref.cycles].reverse().find((x) => x.closed_at);
  const closeBtn = finished ? twoStepButton(`Close the ${c.name} cycle`, `Tap again to close ${c.name}`, async () => {
    const row = await closeCycle(c);
    ctx.ref.cycles = [...ctx.ref.cycles.filter((x) => x.start_date !== row.start_date), row].sort((a, b) => a.start_date.localeCompare(b.start_date));
    rerender();
  }, 'btn primary') : null;
  const reopen = !finished && lastClosed ? h('button', { class: 'linkbtn', type: 'button', onclick: async () => {
    const row = await reopenCycle(lastClosed.id);
    ctx.ref.cycles = ctx.ref.cycles.map((x) => (x.id === row.id ? row : x));
    rerender();
  } }, `Reopen the ${cycleName({ end: lastClosed.end_date })} cycle`) : null;

  if (!finished) return currentOverview(ctx, current, reopen);

  const line = finished
    ? `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Finished: look it over, then close it to move on.`
    : `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Day ${c.dayNumber} of ${c.totalDays}.`;

  // ---- headline
  const left = budgetTotal - s.netSpent;
  const hero = h('section', { class: 'card hero', 'aria-label': finished ? 'How the cycle went' : 'This cycle so far' },
    h('div', { class: 'hero-main' },
      h('p', { class: 'muted small' }, finished ? 'Spent this cycle' : 'Spent so far'),
      h('div', { class: 'big display' }, pounds(s.netSpent)),
      h('div', { class: 'chips' },
        budgetTotal ? h('span', { class: 'chip' }, `${pounds(budgetTotal)} budgeted`) : null,
        h('span', { class: 'chip' }, `${pounds(s.netSpent / Math.max(1, daysIn))} a day`),
        finished ? h('span', { class: 'chip' }, `${c.totalDays} days`) : h('span', { class: 'chip' }, `${c.daysLeft + 1} days left`)),
      h('p', { class: 'muted small', style: { marginTop: '14px' } },
        !txs.length ? 'No spending yet this cycle.'
          : budgetTotal ? (left >= 0 ? `${pounds(left)} under your budgets.` : `${pounds(-left)} over your budgets. The table below shows where.`) : 'No budgets set for this cycle yet.')),
    h('div', { class: 'stats hero-side' },
      h('div', null, h('span', { class: 'muted' }, 'Money in'), h('span', null, formatPence(s.income))),
      h('div', null, h('span', { class: 'muted' }, 'Invested'), h('span', null, formatPence(s.invested))),
      h('div', null, h('span', { class: 'muted' }, 'Saved'), h('span', null, formatPence(s.saved))),
      h('div', null, h('span', { class: 'muted' }, 'Paid back to you'), h('span', null, formatPence(s.paidBack))),
      h('div', null, h('span', { class: 'muted' }, 'Waiting for your decision'), s.waiting ? h('a', { href: '#inbox', class: 'tap' }, `${s.waiting} to review`) : h('span', null, 'None'))));

  // ---- buckets
  const bucketRows = ctx.ref.buckets.map((b) => {
    const spent = s.byBucket[b.name] || 0;
    const budget = budgets[b.name];
    const p = budget ? pace(budget, spent, c) : null;
    return h('div', { class: 'brow' },
      h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour }, 'aria-hidden': 'true' }), b.name),
      budget ? bar(spent / budget, { colour: b.colour, tick: finished ? null : paceShare, over: spent > budget, label: `${pounds(spent)} of ${pounds(budget)}` })
        : h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }),
      h('span', { class: 'r' }, pounds(spent)),
      h('span', { class: 'r muted' }, budget ? pounds(budget) : 'No budget'),
      h('span', { class: `r ${budget && spent > budget ? 'over' : ''}` }, budget ? (spent > budget ? `${pounds(spent - budget)} over` : `${pounds(budget - spent)} left`) : '–'),
      !finished && p && spent > 0 ? h('span', { class: 'sr-only' }, p.onPace ? 'On pace' : 'Ahead of pace') : null);
  });
  const buckets = h('section', { class: 'card', 'aria-labelledby': 'bk' },
    h('h2', { id: 'bk' }, 'Buckets'),
    h('div', { class: 'brow bhead muted' }, h('span', null, 'Bucket'), h('span', null, finished ? 'Spent of budget' : 'This cycle'), h('span', { class: 'r' }, 'Spent'), h('span', { class: 'r' }, 'Budget'), h('span', { class: 'r' }, finished ? 'Result' : 'Left')),
    bucketRows,
    h('div', { class: 'brow btotal' }, h('span', null, 'Total'), h('span'), h('span', { class: 'r' }, pounds(s.netSpent)), h('span', { class: 'r' }, pounds(budgetTotal)), h('span', { class: `r ${left < 0 ? 'over' : ''}` }, left < 0 ? `${pounds(-left)} over` : `${pounds(left)} left`)));

  // ---- where it went
  const cats = ranked(s.byCategory);
  const top = cats[0]?.[1] || 1;
  const where = h('section', { class: 'card', 'aria-labelledby': 'wg' },
    h('h2', { id: 'wg' }, 'Where it went'),
    cats.length ? cats.map(([name, p]) => {
      const colour = ctx.ref.buckets.find((b) => b.id === ctx.ref.categories.find((k) => k.name === name)?.bucket_id)?.colour || 'var(--text-2)';
      return h('div', { class: 'crow' }, h('span', { class: 'cname' }, name), bar(p / top, { colour, label: pounds(p) }), h('span', { class: 'r' }, pounds(p)));
    }) : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending yet this cycle.'));

  const biggest = txs.filter((t) => t.kind === 'spend' && t.status !== 'needs_review').sort((a, b) => a.amount_pence - b.amount_pence).slice(0, 5);
  const big = h('section', { class: 'card', 'aria-labelledby': 'bg' },
    h('h2', { id: 'bg' }, 'Biggest payments'),
    biggest.length ? h('div', { class: 'stats' }, biggest.map((t) => h('div', null, h('span', null, h('span', null, t.raw_description), h('span', { class: 'muted small' }, ` · ${shortDay(t.date)}`)), h('span', null, formatPence(-t.amount_pence)))))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing yet.'),
    h('p', { style: { margin: '14px 0 0' } }, h('a', { href: `#transactions/${c.start}`, class: 'tap' }, `See all ${txs.length} transactions`)));

  const next = finished ? h('section', { class: 'card notice-card' },
    h('p', { style: { margin: 0 } }, `The ${current.name} cycle started on ${dayLabel(current.start)}. When you've finished looking over ${c.name}, close it and the Overview moves on to ${current.name}. `, h('a', { href: '#overview/current', class: 'tap' }, `Peek at ${current.name} so far`))) : null;

  return h('div', { class: 'page' },
    head('Overview', line, closeBtn, reopen),
    next,
    hero,
    h('div', { class: 'grid-main' }, buckets, h('div', { class: 'col' }, where, big)));
}

export function transactionsPage(ctx, param) {
  const cycles = cyclesFor(ctx);
  const c = cycles.find((x) => x.start === param) || cycles.find((x) => ctx.transactions.some((t) => inCycle(t, x))) || cycles[0];
  const list = ctx.transactions.filter((t) => inCycle(t, c));
  const picker = h('select', { class: 'input', id: 'cycle', 'aria-label': 'Pay cycle', style: { width: 'auto', minWidth: '260px' }, onchange: (e) => { location.hash = `transactions/${e.target.value}`; } },
    cycles.map((x) => h('option', { value: x.start, selected: x.start === c.start }, `${x.name} cycle (${shortDay(x.start)} to ${shortDay(x.end)})`)));
  return h('div', { class: 'page' },
    head('Transactions', `${list.length} in the ${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Older history is under History.`, picker),
    h('section', { class: 'card', 'aria-label': 'Transactions' }, txList(list, 'No transactions in this cycle yet.')));
}

export function morePage(ctx) {
  const extra = [...PAGES.filter((p) => !['overview', 'transactions', 'budgets'].includes(p.id)), { id: 'settings', label: 'Settings' }];
  return h('div', { class: 'page' },
    head('More', ctx.email),
    h('section', { class: 'card', 'aria-label': 'More pages' },
      h('div', { class: 'stats' }, extra.map((p) => h('div', null, h('a', { href: `#${p.id}`, class: 'morelink' }, p.label, p.id === 'inbox' && ctx.inboxCount ? h('span', { class: 'badge' }, String(ctx.inboxCount)) : null)))),
      h('button', { class: 'btn', type: 'button', style: { marginTop: '16px', width: '100%' }, onclick: ctx.signOut }, 'Sign out')));
}

const COMING = { trends: 7, goals: 6, wealth: 6, settings: 6, add: 5 };
export function placeholderPage(id) {
  const label = id === 'add' ? 'Add a transaction' : (PAGES.find((p) => p.id === id)?.label || 'Settings');
  return h('div', { class: 'page' }, head(label),
    h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, COMING[id] ? `This screen is built in Phase ${COMING[id]} of the plan.` : 'This screen doesn’t exist yet.')));
}
