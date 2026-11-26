// Planning → Budgets: how each budget is going this cycle. Allocated (from the Payday plan), rolled over from last
// cycle, spent, left, where even spending would put you today (pace), and where you'll end up at this rate
// (projected), with warnings. A budget you cut on purpose is shown as a cut, not a mistake. Categories, rollover
// and bills are set up on Manage.
import { h } from '../ui/dom.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { budgetOverview } from '../lib/planning.js';
import { head, shortDay, pounds, bar } from '../ui/parts.js';
import { cycleState, budgetsFor, currentCycle, paydaysOf, usualDay } from './state.js';
import { historyRows } from './history.js';
import { stateHref } from './explorer.js';

export function budgetsPage(ctx, param) {
  const cur = currentCycle(ctx);
  const rows = historyRows(ctx.all);
  const first = rows.reduce((m, t) => (t.date < m ? t.date : m), ctx.today);
  const cycles = cycleList(paydaysOf(ctx), first, ctx.today, usualDay(ctx)).slice(0, 12);
  const c = cycles.find((x) => x.start === param) || cycles[0];
  const finished = c.end < ctx.today;
  const st = cycleState(ctx, c, rows);
  const prevBudgets = budgetsFor(ctx, st.prev).budgets;
  const list = budgetOverview({ eff: st.eff, spent: st.s.byBucket, prevBudgets, cycle: c, finished });
  const colour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));
  const sel = c.start === cur.start ? { kind: 'current' } : { kind: 'cycle', start: c.start };
  const tot = list.reduce((a, r) => ({ total: a.total + r.total, actual: a.actual + r.actual, expected: a.expected + r.expected, projected: r.projected === null || a.projected === null ? null : a.projected + r.projected, carried: a.carried + r.carried, allocated: a.allocated + r.allocated }), { total: 0, actual: 0, expected: 0, projected: 0, carried: 0, allocated: 0 });
  const unbudgeted = ctx.ref.buckets.filter((b) => !st.eff[b.name] && st.s.byBucket[b.name]);

  const picker = h('select', { class: 'input', 'aria-label': 'Pay cycle', style: { width: 'auto' }, onchange: (e) => { location.hash = `budgets/${e.target.value}`; } },
    cycles.map((x) => h('option', { value: x.start, selected: x.start === c.start }, `${cycleName(x)} ${x.end.slice(0, 4)} cycle${x.start === cur.start ? ' (current)' : ''}`)));
  const tile = (label, value, sub, cls = '') => h('div', { class: 'card tile' }, h('span', { class: 'muted small' }, label), h('span', { class: `tile-v display ${cls}` }, value), sub ? h('span', { class: 'muted small' }, sub) : null);

  const card = (r) => h('section', { class: `card bcard ${r.warnings.length ? 'warn' : ''}`, 'aria-label': r.bucket },
    h('div', { class: 'ch' }, h('h2', null, h('span', { class: 'dot', style: { background: colour[r.bucket], marginRight: '8px' } }), r.bucket),
      h('a', { href: stateHref('spending', sel, { bucket: r.bucket, savings: false }), class: 'tap small' }, 'See spending')),
    h('div', { class: 'bc-big' }, h('span', { class: 'display' }, pounds(r.actual)), h('span', { class: 'muted' }, ` of ${pounds(r.total)}`),
      h('span', { class: `bc-left ${r.remaining < 0 ? 'over' : 'good'}` }, r.remaining < 0 ? `${pounds(-r.remaining)} over` : `${pounds(r.remaining)} left`)),
    bar(r.actual / Math.max(1, r.total), { colour: colour[r.bucket], tick: finished ? null : c.dayNumber / c.totalDays, over: r.actual > r.total, label: `${pounds(r.actual)} of ${pounds(r.total)}` }),
    h('div', { class: 'bc-grid small' },
      h('div', null, h('span', { class: 'muted' }, 'Allocated'), h('span', null, pounds(r.allocated))),
      h('div', null, h('span', { class: 'muted' }, 'Rolled over'), h('span', null, r.carried ? `+${pounds(r.carried)}` : '–')),
      h('div', null, h('span', { class: 'muted' }, finished ? 'Result' : 'Pace today'),
        h('span', { class: (finished ? r.remaining < 0 : r.ahead > 0) ? 'over' : 'good' }, finished ? (r.remaining < 0 ? 'Over' : 'Under') : r.ahead > 0 ? `${pounds(r.ahead)} over` : `${pounds(-r.ahead)} under`)),
      h('div', null, h('span', { class: 'muted' }, finished ? 'Spent' : 'Projected (estimate)'), h('span', { class: r.projected !== null && r.projected > r.total ? 'over' : r.projected === null ? 'muted' : '' }, r.projected === null ? 'Too early' : pounds(r.projected)))),
    r.reduced ? h('p', { class: 'bc-note small' }, `Cut on purpose from ${pounds(r.reduced.from)} to ${pounds(r.reduced.to)} this cycle.`) : null,
    r.warnings.map((w) => h('p', { class: `bc-warn small ${w.level}` }, w.level === 'over' ? `Over budget by ${pounds(r.actual - r.total)}.` : `At this rate you’ll spend ${pounds(r.projected)}, ${pounds(r.projected - r.total)} over.`)));

  const paceOver = finished ? tot.actual > tot.total : tot.actual > tot.expected;
  return h('div', { class: 'page' },
    head('Budgets', finished ? `${cycleName(c)} cycle, ${shortDay(c.start)} to ${shortDay(c.end)} (finished).` : `${cycleName(c)} cycle, day ${c.dayNumber} of ${c.totalDays}. Pace is where even spending would put you today.`, picker,
      h('a', { href: '#plan', class: 'btn tap' }, 'Change amounts'), h('a', { href: '#manage', class: 'btn tap' }, 'Manage categories')),
    list.length ? h('div', { class: 'tiles' },
      tile('Allocated', pounds(tot.allocated), tot.carried ? `+${pounds(tot.carried)} rolled over` : 'from your payday plan'),
      tile('Spent', pounds(tot.actual), 'budgeted buckets, from pay'),
      tile(tot.total - tot.actual < 0 ? 'Over budget' : 'Left', pounds(Math.abs(tot.total - tot.actual)), tot.total - tot.actual < 0 ? 'across budgeted buckets' : null, tot.total - tot.actual < 0 ? 'over' : ''),
      tile(finished ? 'Result' : 'Pace today', finished ? (tot.actual > tot.total ? 'Over' : 'Under') : `${pounds(Math.abs(tot.actual - tot.expected))} ${tot.actual > tot.expected ? 'over' : 'under'}`, finished ? null : `even spending: ${pounds(tot.expected)}`, paceOver ? 'over' : 'good'),
      tile(finished ? 'Spent' : 'Projected (estimate)', tot.projected === null ? 'Too early' : pounds(tot.projected), finished ? null : tot.projected === null ? 'needs 4 days of spending' : `at this rate, of ${pounds(tot.total)}`, tot.projected !== null && tot.projected > tot.total ? 'over' : ''),
      tile('Warnings', String(list.filter((r) => r.warnings.length).length), `${list.filter((r) => r.reduced).length} cut on purpose`))
      : h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'No budgets for this cycle yet. ', h('a', { href: '#plan', class: 'tap' }, 'Set them on the Payday plan'))),
    h('div', { class: 'grid2' }, list.map(card)),
    unbudgeted.length ? h('p', { class: 'muted small' }, `Not budgeted (tracked only): ${unbudgeted.map((b) => `${b.name} ${pounds(st.s.byBucket[b.name])}`).join(', ')}.`) : null,
    h('p', { class: 'muted small' }, 'Projected = spent so far ÷ days gone × days in the cycle. Big buys paid from savings don’t count against budgets. A budget lower than last cycle’s is treated as a deliberate cut.'));
}
