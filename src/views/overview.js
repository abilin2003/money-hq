// Overview: your money right now, for the cycle you're in (or a finished cycle you're looking over). Laid out by
// importance rather than as a grid of identical cards:
//   1. Header: which cycle, which day, when payday is, and the actions.
//   2. Financial position: one band. Safe to spend (or how the finished cycle went) large, with three supporting
//      figures beside it: spent against budget (compared with the same point last cycle), saved and invested
//      (against the plan) and net worth.
//   3. Spending performance: the main chart, wide, with last cycle's real curve, a projection to payday once there's
//      enough of the cycle to go on, and a tooltip; payday countdown and upcoming bills beside it.
//   4. Financial control: buckets, recent transactions and what needs attention, as three columns of one panel.
//   5. Insights: the two most useful, each linking to the payments behind it.
// Phone: the same pieces in their own order: position, anything needing attention, chart, payday, buckets, recent,
// insights. All figures come from the same calculations as everywhere else (state.js, summary.js).
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { pace } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { upcomingBills } from '../lib/budget.js';
import { dailySpend, cumulative, netWorth } from '../lib/analytics.js';
import { resolvePeriod } from '../lib/period.js';
import { shortDay, dayLabel, pounds, bar, inCycle } from '../ui/parts.js';
import { paceChart } from '../ui/charts.js';
import { cycleState, cycleFigures, currentCycle, budgetsFor } from './state.js';
import { MIN_DAYS_TO_PROJECT, alignToCycle } from '../lib/planning.js';
import { myAccounts, balancesOf, owedToYou } from './accounts.js';
import { trackedNetWorth } from '../lib/balances.js';
import { historyRows } from './history.js';
import { periodInfo, stateHref } from './explorer.js';
import { insightsFor } from './insights.js';

const signed = (p) => `${p < 0 ? '−' : ''}${pounds(Math.abs(p))}`;
const money = (pence, cls = '') => {
  const [whole, frac] = formatPence(pence).split('.');
  return h('span', { class: `fig ${cls}` }, whole, h('span', { class: 'fig-p' }, `.${frac}`));
};
// planned = from your budgets or payday plan; actual = from imported transactions; verified = a balance you typed
// in recently; estimated = a typed-in balance moved on by later transactions, or worked out from transactions.
const TAG_HELP = { planned: 'From your budgets or payday plan, not your bank balances', actual: 'From your imported transactions', verified: 'A balance you typed in recently', estimated: 'Worked out from transactions since your last typed-in balance', 'not verified': 'No balance to check against yet', stale: 'The balance you typed in is over 35 days old' };
export const kindTag = (kind) => h('span', { class: `ktag k-${kind.replace(/\s+/g, '-')}`, title: TAG_HELP[kind] || null }, kind);

// Safe to spend is worked out from your budgets. The cash check compares it with the money actually in your
// current accounts, once you've typed their balances in (Wealth): it never assumes a balance.
// The allowance is planned; safe-to-spend cash is the lower of it and what your current accounts really hold after
// bills, and only exists once you've typed those balances in.
// How the allowance is made up, e.g. "£325.00 left in your budgets − £74.92 bills still to come out".
function allowanceSum(safe) {
  const parts = safe.lines.filter((l, i) => i === 0 || l.pence);
  if (parts.length < 2) return null;
  return h('p', { class: 'muted small', style: { margin: '2px 0 0' } }, parts.map((l, i) => `${i ? (l.pence < 0 ? ' − ' : ' + ') : ''}${formatPence(Math.abs(l.pence))} ${i ? l.label.toLowerCase() : 'left in your budgets'}`).join(''));
}
// Lines still waiting in the inbox aren't in any of these figures yet: say so, so nothing looks more complete
// than it is.
const pendingNote = (count) => (count ? h('p', { class: 'pos-check warn' }, `${count} line${count === 1 ? '' : 's'} waiting in your inbox ${count === 1 ? 'isn’t' : 'aren’t'} counted in these figures yet. `, h('a', { href: '#inbox' }, 'Review')) : null);
function cashLine(cash, safe, waiting = 0) {
  if (cash.status === 'unknown') return [h('p', { class: 'pos-check' }, kindTag('not verified'), ' From your budgets. Safe-to-spend cash appears once your current-account balances are entered.'), pendingNote(waiting)];
  const safeCash = Math.max(0, Math.min(safe.total, cash.available));
  return [h('p', { class: `pos-check ${cash.available < safe.total ? 'warn' : ''}` }, kindTag(cash.status), ` Safe-to-spend cash: ${formatPence(safeCash)}`,
    cash.available < safe.total ? ` (your accounts hold ${formatPence(Math.max(0, cash.available))} after bills, less than the allowance)` : ` (your accounts hold ${formatPence(cash.total)})`), pendingNote(waiting)];
}

const metric = (label, tag, value, ...rest) => h('div', { class: 'metric' }, h('p', { class: 'm-label' }, label, tag ? kindTag(tag) : null), h('div', { class: 'm-value' }, value), ...rest);
const delta = (pence, betterWhenLower = true) => {
  const good = betterWhenLower ? pence < 0 : pence > 0;
  return h('span', { class: `delta ${pence === 0 ? '' : good ? 'good' : 'over'}` }, pence === 0 ? 'The same as' : `${pence > 0 ? '▲' : '▼'} ${pounds(Math.abs(pence))} ${pence > 0 ? 'more' : 'less'} than`);
};

export function overviewView(ctx, c, { finished = false, actions = [], notice = null } = {}) {
  const st = cycleState(ctx, c);
  const { s, eff, safe } = st;
  const f = cycleFigures(ctx, c, st, finished);
  const { budgetTotal, spentBudgeted, unbudgeted, today } = f;
  const budgetSet = new Set(Object.keys(st.effTotals));
  const only = budgetTotal ? budgetSet : null;
  const budgetDays = dailySpend(st.txs, c, ctx.splitMap, ctx.settled, only);
  const spentByDay = cumulative(budgetDays, today);
  // last cycle's real running total (same buckets), for the chart and "at this point last cycle"
  const prevRows = historyRows(ctx.all).filter((t) => inCycle(t, st.prev));
  // Cycles differ in length, so last cycle is lined up by how far through it was: day 10 of a 25-day cycle is
  // compared with the point 40% through last cycle, and both end on payday.
  const prevCum = prevRows.length ? cumulative(dailySpend(prevRows, st.prev, ctx.splitMap, ctx.settled, only), st.prev.totalDays) : null;
  const lastByDay = prevCum ? alignToCycle(prevCum, c.totalDays) : null;
  const lastAtToday = lastByDay ? lastByDay[Math.min(today, lastByDay.length) - 1] : null;
  const nw = netWorth(ctx.ref.accounts, ctx.ref.snapshots || [], ctx.today);
  const p = budgetTotal ? pace(budgetTotal, spentBudgeted, { ...c, dayNumber: today }) : null;
  // A projection only once there's enough of the cycle to go on (4 days or more, with some spending).
  const projection = !finished && p && today >= MIN_DAYS_TO_PROJECT && spentBudgeted > 0 ? p.projected : null;

  // ---- 1. header
  const header = h('header', { class: 'ov-head' },
    h('div', null,
      h('p', { class: 'ov-eyebrow' }, finished ? 'Finished · ready for its review' : `Day ${c.dayNumber} of ${c.totalDays} · payday ${dayLabel(c.next)}${c.predicted ? ' (predicted)' : ''}`),
      h('h1', { class: 'ov-title display' }, h('span', { class: 'sr-only' }, 'Overview: '), `${c.name} cycle`),
      h('p', { class: 'ov-dates' }, `${shortDay(c.start)} – ${shortDay(c.end)}`)),
    h('div', { class: 'head-actions' }, actions));

  // ---- 2. financial position
  const primary = finished
    ? h('div', { class: 'pos-primary' },
      h('p', { class: 'm-label' }, 'How the cycle went', kindTag('actual')),
      h('div', { class: 'pos-figure display' }, budgetTotal ? [pounds(Math.abs(budgetTotal - spentBudgeted)), h('span', { class: `pos-unit ${spentBudgeted > budgetTotal ? 'over' : 'good'}` }, spentBudgeted <= budgetTotal ? ' under budget' : ' over budget')] : pounds(s.totalSpent)),
      h('p', { class: 'pos-sub' }, budgetTotal ? `${pounds(spentBudgeted)} spent of ${pounds(budgetTotal)} budgeted · ${pounds(s.netSpent / c.totalDays)} a day` : `${pounds(s.netSpent / c.totalDays)} a day`))
    : h('div', { class: 'pos-primary' },
      h('p', { class: 'm-label' }, 'Spending allowance left', kindTag('planned')),
      h('div', { class: 'pos-figure display' }, money(safe.total)),
      h('p', { class: 'pos-sub' }, `${formatPence(safe.perDay)} a day for ${safe.daysLeft} day${safe.daysLeft === 1 ? '' : 's'}`, safe.short ? h('span', { class: 'over' }, ` · ${pounds(safe.short)} past safe`) : null),
      allowanceSum(safe),
      cashLine(f.cash, safe, ctx.inboxCount || 0));
  const spentMetric = budgetTotal
    ? metric('Spent vs budget', 'actual', [h('span', { class: 'fig' }, pounds(spentBudgeted)), h('span', { class: 'm-of' }, ` / ${pounds(budgetTotal)}`)],
      bar(spentBudgeted / budgetTotal, { tick: finished ? null : today / c.totalDays, over: spentBudgeted > budgetTotal, label: `${pounds(spentBudgeted)} of ${pounds(budgetTotal)}` }),
      h('p', { class: 'm-sub' }, lastAtToday !== null ? [delta(spentBudgeted - lastAtToday), finished ? ' last cycle' : ' at this point last cycle'] : `All spending ${pounds(s.totalSpent)}`),
      unbudgeted > 0 || s.fromSavings ? h('p', { class: 'm-sub' }, `All spending ${pounds(s.totalSpent)}: ${[unbudgeted > 0 ? `${pounds(unbudgeted)} unbudgeted` : null, s.fromSavings ? `${pounds(s.fromSavings)} from savings` : null].filter(Boolean).join(', ')}`) : null)
    : metric('Spent this cycle', 'actual', h('span', { class: 'fig' }, pounds(s.totalSpent)), h('p', { class: 'm-sub' }, 'No budgets set. ', h('a', { href: '#plan' }, 'Set them')));
  const putAway = s.saved + s.invested;
  const plannedAway = f.plannedOf('saved') + f.plannedOf('invested');
  const savedMetric = metric('Saved and invested', 'actual', h('span', { class: 'fig' }, signed(putAway)),
    plannedAway ? bar(Math.max(0, putAway) / plannedAway, { colour: 'var(--good)', label: `${pounds(putAway)} of ${pounds(plannedAway)} planned` }) : null,
    h('p', { class: 'm-sub' }, `Cash savings ${signed(s.saved)} · investments ${signed(s.invested)}${plannedAway ? ` · ${pounds(plannedAway)} planned` : ''}`));
  const live = trackedNetWorth(balancesOf(ctx), owedToYou(ctx));
  const worthMetric = metric('Net worth', live.status === 'unknown' ? null : live.status, live.status !== 'unknown' ? h('span', { class: 'fig' }, signed(live.total)) : h('span', { class: 'fig muted-fig' }, 'Not verified'),
    h('p', { class: 'm-sub' }, live.status === 'unknown' ? 'Appears once balances are entered. ' : live.status === 'verified' ? 'Your typed-in balances. ' : `Typed-in balances plus what’s happened since${live.unknown.length ? ` (${live.unknown.join(', ')} not entered)` : ''}. `, h('a', { href: '#wealth' }, 'Wealth')));
  const position = h('section', { class: 'ov-position', 'aria-label': 'Financial position' }, primary, h('div', { class: 'pos-metrics' }, spentMetric, savedMetric, worthMetric));

  // ---- 3. spending performance
  let line;
  if (!s.count) line = 'No spending yet this cycle.';
  else if (!budgetTotal) line = finished ? 'No budgets were set for this cycle.' : 'No budgets set for this cycle yet.';
  else if (finished) line = `${spentBudgeted <= budgetTotal ? `${pounds(budgetTotal - spentBudgeted)} under` : `${pounds(spentBudgeted - budgetTotal)} over`} your budgets.`;
  else line = p.onPace ? `On pace: ${pounds(p.expected - spentBudgeted)} under the budget line for today.` : `Ahead of pace: ${pounds(spentBudgeted - p.expected)} over the budget line for today.`;
  const tip = h('div', { class: 'chart-tip', hidden: true, 'aria-hidden': 'true' });
  const readout = h('p', { class: 'sr-only', 'aria-live': 'polite' }, line);
  const chart = paceChart({ days: c.totalDays, today, spentByDay, budget: budgetTotal, lastTotal: f.prevBudgeted, lastByDay, projection, wide: true,
    dayTick: (d) => shortDay(addDays(c.start, d)), startLabel: shortDay(c.start), endLabel: finished ? shortDay(c.end) : `Payday ${shortDay(c.next)}`, todayLabel: finished ? null : 'Today',
    onDay: (d) => {
      if (!d) { tip.hidden = true; readout.textContent = line; return; }
      const date = dayLabel(addDays(c.start, d.day - 1));
      tip.replaceChildren(h('strong', null, date),
        d.spent === null ? h('span', { class: 'muted' }, 'Still to come') : h('span', null, h('i', { class: 'sw sw-actual' }), `Spent ${pounds(d.spent)}`),
        d.budgetLine !== null ? h('span', null, h('i', { class: 'sw sw-budget' }), `Budget line ${pounds(d.budgetLine)}`) : null,
        d.lastLine !== null ? h('span', null, h('i', { class: 'sw sw-last' }), `Last cycle ${pounds(d.lastLine)}`) : null);
      tip.hidden = false;
      tip.style.left = `${Math.min(82, Math.max(10, d.x * 100))}%`;
      tip.style.top = `${Math.max(4, d.y * 100 - 34)}%`;
      readout.textContent = `${date}: ${d.spent === null ? 'still to come' : `${pounds(d.spent)} spent so far`}${d.budgetLine !== null ? `, budget line ${pounds(d.budgetLine)}` : ''}${d.lastLine !== null ? `, last cycle ${pounds(d.lastLine)}` : ''}.`;
    } });
  const legend = h('div', { class: 'legend-row', 'aria-hidden': 'true' },
    h('span', null, h('i', { class: 'sw sw-actual' }), 'Actual'), budgetTotal ? h('span', null, h('i', { class: 'sw sw-budget' }), 'Budget pace') : null,
    lastByDay || f.prevBudgeted ? h('span', null, h('i', { class: 'sw sw-last' }), 'Last cycle') : null, projection ? h('span', null, h('i', { class: 'sw sw-proj' }), 'Projected') : null);
  const stat = (label, value, cls = '') => h('div', { class: 'pstat' }, h('span', { class: 'm-label' }, label), h('span', { class: `pstat-v ${cls}` }, value));
  const stats = budgetTotal ? h('div', { class: 'perf-stats' },
    finished ? stat('Budgeted buckets', `${pounds(spentBudgeted)} of ${pounds(budgetTotal)}`, spentBudgeted > budgetTotal ? 'over' : 'good')
      : stat('Against the budget line', p.onPace ? `${pounds(p.expected - spentBudgeted)} under` : `${pounds(spentBudgeted - p.expected)} over`, p.onPace ? 'good' : 'over'),
    !finished ? stat('Projected at payday', projection ? pounds(projection) : 'Too early to say', projection ? (projection > budgetTotal ? 'over' : 'good') : 'muted') : null,
    lastAtToday !== null ? stat(finished ? 'Last cycle' : 'Last cycle at this point', pounds(lastAtToday)) : null) : null;
  const perf = h('section', { class: 'ov-perf', 'aria-labelledby': 'op-h' },
    h('div', { class: 'sec-head' }, h('h2', { id: 'op-h' }, 'Spending performance'), legend, h('a', { href: stateHref('spending', c.start === currentCycle(ctx).start ? { kind: 'current' } : { kind: 'cycle', start: c.start }), class: 'sec-link' }, 'Full breakdown →')),
    h('div', { class: 'chart-wrap' }, chart, tip), readout, stats,
    budgetTotal ? h('p', { class: 'fine' }, 'Budgeted buckets only. Point at or tap the chart to read any day.') : null);

  // ---- payday and bills
  const soon = finished ? st.bills : upcomingBills(ctx.ref.bills || [], ctx.today, 14, ctx.transactions);
  const payday = h('section', { class: 'ov-payday', 'aria-labelledby': 'opd-h' },
    !finished ? h('div', { class: 'countdown' },
      h('span', { class: 'cd-num display' }, String(c.daysLeft + 1)),
      h('span', null, h('span', { class: 'cd-unit' }, `day${c.daysLeft ? 's' : ''} to payday`), h('br'), h('span', { class: 'muted small' }, `${dayLabel(c.next)}${c.predicted ? ' (predicted)' : ''}`))) : null,
    !finished ? h('div', { class: 'cycle-track', role: 'img', 'aria-label': `Day ${c.dayNumber} of ${c.totalDays}` }, h('span', { style: { width: `${(c.dayNumber / c.totalDays) * 100}%` } })) : null,
    h('div', { class: 'sec-head small-head' }, h('h2', { id: 'opd-h' }, finished ? 'Bills this cycle' : 'Next 14 days'), h('span', { class: 'muted small' }, soon.length ? pounds(soon.reduce((a, b) => a + b.amount_pence, 0)) : '')),
    soon.length ? h('ul', { class: 'bill-list' }, soon.slice(0, 5).map((b) => h('li', null,
      h('span', { class: `bl-date ${!finished && b.date === ctx.today ? 'today' : ''}` }, !finished && b.date === ctx.today ? 'Today' : shortDay(b.date)),
      h('span', { class: 'bl-name' }, b.name, finished && !b.paid ? h('span', { class: 'muted' }, ' · not seen') : null),
      h('span', { class: 'bl-amt' }, formatPence(b.amount_pence)))))
      : h('p', { class: 'muted small', style: { margin: 0 } }, finished ? 'No bills this cycle.' : 'No bills in the next 14 days.'),
    h('a', { href: '#bills', class: 'sec-link' }, 'All bills →'));

  // ---- 4. financial control: buckets, recent transactions, what needs attention
  const share = today / c.totalDays;
  const bucketsCol = h('div', { class: 'ctl-col ctl-buckets', 'aria-labelledby': 'ob-h', role: 'region' },
    h('div', { class: 'sec-head small-head' }, h('h2', { id: 'ob-h' }, 'Buckets'), h('a', { href: '#budgets', class: 'sec-link' }, 'Budgets →')),
    ctx.ref.buckets.map((b) => {
      const spent = s.byBucket[b.name] || 0;
      const e = eff[b.name];
      const left = e ? e.total - spent : null;
      return h('a', { href: stateHref('spending', c.start === currentCycle(ctx).start ? { kind: 'current' } : { kind: 'cycle', start: c.start }, { bucket: b.name }), class: 'bk2' },
        h('span', { class: 'bk2-name' }, h('span', { class: 'dot', style: { background: b.colour } }), b.name),
        h('span', { class: 'bk2-fig' }, pounds(spent), e ? h('span', { class: 'm-of' }, ` / ${pounds(e.total)}`) : null),
        h('span', { class: `bk2-left ${left !== null && left < 0 ? 'over' : ''}` }, left === null ? 'no budget' : left < 0 ? `${pounds(-left)} over` : `${pounds(left)} left`),
        e ? bar(spent / e.total, { colour: b.colour, tick: finished ? null : share, over: spent > e.total, label: `${b.name}: ${pounds(spent)} of ${pounds(e.total)}` }) : h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }));
    }));
  const latest = [...st.txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const recentCol = h('div', { class: 'ctl-col ctl-recent', 'aria-labelledby': 'or-h', role: 'region' },
    h('div', { class: 'sec-head small-head' }, h('h2', { id: 'or-h' }, 'Recent transactions'), h('a', { href: `#transactions/${c.start}`, class: 'sec-link' }, 'All →')),
    latest.length ? h('ul', { class: 'tx-mini' }, latest.map((t) => h('li', null, h('a', { href: `#transactions/${c.start}` },
      h('span', { class: 'txm-date' }, shortDay(t.date)),
      h('span', { class: 'txm-what' }, h('span', { class: 'txm-desc' }, t.raw_description || '(no description)'), h('span', { class: 'txm-cat' }, t.category || (t.kind === 'transfer' ? 'Transfer' : t.kind === 'income' ? 'Income' : t.kind === 'invested' ? 'Invested' : t.kind === 'saved' ? 'Saved' : 'No category'))),
      h('span', { class: `txm-amt ${t.amount_pence > 0 ? 'in' : ''}` }, `${t.amount_pence > 0 ? '+' : ''}${formatPence(Math.abs(t.amount_pence))}`)))))
      : h('p', { class: 'muted small', style: { margin: 0 } }, 'No transactions yet this cycle.'));

  const alerts = [];
  const prevBudgets = budgetsFor(ctx, st.prev).budgets; // a budget lower than last cycle's is a deliberate cut, not a mistake
  for (const b of ctx.ref.buckets) {
    const e = eff[b.name];
    const spent = s.byBucket[b.name] || 0;
    const last = st.prevS.byBucket[b.name] || 0;
    if (e && spent > e.total) alerts.push(['over', `${b.name} is ${pounds(spent - e.total)} over budget`, stateHref('spending', c.start === currentCycle(ctx).start ? { kind: 'current' } : { kind: 'cycle', start: c.start }, { bucket: b.name }), 'See why']);
    else if (!finished && e && last > e.total * 1.5 && last - e.total >= 2000 && !(Number.isInteger(prevBudgets[b.name]) && e.budget < prevBudgets[b.name])) alerts.push(['warn', `${b.name}: ${pounds(e.total)} budget, ${pounds(last)} spent last cycle`, '#plan', 'Adjust']);
  }
  if (!finished) {
    const overdue = st.bills.filter((b) => b.overdue);
    if (overdue.length) alerts.push(['warn', `${overdue.length} bill${overdue.length === 1 ? '' : 's'} not seen yet: ${overdue.map((b) => b.name).join(', ')}`, '#import', 'Import']);
    if (st.inherited) alerts.push(['warn', 'Using last cycle’s budgets', '#plan', 'Set this payday’s plan']);
  }
  if (ctx.oldIous) alerts.push(['warn', `${ctx.oldIous} IOU${ctx.oldIous === 1 ? '' : 's'} older than 30 days`, '#people', 'See who owes you']);
  // Lines waiting for a decision are listed last and quietly: they're yours to get to when you choose.
  if (ctx.inboxCount) alerts.push(['info', `${ctx.inboxCount} line${ctx.inboxCount === 1 ? '' : 's'} waiting in the review inbox`, '#inbox', 'Inbox']);
  const urgent = alerts.filter((a) => a[0] !== 'info').length;
  const attentionCol = h('div', { class: `ctl-col ctl-attn ${urgent ? '' : 'is-calm'}`, 'aria-labelledby': 'oa-h', role: 'region' },
    h('div', { class: 'sec-head small-head' }, h('h2', { id: 'oa-h' }, 'Needs attention'), urgent ? h('span', { class: 'badge' }, String(urgent)) : null),
    alerts.length ? h('ul', { class: 'attn-list' }, alerts.map(([lvl, title, href, link]) => h('li', { class: `attn lv-${lvl}` }, h('span', { class: 'attn-dot', 'aria-hidden': 'true' }), h('span', { class: 'attn-t' }, title), h('a', { href, class: 'sec-link' }, `${link} →`))))
      : h('p', { class: 'all-clear' }, '✓ All clear for now.'));
  const control = h('section', { class: 'ov-control', 'aria-label': 'Financial control' }, bucketsCol, recentCol, attentionCol);

  // ---- 5. insights: the two most useful, each linked to its payments
  const info = periodInfo(ctx);
  const per = resolvePeriod(c.start === currentCycle(ctx).start ? { kind: 'current' } : { kind: 'cycle', start: c.start }, info);
  // The most important insight, then the next one about something else (not two 'Unusual…' in a row).
  const all = insightsFor(ctx, per, info);
  const kindOf = (i) => i.id.split('-')[0];
  const found = all.length ? [all[0], all.find((i) => kindOf(i) !== kindOf(all[0]))].filter(Boolean) : [];
  const insightsSec = found.length ? h('section', { class: 'ov-insights2', 'aria-labelledby': 'oi-h' },
    h('div', { class: 'sec-head' }, h('h2', { id: 'oi-h' }, 'Insights'), h('a', { href: stateHref('insights', per.sel), class: 'sec-link' }, 'All insights →')),
    h('div', { class: 'ins-pair' }, found.map((i) => h('article', { class: `ins-line lv-${i.level}` },
      h('h3', null, i.title), h('p', null, i.body),
      h('a', { href: stateHref('spending', per.sel, i.filter), class: 'sec-link' }, `See the ${i.count === 1 ? 'payment' : `${i.count} payments`} →`))))) : null;

  return h('div', { class: 'page ov2' },
    header, notice, position,
    myAccounts(ctx),
    h('div', { class: 'ov-row' }, perf, payday),
    control, insightsSec);
}
