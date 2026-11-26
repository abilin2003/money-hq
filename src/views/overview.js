// Overview: the main screen, for the cycle you're in or a finished cycle you're looking over. Kept to what matters
// today; the detail lives in Analytics (Spending, Trends) and Planning (Payday plan).
//   Top:   four summary cards: safe to spend | spent vs budget | saved and invested | net worth
//   Laptop: spending vs budget chart, buckets and recent lines on the left; payday and bills, alerts and one
//           insight on the right.
//   Phone:  the same cards, reordered for a quick look: alerts first (only if there are any), buckets, payday and
//           bills, the chart, recent lines, then the insight.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { pace, cycleList } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { upcomingBills } from '../lib/budget.js';
import { summarise } from '../lib/summary.js';
import { dailySpend, cumulative, insights, netWorth } from '../lib/analytics.js';
import { head, shortDay, dayLabel, pounds, bar, inCycle, txRow } from '../ui/parts.js';
import { paceChart } from '../ui/charts.js';
import { cycleState, cycleFigures, paydaysOf, usualDay } from './state.js';
import { historyRows } from './history.js';

const LEVEL = { good: 'var(--good)', watch: 'var(--warning)', act: 'var(--over)', info: 'var(--accent)' };

const heroAmount = (pence) => {
  const [whole, frac] = formatPence(pence).split('.');
  return h('span', { class: 'kpi-big display' }, whole, h('span', { class: 'pence' }, `.${frac}`));
};
const signed = (p) => `${p < 0 ? '−' : ''}${pounds(Math.abs(p))}`; // whole pounds, like the other summary cards
// planned = from your budgets or payday plan; actual = from imported transactions; verified = a balance you typed
// in recently; estimated = a typed-in balance moved on by later transactions, or worked out from transactions.
export const kindTag = (kind) => h('span', { class: `ktag k-${kind.replace(/\s+/g, '-')}` }, kind);

// Safe to spend is worked out from your budgets. The cash check compares it with the money actually in your
// current accounts, once you've typed their balances in (Wealth): it never assumes a balance.
function cashLine(cash, safe) {
  if (cash.status === 'unknown') return h('p', { class: 'kpi-s small' }, kindTag('not verified'), ' Not checked against your accounts. ', h('a', { href: '#wealth', class: 'tap' }, 'Add balances'));
  const short = cash.available < safe.total;
  return h('p', { class: `kpi-s small ${short ? 'warn' : ''}` }, kindTag(cash.status),
    short ? ` Your accounts hold ${formatPence(Math.max(0, cash.available))} after bills: go by that.` : ` Your accounts cover it (${formatPence(cash.total)}).`);
}

const kpi = (cls, label, tag, value, ...rest) => h('section', { class: `card kpi ${cls}`, 'aria-label': label },
  h('p', { class: 'kpi-l muted small' }, label, tag ? kindTag(tag) : null), value, ...rest);

export function overviewView(ctx, c, { finished = false, actions = [], notice = null } = {}) {
  const st = cycleState(ctx, c);
  const { s, eff, safe } = st;
  const f = cycleFigures(ctx, c, st, finished);
  const { budgetTotal, spentBudgeted, unbudgeted, today } = f;
  const budgetSet = new Set(Object.keys(st.effTotals));
  const budgetDays = dailySpend(st.txs, c, ctx.splitMap, ctx.settled, budgetTotal ? budgetSet : null);
  const nw = netWorth(ctx.ref.accounts, ctx.ref.snapshots || [], ctx.today);
  const p = budgetTotal ? pace(budgetTotal, spentBudgeted, { ...c, dayNumber: today }) : null;

  // ---- one line on how it's going
  let line;
  if (!s.count) line = 'No spending yet this cycle.';
  else if (!budgetTotal) line = finished ? 'No budgets were set for this cycle.' : 'No budgets set for this cycle yet.';
  else if (finished) line = `${spentBudgeted <= budgetTotal ? `${pounds(budgetTotal - spentBudgeted)} under` : `${pounds(spentBudgeted - budgetTotal)} over`} your budgets.`;
  else line = p.onPace ? `On pace: ${pounds(p.expected - spentBudgeted)} under the budget line for today.` : `Ahead of pace: ${pounds(spentBudgeted - p.expected)} over the budget line for today.`;

  // ---- top summary cards
  const k1 = finished
    ? kpi('kpi-hero', 'How the cycle went', 'actual', h('span', { class: 'kpi-big display' }, budgetTotal ? [pounds(Math.abs(budgetTotal - spentBudgeted)), h('span', { class: 'kpi-unit' }, spentBudgeted <= budgetTotal ? ' under' : ' over')] : pounds(s.totalSpent)),
      h('p', { class: 'kpi-s small muted' }, budgetTotal ? `${pounds(spentBudgeted)} of ${pounds(budgetTotal)} budgeted · ${pounds(s.netSpent / c.totalDays)} a day` : `${pounds(s.netSpent / c.totalDays)} a day`))
    : kpi('kpi-hero', 'Safe to spend', 'planned', heroAmount(safe.total),
      h('p', { class: 'kpi-s small muted' }, `${formatPence(safe.perDay)} a day · ${safe.daysLeft} day${safe.daysLeft === 1 ? '' : 's'} left`, safe.short ? h('span', { class: 'over' }, ` · ${pounds(safe.short)} past safe`) : null),
      cashLine(f.cash, safe));
  const k2 = budgetTotal
    ? kpi('', 'Spent vs budget', 'actual', h('span', { class: 'kpi-v display' }, pounds(spentBudgeted), h('span', { class: 'muted kpi-of' }, ` of ${pounds(budgetTotal)}`)),
      bar(spentBudgeted / budgetTotal, { tick: finished ? null : today / c.totalDays, over: spentBudgeted > budgetTotal, label: `${pounds(spentBudgeted)} of ${pounds(budgetTotal)}` }),
      h('p', { class: 'kpi-s small muted' }, `All spending ${pounds(s.totalSpent)}`, unbudgeted > 0 || s.fromSavings ? ` (incl. ${[unbudgeted > 0 ? `${pounds(unbudgeted)} no budget` : null, s.fromSavings ? `${pounds(s.fromSavings)} from savings` : null].filter(Boolean).join(', ')})` : ''))
    : kpi('', 'Spent this cycle', 'actual', h('span', { class: 'kpi-v display' }, pounds(s.totalSpent)), h('p', { class: 'kpi-s small muted' }, 'No budgets set. ', h('a', { href: '#plan', class: 'tap' }, 'Set them')));
  const putAway = s.saved + s.invested;
  const plannedAway = f.plannedOf('saved') + f.plannedOf('invested');
  const k3 = kpi('', 'Saved and invested', 'actual', h('span', { class: 'kpi-v display' }, signed(putAway)),
    h('p', { class: 'kpi-s small muted' }, `Invested ${signed(s.invested)} · saved ${signed(s.saved)}`, plannedAway ? ` · plan ${pounds(plannedAway)}` : '', h('span', { class: 'hide-phone' }, ' (after withdrawals)')));
  const k4 = kpi('kpi-nw', 'Net worth', nw.known ? 'verified' : 'not verified', h('span', { class: 'kpi-v display' }, nw.known ? signed(nw.total) : '–'),
    h('p', { class: 'kpi-s small muted' }, nw.known ? 'From the balances you typed in. ' : 'Type in your balances to see it. ', h('a', { href: '#wealth', class: 'tap' }, nw.known ? 'Wealth' : 'Add balances')));

  // ---- spending vs budget chart (interactive: point at, tap or arrow along any day)
  const readout = h('p', { class: 'readout small', 'aria-live': 'polite' }, line);
  const chart = h('section', { class: 'card ov-chart', 'aria-labelledby': 'oc' },
    h('div', { class: 'ch' }, h('h2', { id: 'oc' }, 'Spending vs budget'), h('a', { href: `#spending/${c.start}`, class: 'tap muted small' }, 'Full breakdown')),
    paceChart({ days: c.totalDays, today, spentByDay: cumulative(budgetDays, today), budget: budgetTotal, lastTotal: f.prevBudgeted, startLabel: shortDay(c.start), endLabel: finished ? shortDay(c.end) : `Payday ${shortDay(c.next)}`,
      onDay: (d) => {
        if (!d) { readout.textContent = line; return; }
        const date = dayLabel(addDays(c.start, d.day - 1));
        const vs = d.budgetLine !== null ? ` · budget line ${pounds(d.budgetLine)}` : '';
        readout.textContent = d.spent === null ? `${date}: still to come${vs}.` : `${date}: ${pounds(d.spent)} spent so far${vs}${d.lastLine !== null ? ` · last cycle ${pounds(d.lastLine)}` : ''}.`;
      } }),
    readout,
    h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, budgetTotal ? 'Budgeted buckets only. Point at or tap the chart to read any day.' : 'Point at or tap the chart to read any day.'));

  // ---- buckets with progress bars
  const share = today / c.totalDays;
  const buckets = h('section', { class: 'card ov-buckets', 'aria-labelledby': 'ob' },
    h('div', { class: 'ch' }, h('h2', { id: 'ob' }, 'Buckets'), h('a', { href: '#budgets', class: 'tap muted small' }, 'Manage')),
    ctx.ref.buckets.map((b) => {
      const spent = s.byBucket[b.name] || 0;
      const e = eff[b.name];
      const left = e ? e.total - spent : null;
      return h('div', { class: 'bk' },
        h('div', { class: 'bk-top' },
          h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour } }), b.name),
          h('span', { class: 'bk-fig' }, pounds(spent), e ? h('span', { class: 'muted' }, ` / ${pounds(e.total)}`) : h('span', { class: 'muted small' }, ' · no budget')),
          h('span', { class: `bk-left small ${left !== null && left < 0 ? 'over' : 'muted'}` }, left === null ? '' : left < 0 ? `${pounds(-left)} over` : `${pounds(left)} left`)),
        e ? bar(spent / e.total, { colour: b.colour, tick: finished ? null : share, over: spent > e.total, label: `${b.name}: ${pounds(spent)} of ${pounds(e.total)}` }) : h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }));
    }),
    !finished && budgetTotal ? h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'The white tick is where you’d be today if you spent evenly.') : null);

  // ---- next payday and upcoming bills (or, for a finished cycle, its bills)
  const soon = finished ? st.bills : upcomingBills(ctx.ref.bills || [], ctx.today, 14, ctx.transactions);
  const payday = h('section', { class: 'card ov-payday', 'aria-labelledby': 'op' },
    !finished ? [h('div', { class: 'payday' },
      h('span', null, h('span', { class: 'muted small' }, 'Next payday'), h('br'), h('span', { class: 'display', style: { fontSize: '22px', fontWeight: 600 } }, dayLabel(c.next))),
      h('span', { class: 'muted small' }, `in ${c.daysLeft + 1} day${c.daysLeft ? 's' : ''}${c.predicted ? ' (predicted)' : ''}`)),
    h('div', { class: 'days', role: 'img', 'aria-label': `Day ${c.dayNumber} of ${c.totalDays}` }, Array.from({ length: c.totalDays }, (_, i) => h('span', { class: i < c.dayNumber ? 'done' : '' })))] : null,
    h('div', { class: 'ch', style: { marginTop: finished ? 0 : '16px' } }, h('h2', { id: 'op' }, finished ? 'Bills this cycle' : 'Upcoming bills'), h('span', { class: 'muted small' }, soon.length ? `${pounds(soon.reduce((a, b) => a + b.amount_pence, 0))}${finished ? '' : ' in 14 days'}` : '')),
    soon.length ? soon.slice(0, 6).map((b) => h('div', { class: 'billrow' }, h('span', { class: !finished && b.date === ctx.today ? 'today' : 'muted' }, !finished && b.date === ctx.today ? 'Today' : shortDay(b.date)), h('span', null, b.name, finished && !b.paid ? h('span', { class: 'muted small' }, ' · not seen') : null), h('span', { class: 'r' }, formatPence(b.amount_pence))))
      : h('p', { class: 'muted', style: { margin: 0 } }, finished ? 'No bills this cycle.' : 'No bills due in the next 14 days.'),
    h('p', { style: { margin: '10px 0 0' } }, h('a', { href: '#bills', class: 'tap small' }, 'All bills')));

  // ---- alerts
  const alerts = [];
  if (ctx.inboxCount) alerts.push(['warn', `${ctx.inboxCount} line${ctx.inboxCount === 1 ? '' : 's'} to review`, 'They aren’t counted until you decide what they are.', '#inbox', 'Review']);
  for (const b of ctx.ref.buckets) {
    const e = eff[b.name];
    const spent = s.byBucket[b.name] || 0;
    const last = st.prevS.byBucket[b.name] || 0;
    if (e && spent > e.total) alerts.push(['over', `${b.name} is ${pounds(spent - e.total)} over`, `${pounds(spent)} spent against ${pounds(e.total)}.`, `#spending/${c.start}`, 'See what it went on']);
    else if (!finished && e && last > e.total * 1.5 && last - e.total >= 2000) alerts.push(['warn', `${b.name} budget looks low`, `${pounds(e.total)} budgeted, ${pounds(last)} spent last cycle.`, '#plan', 'Adjust budget']);
  }
  if (!finished) {
    const overdue = st.bills.filter((b) => b.overdue);
    if (overdue.length) alerts.push(['warn', `${overdue.length} bill${overdue.length === 1 ? '' : 's'} not seen yet`, `${overdue.map((b) => `${b.name} (${shortDay(b.date)})`).join(', ')}. Import your latest statement to check.`, '#import', 'Import']);
    if (st.inherited) alerts.push(['warn', 'This cycle uses last cycle’s budgets', 'Set this payday’s plan so the budgets match.', '#plan', 'Open payday plan']);
  }
  if (ctx.oldIous) alerts.push(['warn', `${ctx.oldIous} IOU${ctx.oldIous === 1 ? '' : 's'} older than 30 days`, 'Someone still owes you for these.', '#people', 'See who owes you']);
  const alertCard = h('section', { class: `card ov-alerts ${alerts.length ? '' : 'is-empty'}`, 'aria-labelledby': 'oa' },
    h('div', { class: 'ch' }, h('h2', { id: 'oa' }, 'Alerts'), alerts.length ? h('span', { class: 'badge' }, String(alerts.length)) : null),
    alerts.length ? alerts.map(([lvl, title, body, href, link]) => h('div', { class: 'att' }, h('span', { class: 'dot', style: { background: lvl === 'over' ? 'var(--over)' : 'var(--warning)', marginTop: '6px' } }),
      h('div', null, h('p', { style: { margin: 0, fontWeight: 500 } }, title), h('p', { class: 'muted small', style: { margin: '2px 0 0' } }, body), h('a', { href, class: 'tap small' }, link))))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing needs you right now.'));

  // ---- one insight (the rest are on Trends)
  const rows = historyRows(ctx.all);
  const first = rows.map((t) => t.date).sort()[0] || ctx.today;
  const recent = cycleList(paydaysOf(ctx), first, c.end < ctx.today ? c.end : ctx.today, usualDay(ctx)).slice(0, 6);
  const sums = recent.map((x) => summarise(rows.filter((t) => inCycle(t, x)), ctx.splitMap, ctx.settled));
  const avg = sums.length > 1 ? { netSpent: Math.round(sums.slice(1).reduce((a, x) => a + x.netSpent, 0) / (sums.length - 1)) } : null;
  const top = insights({ now: s, before: st.prevS.count ? st.prevS : null, avg, rows: st.txs, cycle: c, budgets: st.effTotals, safe: finished ? null : safe, funds: ctx.ref.funds })[0];
  const insight = top ? h('section', { class: 'card insight ov-insight', style: { borderLeftColor: LEVEL[top.level] }, 'aria-label': 'Insight' },
    h('p', { style: { margin: 0, fontWeight: 600 } }, top.title), h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, top.body),
    h('p', { style: { margin: '8px 0 0' } }, h('a', { href: '#trends', class: 'tap small' }, 'More in Trends'))) : null;

  // ---- recent transactions
  const latest = [...st.txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentCard = h('section', { class: 'card ov-recent', 'aria-labelledby': 'or' },
    h('div', { class: 'ch' }, h('h2', { id: 'or' }, 'Recent transactions'), h('a', { href: `#transactions/${c.start}`, class: 'tap muted small' }, 'All')),
    latest.length ? latest.map((t) => h('a', { href: `#transactions/${c.start}`, class: 'linkrow' }, txRow(t))) : h('p', { class: 'muted', style: { margin: 0 } }, 'No transactions yet this cycle.'));

  return h('div', { class: 'page' },
    head('Overview', finished ? `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Finished: look it over, then close it.` : `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Day ${c.dayNumber} of ${c.totalDays}.`, ...actions),
    notice,
    h('div', { class: 'kpis' }, k1, k2, k3, k4),
    h('div', { class: 'ov' },
      h('div', { class: 'ov-col' }, chart, buckets, recentCard),
      h('div', { class: 'ov-col' }, payday, alertCard, insight)));
}
