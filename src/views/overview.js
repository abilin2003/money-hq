// Overview: the main screen. One layout for the cycle you're in and for a finished cycle you're looking over.
//   Top:    the headline number (safe to spend, or what you spent) with the pace chart | the breakdown
//   Then:   buckets | where it went (with change since last cycle)
//   Then:   money in vs out per cycle | calendar of this cycle
//   Then:   where your pay went | needs attention and bills (or biggest payments)
//   Last:   insight cards
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { pace, cycleList, cycleName } from '../lib/cycles.js';
import { upcomingBills } from '../lib/budget.js';
import { summarise } from '../lib/summary.js';
import { dailySpend, cumulative, categoryChanges, insights } from '../lib/analytics.js';
import { head, shortDay, dayLabel, pounds, bar, inCycle } from '../ui/parts.js';
import { paceChart, groupedBars, calendarChart, payFlow } from '../ui/charts.js';
import { cycleState, paydaysOf, usualDay } from './state.js';
import { historyRows } from './history.js';
import { cashPosition, cardOwed } from '../lib/position.js';

const KIND_FLOW = { invested: ['Invested', '#5BD6A0'], saved: ['Sinking funds', '#B79CFF'], transfer: ['Card and transfers', '#7AA2FF'], paid: ['One-off payments', '#F472B6'], kept: ['Left in Ulster', '#5F6B7A'] };
const LEVEL = { good: 'var(--good)', watch: 'var(--warning)', act: 'var(--over)', info: 'var(--accent)' };

const heroAmount = (pence) => {
  const [whole, frac] = formatPence(pence).split('.');
  return h('div', { class: 'big display' }, whole, h('span', { class: 'pence' }, `.${frac}`));
};
const stat = (label, value, extra, tag) => h('div', null, h('span', { class: 'muted' }, label, tag ? kindTag(tag) : null), extra || h('span', null, value));
// planned = from your budgets or payday plan; actual = from imported transactions; verified = a balance you typed
// in recently; estimated = a typed-in balance moved on by later transactions, or worked out from transactions.
export const kindTag = (kind) => h('span', { class: `ktag k-${kind.replace(/\s+/g, '-')}` }, kind);

// Safe to spend is worked out from your budgets. The cash check compares it with the money actually in your
// current accounts, once you've typed their balances in (Wealth): it never assumes a balance.
function cashCheck(cash, safe) {
  if (cash.status === 'unknown') {
    return h('p', { class: 'cashcheck small' }, kindTag('not verified'), ` Not checked against your accounts yet: add today’s ${cash.missing.join(' and ')} balance${cash.missing.length === 1 ? '' : 's'}. `, h('a', { href: '#wealth', class: 'tap' }, 'Add balances'));
  }
  const short = cash.available < safe.total;
  return h('p', { class: `cashcheck small ${short ? 'warn' : ''}` }, kindTag(cash.status),
    ` Cash check: ${formatPence(cash.total)} in your current accounts, ${formatPence(Math.max(0, cash.available))} after bills still due. `,
    short ? `That’s ${formatPence(safe.total - Math.max(0, cash.available))} less than your budgets say, so go by the lower figure.` : 'Your accounts cover it.');
}

export function overviewView(ctx, c, { finished = false, actions = [], notice = null } = {}) {
  const st = cycleState(ctx, c);
  const { s, eff, safe } = st;
  const budgetTotal = Object.values(st.effTotals).reduce((a, v) => a + v, 0);
  const spentBudgeted = Object.keys(st.effTotals).reduce((a, b) => a + (s.byBucket[b] || 0), 0);
  const today = finished ? c.totalDays : c.dayNumber;
  const budgetSet = new Set(Object.keys(st.effTotals));
  const days = dailySpend(st.txs, c, ctx.splitMap, ctx.settled);
  // The pace chart compares like with like: spending in budgeted buckets against the budget line.
  const budgetDays = budgetTotal ? dailySpend(st.txs, c, ctx.splitMap, ctx.settled, budgetSet) : days;
  const prevBudgeted = budgetTotal ? Object.keys(st.effTotals).reduce((a, b) => a + (st.prevS.byBucket[b] || 0), 0) : st.prevS.netSpent;
  const unbudgeted = s.netSpent - spentBudgeted;
  const billsDue = st.bills.filter((b) => !b.paid).reduce((a, b) => a + b.amount_pence, 0);
  const billsPaid = st.bills.filter((b) => b.paid).reduce((a, b) => a + b.amount_pence, 0);
  const reserve = ctx.ref.settings?.reserve_pence || 0;
  const cash = finished ? null : cashPosition({ accounts: ctx.ref.accounts, snapshots: ctx.ref.snapshots || [], txs: ctx.transactions, today: ctx.today, billsDue, reserve });
  const card = ctx.ref.accounts.find((a) => a.type === 'credit_card' && a.is_active !== false);
  const owed = card ? cardOwed(card, ctx.ref.snapshots || [], ctx.all, finished ? c.end : ctx.today) : null;
  const planItems = ctx.ref.settings?.extra?.plans?.[c.start]?.items || [];
  const plannedOf = (kind) => planItems.filter((i) => i.kind === kind).reduce((a, i) => a + (i.amount_pence || 0), 0);
  const colour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));

  // ---- headline
  const p = budgetTotal ? pace(budgetTotal, spentBudgeted, { ...c, dayNumber: today }) : null;
  let line;
  if (!s.count) line = 'No spending yet this cycle.';
  else if (finished) line = budgetTotal ? `${spentBudgeted <= budgetTotal ? `${pounds(budgetTotal - spentBudgeted)} under` : `${pounds(spentBudgeted - budgetTotal)} over`} your budgets in the budgeted buckets.${unbudgeted > 0 ? ` Plus ${pounds(unbudgeted)} in buckets with no budget (like Fuel).` : ''}` : 'No budgets were set for this cycle.';
  else if (!budgetTotal) line = 'No budgets set for this cycle yet.';
  else line = p.onPace ? `On pace: ${pounds(p.expected - spentBudgeted)} under where the budget line says you'd be today.` : `Ahead of pace: ${pounds(spentBudgeted - p.expected)} more than the budget line says by today.`;
  const hero = h('section', { class: 'card hero-chart', 'aria-label': finished ? 'How the cycle went' : 'Safe to spend' },
    h('div', { class: 'hero-main' },
      h('p', { class: 'muted small' }, finished ? 'Spent this cycle' : 'Safe to spend', kindTag(finished ? 'actual' : 'planned')),
      heroAmount(finished ? s.netSpent : safe.total),
      h('div', { class: 'chips' },
        finished ? h('span', { class: 'chip' }, `${pounds(budgetTotal)} budgeted`) : h('span', { class: 'chip' }, `${formatPence(safe.perDay)} a day`),
        finished ? h('span', { class: 'chip' }, `${pounds(s.netSpent / c.totalDays)} a day`) : h('span', { class: 'chip' }, `${safe.daysLeft} day${safe.daysLeft === 1 ? '' : 's'} left`)),
      h('p', { class: 'muted small', style: { marginTop: '14px' } }, !finished && safe.short ? `You're ${pounds(safe.short)} past what's safe this cycle. ${line}` : line),
      !finished ? h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, 'Worked out from your budgets: what’s left in them, minus bills still due.') : null,
      !finished ? cashCheck(cash, safe) : null),
    h('div', { class: 'hero-plot' }, paceChart({ days: c.totalDays, today, spentByDay: cumulative(budgetDays, today), budget: budgetTotal, lastTotal: prevBudgeted, startLabel: shortDay(c.start), endLabel: finished ? shortDay(c.end) : `Payday ${shortDay(c.next)}` })));

  // ---- breakdown (top right)
  const breakdown = h('section', { class: 'card', 'aria-labelledby': 'bd' },
    h('h2', { id: 'bd' }, 'Breakdown'),
    !finished ? h('div', { class: 'payday' },
      h('span', null, h('span', { class: 'muted small' }, 'Next payday'), h('br'), h('span', { class: 'display', style: { fontSize: '22px', fontWeight: 600 } }, dayLabel(c.next))),
      h('span', { class: 'muted small' }, `in ${c.daysLeft + 1} days${c.predicted ? ' (predicted)' : ''}`)) : null,
    !finished ? h('div', { class: 'days', role: 'img', 'aria-label': `Day ${c.dayNumber} of ${c.totalDays}` }, Array.from({ length: c.totalDays }, (_, i) => h('span', { class: i < c.dayNumber ? 'done' : '' }))) : null,
    h('div', { class: 'stats', style: { marginTop: '10px' } },
      stat('Money in', formatPence(s.income), null, 'actual'),
      stat(s.fromSavings ? 'Spent from your pay' : 'Spent (your share)', formatPence(s.netSpent), null, 'actual'),
      unbudgeted > 0 ? stat('…of which in buckets with no budget', formatPence(unbudgeted)) : null,
      s.paidBack ? stat('Paid back to you', formatPence(s.paidBack)) : null,
      s.fromSavings ? stat('Paid from savings (your share)', formatPence(s.fromSavings), null, 'actual') : null,
      s.fromSavings ? stat('Total spent (pay + savings)', formatPence(s.totalSpent), null, 'actual') : null,
      s.owedToYou ? stat('Owed to you', null, h('a', { href: '#people', class: 'tap' }, formatPence(s.owedToYou))) : null,
      stat('Invested (after withdrawals)', `${s.invested < 0 ? '−' : ''}${formatPence(Math.abs(s.invested))}`, null, 'actual'),
      plannedOf('invested') ? stat('Invested in your payday plan', formatPence(plannedOf('invested')), null, 'planned') : null,
      stat('Saved (after withdrawals)', `${s.saved < 0 ? '−' : ''}${formatPence(Math.abs(s.saved))}`, null, 'actual'),
      plannedOf('saved') ? stat('Sinking funds in your payday plan', formatPence(plannedOf('saved')), null, 'planned') : null,
      owed && owed.status !== 'unknown' ? stat(`${card.name} to repay`, formatPence(owed.pence), null, owed.status) : null,
      stat('Bills', `${formatPence(billsPaid)} paid${billsDue ? `, ${formatPence(billsDue)} ${finished ? 'not seen' : 'due'}` : ''}`),
      budgetTotal ? stat(finished ? 'Budgets' : 'Left in budgeted buckets', finished ? formatPence(budgetTotal) : formatPence(budgetTotal - spentBudgeted), null, 'planned') : null,
      !finished ? h('div', { style: { fontWeight: 600 } }, h('span', null, 'Safe to spend', kindTag('planned')), h('span', null, formatPence(safe.total))) : null,
      !finished ? stat('Cash in your current accounts', cash.total === null ? 'Not entered' : formatPence(cash.total), cash.total === null ? h('a', { href: '#wealth', class: 'tap' }, 'Add balances') : null, cash.status === 'unknown' ? 'not verified' : cash.status) : null,
      s.waiting ? stat('Waiting for your decision', null, h('a', { href: '#inbox', class: 'tap' }, `${s.waiting} to review`)) : null));

  // ---- buckets
  const share = today / c.totalDays;
  const bucketRows = ctx.ref.buckets.map((b) => {
    const spent = s.byBucket[b.name] || 0;
    const e = eff[b.name];
    const last = st.prevS.byBucket[b.name] || 0;
    const left = e ? e.total - spent : null;
    return h('div', { class: 'brow' },
      h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour } }), h('span', null, b.name, !e ? h('span', { class: 'muted small' }, ' · no budget') : e.carried ? h('span', { class: 'muted small' }, ` (+${pounds(e.carried)} carried)`) : null)),
      e ? bar(spent / e.total, { colour: b.colour, tick: finished ? null : share, over: spent > e.total, label: `${pounds(spent)} of ${pounds(e.total)}` }) : h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }),
      h('span', { class: 'r' }, pounds(spent)),
      h('span', { class: `r ${left !== null && left < 0 ? 'over' : ''}` }, left === null ? '–' : left < 0 ? `${pounds(-left)} over` : `${pounds(left)} left`),
      h('span', { class: 'r muted' }, pounds(last)));
  });
  const buckets = h('section', { class: 'card', 'aria-labelledby': 'bk' },
    h('div', { class: 'ch' }, h('h2', { id: 'bk' }, 'Buckets'), h('a', { href: '#budgets', class: 'tap muted small' }, 'Manage')),
    h('div', { class: 'brow bhead muted' }, h('span', null, 'Bucket'), h('span', null, finished ? 'Spent of budget' : 'This cycle'), h('span', { class: 'r' }, 'Spent'), h('span', { class: 'r' }, finished ? 'Result' : 'Left'), h('span', { class: 'r' }, 'Last cycle')),
    bucketRows,
    budgetTotal ? h('div', { class: 'brow btotal' }, h('span', null, 'Budgeted buckets'), h('span', { class: 'muted small' }, `of ${pounds(budgetTotal)}`), h('span', { class: 'r' }, pounds(spentBudgeted)), h('span', { class: `r ${spentBudgeted > budgetTotal ? 'over' : ''}` }, spentBudgeted > budgetTotal ? `${pounds(spentBudgeted - budgetTotal)} over` : `${pounds(budgetTotal - spentBudgeted)} left`), h('span', { class: 'r muted' }, pounds(prevBudgeted))) : null,
    h('div', { class: 'brow btotal' }, h('span', null, 'All spending'), h('span', { class: 'muted small' }, unbudgeted > 0 ? `incl. ${pounds(unbudgeted)} with no budget` : ''), h('span', { class: 'r' }, pounds(s.netSpent)), h('span'), h('span', { class: 'r muted' }, pounds(st.prevS.netSpent))),
    !finished ? h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'The white tick is where your spending would be today if you spent evenly.') : null);

  // ---- where it went, with change since last cycle
  const changes = categoryChanges(s, st.prevS).filter((x) => x.now > 0).slice(0, 10);
  const top = changes[0]?.now || 1;
  const catColour = (name) => colour[ctx.ref.buckets.find((b) => b.id === ctx.ref.categories.find((k) => k.name === name)?.bucket_id)?.name] || 'var(--text-2)';
  const where = h('section', { class: 'card', 'aria-labelledby': 'wg' },
    h('div', { class: 'ch' }, h('h2', { id: 'wg' }, 'Where it went'), h('span', { class: 'muted small' }, 'vs last cycle')),
    changes.length ? changes.map((x) => h('a', { href: `#transactions/${c.start}`, class: 'crow linkrow' }, h('span', { class: 'cname' }, x.name), bar(x.now / top, { colour: catColour(x.name), label: pounds(x.now) }), h('span', { class: 'r' }, pounds(x.now)),
      h('span', { class: `r small ${x.change > 0 ? 'over' : 'muted'}` }, x.before ? `${x.change > 0 ? '+' : '−'}${pounds(Math.abs(x.change))}` : 'new')))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending yet this cycle.'));

  // ---- money in vs out, last 6 cycles (live + history)
  const rows = historyRows(ctx.all);
  const first = rows.map((t) => t.date).sort()[0] || ctx.today;
  const recent = cycleList(paydaysOf(ctx), first, c.end < ctx.today ? c.end : ctx.today, usualDay(ctx)).slice(0, 6).reverse();
  const sums = recent.map((x) => summarise(rows.filter((t) => inCycle(t, x)), ctx.splitMap, ctx.settled));
  const inout = h('section', { class: 'card', 'aria-labelledby': 'io' },
    h('div', { class: 'ch' }, h('h2', { id: 'io' }, 'Money in vs out'), h('a', { href: '#trends', class: 'tap muted small' }, 'Trends')),
    groupedBars({ labels: recent.map((x) => cycleName(x).slice(0, 3)), series: [{ name: 'In', colour: '#5BD6A0', values: sums.map((x) => x.income) }, { name: 'Spent', colour: '#F472B6', values: sums.map((x) => x.totalSpent) }, { name: 'Invested', colour: '#8B9CFF', values: sums.map((x) => x.invested) }], onPick: () => { location.hash = 'history'; }, label: 'Money in, spent and invested per pay cycle' }));

  // ---- calendar
  const cal = h('section', { class: 'card', 'aria-labelledby': 'cl' },
    h('div', { class: 'ch' }, h('h2', { id: 'cl' }, 'When you spent'), h('span', { class: 'muted small' }, 'darker = bigger day')),
    h('div', { class: 'calwrap' }, calendarChart({ days: days.map((d) => ({ ...d, today: d.date === ctx.today })), onPick: () => { location.hash = `transactions/${c.start}`; } })));

  // ---- where your pay went (the payday plan, or what actually happened)
  const plan = ctx.ref.settings?.extra?.plans?.[c.start];
  let flows; let pay;
  if (plan?.pay_pence) {
    pay = plan.pay_pence;
    const groups = {};
    for (const it of plan.items || []) { const [n, col] = KIND_FLOW[it.kind] || ['Other', '#5F6B7A']; groups[n] = groups[n] || { name: n, pence: 0, colour: col }; groups[n].pence += it.amount_pence || 0; }
    flows = [{ name: 'Buckets', pence: budgetTotal, colour: '#F7B955' }, ...Object.values(groups)].filter((f) => f.pence > 0).sort((a, b) => b.pence - a.pence);
  } else {
    pay = s.income;
    flows = [{ name: 'Spent', pence: s.totalSpent, colour: '#F472B6' }, { name: 'Invested', pence: s.invested, colour: '#5BD6A0' }, { name: 'Saved', pence: s.saved, colour: '#B79CFF' }].filter((f) => f.pence > 0);
    const rest = pay - flows.reduce((a, f) => a + f.pence, 0);
    if (rest > 0) flows.push({ name: 'Not spent or put away', pence: rest, colour: '#5F6B7A' });
  }
  const flow = pay && flows.length ? h('section', { class: 'card', 'aria-labelledby': 'pf' },
    h('div', { class: 'ch' }, h('h2', { id: 'pf' }, 'Where your pay went'), h('a', { href: '#plan', class: 'tap muted small' }, plan ? 'Payday plan' : 'Make a plan')),
    payFlow({ total: pay, flows })) : null;

  // ---- needs attention + bills (current) or biggest payments (finished)
  const attention = [];
  for (const b of ctx.ref.buckets) {
    const e = eff[b.name];
    const spent = s.byBucket[b.name] || 0;
    const last = st.prevS.byBucket[b.name] || 0;
    if (e && spent > e.total) attention.push(['over', `${b.name} is ${pounds(spent - e.total)} over`, `${pounds(spent)} spent against ${pounds(e.total)}.`, '#transactions', 'See what it went on']);
    else if (!finished && e && last > e.total * 1.5 && last - e.total >= 2000) attention.push(['warn', `${b.name} budget looks low`, `${pounds(e.total)} budgeted, ${pounds(last)} spent last cycle.`, '#plan', 'Adjust budget']);
  }
  if (!finished) {
    const overdue = st.bills.filter((b) => b.overdue);
    if (overdue.length) attention.push(['warn', `${overdue.length} bill${overdue.length === 1 ? '' : 's'} not seen yet`, `${overdue.map((b) => `${b.name} (${shortDay(b.date)})`).join(', ')}. Import your latest Ulster statement to check.`, '#import', 'Import']);
    if (st.inherited) attention.push(['warn', 'This cycle uses last cycle’s budgets', 'Set this payday’s plan so the budgets match.', '#plan', 'Open payday plan']);
  }
  const stale = (ctx.ref.snapshots || []).length === 0 ? null : null;
  void stale;
  if (ctx.oldIous) attention.push(['warn', `${ctx.oldIous} IOU${ctx.oldIous === 1 ? '' : 's'} older than 30 days`, 'Someone still owes you for these.', '#people', 'See who owes you']);
  const needs = h('section', { class: 'card', 'aria-labelledby': 'na' },
    h('div', { class: 'ch' }, h('h2', { id: 'na' }, 'Needs attention'), attention.length ? h('span', { class: 'badge' }, String(attention.length)) : null),
    attention.length ? attention.map(([lvl, title, body, href, link]) => h('div', { class: 'att' }, h('span', { class: 'dot', style: { background: lvl === 'over' ? 'var(--over)' : 'var(--warning)', marginTop: '6px' } }),
      h('div', null, h('p', { style: { margin: 0, fontWeight: 500 } }, title), h('p', { class: 'muted small', style: { margin: '2px 0 0' } }, body), h('a', { href, class: 'tap small' }, link))))
      : h('p', { class: 'muted', style: { margin: 0 } }, s.count ? 'Nothing needs a change right now.' : 'Nothing to flag yet: no spending this cycle.'));
  let side;
  if (finished) {
    const biggest = st.txs.filter((t) => t.kind === 'spend' && t.status !== 'needs_review').sort((a, b) => a.amount_pence - b.amount_pence).slice(0, 5);
    side = h('section', { class: 'card', 'aria-labelledby': 'bg' }, h('h2', { id: 'bg' }, 'Biggest payments'),
      biggest.length ? h('div', { class: 'stats' }, biggest.map((t) => h('div', null, h('span', null, t.raw_description, h('span', { class: 'muted small' }, ` · ${shortDay(t.date)}`)), h('span', null, formatPence(-t.amount_pence))))) : h('p', { class: 'muted' }, 'Nothing yet.'),
      h('p', { style: { margin: '10px 0 0' } }, h('a', { href: `#transactions/${c.start}`, class: 'tap' }, `See all ${st.txs.length} transactions`)));
  } else {
    const soon = upcomingBills(ctx.ref.bills || [], ctx.today, 14, ctx.transactions);
    side = h('section', { class: 'card', 'aria-labelledby': 'up' },
      h('div', { class: 'ch' }, h('h2', { id: 'up' }, 'Upcoming bills'), h('span', { class: 'muted small' }, soon.length ? `${pounds(soon.reduce((a, b) => a + b.amount_pence, 0))} in 14 days` : '')),
      soon.length ? soon.map((b) => h('div', { class: 'billrow' }, h('span', { class: b.date === ctx.today ? 'today' : 'muted' }, b.date === ctx.today ? 'Today' : shortDay(b.date)), h('span', null, b.name), h('span', { class: 'r' }, formatPence(b.amount_pence))))
        : h('p', { class: 'muted', style: { margin: 0 } }, 'No bills due in the next 14 days.'));
  }

  // ---- insights
  const avg = sums.length > 1 ? { netSpent: Math.round(sums.slice(0, -1).reduce((a, x) => a + x.netSpent, 0) / (sums.length - 1)) } : null;
  const cards = insights({ now: s, before: st.prevS.count ? st.prevS : null, avg, rows: st.txs, cycle: c, budgets: st.effTotals, safe: finished ? null : safe, funds: ctx.ref.funds });
  const ins = h('section', { 'aria-labelledby': 'in' }, h('h2', { id: 'in', class: 'section-h' }, 'Insights'),
    h('div', { class: 'insights' }, cards.slice(0, 6).map((i) => h('div', { class: 'card insight', style: { borderLeftColor: LEVEL[i.level] } }, h('p', { style: { margin: 0, fontWeight: 600 } }, i.title), h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, i.body)))));

  return h('div', { class: 'page' },
    head('Overview', finished ? `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Finished: look it over, then close it.` : `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}. Day ${c.dayNumber} of ${c.totalDays}.`, ...actions),
    notice,
    h('div', { class: 'grid-top' }, hero, breakdown),
    ctx.inboxCount && !finished ? h('section', { class: 'card strip' }, h('span', null, h('span', { style: { fontWeight: 600 } }, `${ctx.inboxCount} line${ctx.inboxCount === 1 ? '' : 's'} to review`), h('br'), h('span', { class: 'muted small' }, "They aren't counted until you decide what they are.")), h('a', { href: '#inbox', class: 'btn tap' }, 'Review')) : null,
    h('div', { class: 'grid-main' }, buckets, where),
    h('div', { class: 'grid-even' }, inout, cal),
    h('div', { class: 'grid-even' }, flow, h('div', { class: 'col' }, needs, side)),
    ins);
}
