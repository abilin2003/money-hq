// Trends: how your money moves across pay cycles (spec section 9 charts). Every chart needs at least 3 complete
// cycles (rule 10); history from your old dashboard counts, so these work straight away.
import { h } from '../ui/dom.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { summarise } from '../lib/summary.js';
import { categoryChanges, bridgeSteps, netWorthSeries } from '../lib/analytics.js';
import { resolvePeriod } from '../lib/period.js';
import { periodInfo, stateHref } from './explorer.js';
import { insightsFor, insightCard } from './insights.js';
import { normKey } from '../lib/text.js';
import { head, shortDay, pounds, bar, inCycle } from '../ui/parts.js';
import { stackedBars, groupedBars, lineChart, bridgeChart } from '../ui/charts.js';
import { historyRows } from './history.js';
import { currentCycle, paydaysOf, usualDay } from './state.js';

const NEEDS = 3;

export function trendsPage(ctx, rerender) {
  const rows = historyRows(ctx.all);
  const cur = currentCycle(ctx);
  const first = rows.map((t) => t.date).sort()[0] || ctx.today;
  // Complete cycles only (the one you're in isn't finished yet), oldest first, at most 12.
  const all = cycleList(paydaysOf(ctx), first, ctx.today, usualDay(ctx)).filter((c) => c.end < cur.start && c.start >= first); // complete cycles only: finished, and fully inside your records
  if (ctx.period?.kind === 'last') ctx.trendsCount = ctx.period.n; // picked "last n cycles" on Spending: show the same here
  const n = Math.min(ctx.trendsCount || 6, all.length);
  const cycles = all.slice(0, n).reverse();
  const sums = cycles.map((c) => ({ c, s: summarise(rows.filter((t) => inCycle(t, c)), ctx.splitMap, ctx.settled), txs: rows.filter((t) => inCycle(t, c)) }));
  const labels = cycles.map((c) => `${cycleName(c).slice(0, 3)} ${c.end.slice(2, 4)}`);

  const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'How many cycles' },
    [[3, '3 cycles'], [6, '6 cycles'], [12, '12 cycles']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(n === Math.min(k, all.length) && (ctx.trendsCount || 6) === k), onclick: () => { ctx.trendsCount = k; ctx.period = { kind: 'last', n: k }; rerender(); } }, l)));

  if (all.length < NEEDS) {
    return h('div', { class: 'page' }, head('Trends'),
      h('section', { class: 'card' }, h('h2', null, `Needs ${NEEDS} pay cycles`), h('p', { class: 'muted', style: { margin: 0 } }, `Trends compare whole pay cycles. You have ${all.length} complete so far; ${NEEDS - all.length} more to go.`)));
  }

  const bucketColour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));
  const bucketNames = [...ctx.ref.buckets.map((b) => b.name), 'No bucket'];
  const avg = Math.round(sums.reduce((a, x) => a + x.s.netSpent, 0) / sums.length);
  const last = sums[sums.length - 1];
  const prev = sums[sums.length - 2];

  // 1. Spending per cycle, stacked by bucket, with the average
  const stacked = h('section', { class: 'card', 'aria-labelledby': 't1' },
    h('div', { class: 'ch' }, h('h2', { id: 't1' }, 'Spending per pay cycle'), h('span', { class: 'muted small' }, `Average ${pounds(avg)}`)),
    stackedBars({ labels, series: bucketNames.map((b) => ({ name: b, colour: bucketColour[b] || '#5F6B7A', values: sums.map((x) => Math.max(0, x.s.byBucket[b] || 0)) })), avg, onPick: () => { location.hash = 'history'; }, label: 'Spending per pay cycle by bucket' }),
    h('div', { class: 'legend' }, ctx.ref.buckets.map((b) => h('span', null, h('span', { class: 'dot', style: { background: b.colour } }), ` ${b.name}`))));

  // 2. Which categories cost most, with change since the cycle before
  const changes = categoryChanges(last.s, prev.s).filter((x) => x.now > 0).slice(0, 12);
  const top = changes[0]?.now || 1;
  const catColour = (name) => bucketColour[ctx.ref.buckets.find((b) => b.id === ctx.ref.categories.find((k) => k.name === name)?.bucket_id)?.name] || 'var(--text-2)';
  const cats = h('section', { class: 'card', 'aria-labelledby': 't2' },
    h('div', { class: 'ch' }, h('h2', { id: 't2' }, 'Which categories cost most'), h('span', { class: 'muted small' }, `${cycleName(last.c)} cycle vs ${cycleName(prev.c)}`)),
    changes.map((x) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, x.name), bar(x.now / top, { colour: catColour(x.name), label: pounds(x.now) }), h('span', { class: 'r' }, pounds(x.now)), h('span', { class: `r small ${x.change > 0 ? 'over' : 'muted'}` }, x.before ? `${x.change > 0 ? '+' : '−'}${pounds(Math.abs(x.change))}` : 'new'))));

  // 3. What changed since last cycle: a bridge, one step per bucket
  const bridge = h('section', { class: 'card', 'aria-labelledby': 't3' },
    h('h2', { id: 't3' }, 'What changed since the cycle before'),
    bridgeChart({ fromLabel: cycleName(prev.c), from: prev.s.netSpent, steps: bridgeSteps(prev.s, last.s), toLabel: cycleName(last.c), label: `From ${pounds(prev.s.netSpent)} to ${pounds(last.s.netSpent)}` }));

  // 4. In vs out vs invested, and savings rate
  const io = h('section', { class: 'card', 'aria-labelledby': 't4' },
    h('h2', { id: 't4' }, 'Money in, spent and invested'),
    groupedBars({ labels, series: [{ name: 'In', colour: '#5BD6A0', values: sums.map((x) => x.s.income) }, { name: 'Spent', colour: '#F472B6', values: sums.map((x) => x.s.totalSpent) }, { name: 'Invested and saved', colour: '#8B9CFF', values: sums.map((x) => x.s.invested + x.s.saved) }] }));
  const rate = sums.map((x) => (x.s.income > 0 ? Math.round(((x.s.invested + x.s.saved) / x.s.income) * 100) : null));
  const rateCard = h('section', { class: 'card', 'aria-labelledby': 't5' },
    h('h2', { id: 't5' }, 'Savings rate per cycle'),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Invested and saved, as a share of the money that came in.'),
    lineChart({ labels, series: [{ name: 'Savings rate', colour: '#5BD6A0', values: rate }], percent: true, label: 'Savings rate per cycle' }));

  // 5. Income by source (salary vs everything else)
  const salaryish = (t) => t.kind === 'income' && (t.amount_pence >= 150000 || /salary|ltd|limited|payroll|wage/i.test(normKey(t.raw_description)));
  const income = h('section', { class: 'card', 'aria-labelledby': 't6' },
    h('h2', { id: 't6' }, 'Income by source'),
    stackedBars({ labels, series: [
      { name: 'Salary', colour: '#5BD6A0', values: sums.map((x) => x.txs.filter((t) => t.status !== 'needs_review' && salaryish(t)).reduce((a, t) => a + t.amount_pence, 0)) },
      { name: 'Other income', colour: '#F7B955', values: sums.map((x) => x.txs.filter((t) => t.status !== 'needs_review' && t.kind === 'income' && !salaryish(t)).reduce((a, t) => a + t.amount_pence, 0)) },
    ], label: 'Income by source per cycle' }),
    h('div', { class: 'legend' }, h('span', null, h('span', { class: 'dot', style: { background: '#5BD6A0' } }), ' Salary'), h('span', null, h('span', { class: 'dot', style: { background: '#F7B955' } }), ' Other income (freelance, refunds counted as income)')));

  // 6. Am I getting richer? Net worth from your balances
  const nw = netWorthSeries(ctx.ref.accounts || [], ctx.ref.snapshots || []);
  const worth = h('section', { class: 'card', 'aria-labelledby': 't7' },
    h('div', { class: 'ch' }, h('h2', { id: 't7' }, 'Net worth'), h('a', { href: '#wealth', class: 'tap muted small' }, 'Update balances')),
    nw.length >= 2 ? lineChart({ labels: nw.map((p) => shortDay(p.date)), series: [{ name: 'Net worth', colour: '#8B9CFF', values: nw.map((p) => p.total) }], label: 'Net worth over time' })
      : h('p', { class: 'muted', style: { margin: 0 } }, nw.length ? 'One set of balances so far. Update them on money day and the line starts here.' : 'Enter your balances on the Wealth page and your net worth line starts here.'));

  // 7. The most important insights across these cycles (the rest are on Analytics → Insights)
  const info = periodInfo(ctx);
  const per = resolvePeriod({ kind: 'last', n: [3, 6, 12].includes(n) ? n : 6 }, info);
  const found = insightsFor(ctx, per, info);
  const ins = h('section', { 'aria-labelledby': 't8' }, h('div', { class: 'ch' }, h('h2', { id: 't8', class: 'section-h' }, 'Insights'), h('a', { href: stateHref('insights', per.sel), class: 'tap small' }, `All ${found.length}`)),
    found.length ? h('div', { class: 'ins-grid' }, found.slice(0, 3).map((i) => insightCard(i, stateHref('spending', per.sel, i.filter), { compact: true }))) : h('p', { class: 'muted' }, 'Nothing stands out across these cycles.'));

  return h('div', { class: 'page' },
    head('Trends', `The last ${n} complete pay cycles, ${shortDay(cycles[0].start)} to ${shortDay(cycles[cycles.length - 1].end)}.`, toggle),
    stacked,
    bridge,
    cats,
    h('div', { class: 'grid-even' }, io, rateCard),
    h('div', { class: 'grid-even' }, income, worth),
    ins);
}
