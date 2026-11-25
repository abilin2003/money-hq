// Overview for the cycle you're in: safe to spend first (with the working shown), then pace per bucket,
// what needs attention, and bills coming up.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { pace } from '../lib/cycles.js';
import { upcomingBills } from '../lib/budget.js';
import { ranked } from '../lib/summary.js';
import { head, shortDay, dayLabel, pounds, bar } from '../ui/parts.js';
import { cycleState } from './state.js';

// "£400" with the pence small and faint, as in the design.
const heroAmount = (pence) => {
  const [whole, frac] = formatPence(pence).split('.');
  return h('div', { class: 'big display' }, whole, h('span', { class: 'pence' }, `.${frac}`));
};

export function currentOverview(ctx, c, reopen) {
  const st = cycleState(ctx, c);
  const { s, eff, safe } = st;
  const share = c.dayNumber / c.totalDays;
  const budgetTotal = Object.values(st.effTotals).reduce((a, v) => a + v, 0);
  const lastName = st.prev ? `${shortDay(st.prev.start)} to ${shortDay(st.prev.end)}` : '';

  // ---- pace for the whole cycle (rule 9), and what to say about it (rule 11: never invent reassurance)
  const spentBudgeted = Object.keys(st.effTotals).reduce((a, b) => a + (s.byBucket[b] || 0), 0);
  const totalPace = budgetTotal ? pace(budgetTotal, spentBudgeted, c) : null;
  let paceLine;
  if (!budgetTotal) paceLine = 'No budgets set for this cycle yet. Set them on the Payday plan page.';
  else if (!s.count) paceLine = 'No spending yet this cycle.';
  else if (totalPace.onPace) paceLine = `On pace: ${pounds(totalPace.expected - spentBudgeted)} under where the budget line says you'd be today.`;
  else paceLine = `Ahead of pace: ${pounds(spentBudgeted - totalPace.expected)} more than the budget line says by today.`;

  const hero = h('section', { class: 'card hero', 'aria-label': 'Safe to spend' },
    h('div', { class: 'hero-main' },
      h('p', { class: 'muted small' }, 'Safe to spend'),
      heroAmount(safe.total),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, `${formatPence(safe.perDay)} a day`),
        h('span', { class: 'chip' }, `${safe.daysLeft} day${safe.daysLeft === 1 ? '' : 's'} left`)),
      h('p', { class: 'muted small', style: { marginTop: '14px' } }, safe.short ? `You're ${pounds(safe.short)} past what's safe this cycle. ${paceLine}` : paceLine)),
    h('div', { class: 'hero-side' },
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Next payday'),
      h('p', { class: 'display', style: { margin: '6px 0 0', fontSize: '28px', fontWeight: 600 } }, dayLabel(c.next)),
      h('p', { class: 'muted small', style: { margin: '2px 0 12px' } }, `in ${c.daysLeft + 1} days${c.predicted ? ' (predicted)' : ''}`),
      h('div', { class: 'days', role: 'img', 'aria-label': `Day ${c.dayNumber} of ${c.totalDays}` },
        Array.from({ length: c.totalDays }, (_, i) => h('span', { class: i < c.dayNumber ? 'done' : '' }))),
      h('div', { class: 'stats', style: { marginTop: '12px' } },
        safe.lines.filter((l) => l.pence !== 0 || l.label !== 'Reserve').map((l) => h('div', null, h('span', { class: 'muted' }, l.label), h('span', null, `${l.pence < 0 ? '−' : ''}${formatPence(Math.abs(l.pence))}`))),
        h('div', { style: { fontWeight: 600 } }, h('span', null, 'Safe to spend'), h('span', null, formatPence(safe.total))))));

  // ---- review inbox strip
  const inbox = ctx.inboxCount ? h('section', { class: 'card strip' },
    h('span', null, h('span', { style: { fontWeight: 600 } }, `${ctx.inboxCount} line${ctx.inboxCount === 1 ? '' : 's'} to review`), h('br'), h('span', { class: 'muted small' }, "They aren't counted until you decide what they are.")),
    h('a', { href: '#inbox', class: 'btn tap' }, 'Review')) : null;

  // ---- buckets with pace ticks
  const rows = ctx.ref.buckets.map((b) => {
    const spent = s.byBucket[b.name] || 0;
    const e = eff[b.name];
    const last = st.prevS.byBucket[b.name] || 0;
    if (!e) {
      return h('div', { class: 'brow' },
        h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour } }), h('span', null, b.name, h('br'), h('span', { class: 'muted small' }, 'Tracked, no budget'))),
        h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }),
        h('span', { class: 'r' }, pounds(spent)), h('span', { class: 'r muted' }, '–'), h('span', { class: 'r muted' }, pounds(last)));
    }
    const p = pace(e.total, spent, c);
    const leftNow = e.total - spent;
    return h('div', { class: 'brow' },
      h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour } }), h('span', null, b.name, e.carried ? h('span', { class: 'muted small' }, ` (+${pounds(e.carried)} carried)`) : null)),
      bar(spent / e.total, { colour: b.colour, tick: share, over: spent > e.total, label: `${pounds(spent)} of ${pounds(e.total)}, ${p.onPace ? 'on pace' : 'ahead of pace'}` }),
      h('span', { class: 'r' }, pounds(spent)),
      h('span', { class: `r ${leftNow < 0 ? 'over' : ''}` }, leftNow < 0 ? `${pounds(-leftNow)} over` : pounds(leftNow)),
      h('span', { class: 'r muted' }, pounds(last)));
  });
  const buckets = h('section', { class: 'card', 'aria-labelledby': 'bk' },
    h('div', { class: 'ch' }, h('h2', { id: 'bk' }, 'Buckets'), h('a', { href: '#budgets', class: 'tap muted small' }, 'Manage')),
    h('div', { class: 'brow bhead muted' }, h('span', null, 'Bucket'), h('span', null, 'This cycle'), h('span', { class: 'r' }, 'Spent'), h('span', { class: 'r' }, 'Left'), h('span', { class: 'r' }, 'Last cycle')),
    rows,
    h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'The white tick is where your spending would be today if you spent evenly.'));

  // ---- needs attention
  const attention = [];
  for (const b of ctx.ref.buckets) {
    const e = eff[b.name];
    const spent = s.byBucket[b.name] || 0;
    const last = st.prevS.byBucket[b.name] || 0;
    if (e && spent > e.total) attention.push({ level: 'over', title: `${b.name} is ${pounds(spent - e.total)} over`, body: `${pounds(spent)} spent against ${pounds(e.total)}.`, link: ['#transactions', 'See what it went on'] });
    else if (e && last > e.total * 1.5 && last - e.total >= 2000) attention.push({ level: 'warn', title: `${b.name} budget looks low`, body: `${pounds(e.total)} budgeted, ${pounds(last)} spent last cycle.`, link: ['#plan', 'Adjust budget'] });
  }
  const overdue = st.bills.filter((b) => b.overdue);
  if (overdue.length) attention.push({ level: 'warn', title: `${overdue.length} bill${overdue.length === 1 ? '' : 's'} not seen yet`, body: `${overdue.map((b) => `${b.name} (${shortDay(b.date)})`).join(', ')}. Import your latest Ulster statement to check.`, link: ['#import', 'Import'] });
  if (st.inherited) attention.push({ level: 'warn', title: 'This cycle uses last cycle’s budgets', body: 'Set this payday’s plan so the budgets match what you assigned.', link: ['#plan', 'Open payday plan'] });
  const needs = h('section', { class: 'card', 'aria-labelledby': 'na' },
    h('div', { class: 'ch' }, h('h2', { id: 'na' }, 'Needs attention'), attention.length ? h('span', { class: 'badge' }, String(attention.length)) : null),
    attention.length ? attention.map((a) => h('div', { class: 'att' }, h('span', { class: 'dot', style: { background: a.level === 'over' ? 'var(--over)' : 'var(--warning)', marginTop: '6px' } }),
      h('div', null, h('p', { style: { margin: 0, fontWeight: 500 } }, a.title), h('p', { class: 'muted small', style: { margin: '2px 0 0' } }, a.body), h('a', { href: a.link[0], class: 'tap small' }, a.link[1]))))
      : h('p', { class: 'muted', style: { margin: 0 } }, s.count ? 'Nothing needs a change right now.' : 'Nothing to flag yet: no spending this cycle.'));

  // ---- bills in the next 14 days
  const soon = upcomingBills(ctx.ref.bills || [], ctx.today, 14, ctx.transactions);
  const bills = h('section', { class: 'card', 'aria-labelledby': 'up' },
    h('div', { class: 'ch' }, h('h2', { id: 'up' }, 'Upcoming bills'), h('span', { class: 'muted small' }, soon.length ? `${pounds(soon.reduce((a, b) => a + b.amount_pence, 0))} in the next 14 days` : '')),
    soon.length ? soon.map((b) => h('div', { class: 'billrow' }, h('span', { class: b.date === ctx.today ? 'today' : 'muted' }, b.date === ctx.today ? 'Today' : shortDay(b.date)), h('span', null, b.name), h('span', { class: 'r' }, formatPence(b.amount_pence))))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'No bills due in the next 14 days.'));

  // ---- last cycle by bucket
  const lastRanked = ranked(st.prevS.byBucket);
  const lastTotal = lastRanked.reduce((a, [, v]) => a + v, 0) || 1;
  const colour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));
  const lastCard = lastRanked.length ? h('section', { class: 'card', 'aria-labelledby': 'lc' },
    h('div', { class: 'ch' }, h('h2', { id: 'lc' }, 'Last cycle by bucket'), h('span', { class: 'muted small' }, `${lastName}. ${pounds(st.prevS.netSpent)} spent`)),
    h('div', { class: 'stack', role: 'img', 'aria-label': 'Last cycle spending split by bucket' }, lastRanked.map(([b, v]) => h('span', { style: { width: `${(v / lastTotal) * 100}%`, background: colour[b] || 'var(--muted)' } }))),
    h('div', { class: 'legend' }, lastRanked.map(([b, v]) => h('span', null, h('span', { class: 'dot', style: { background: colour[b] || 'var(--muted)' } }), ` ${b} `, h('span', { class: 'muted' }, pounds(v)))))) : null;

  return h('div', { class: 'page' },
    head('Overview', `Cycle ${shortDay(c.start)} to ${shortDay(c.end)}. Day ${c.dayNumber} of ${c.totalDays}.`,
      h('a', { href: '#add', class: 'btn tap' }, 'Add transaction'), h('a', { href: '#import', class: 'btn primary tap' }, 'Import statements'), reopen),
    hero, inbox,
    h('div', { class: 'grid-main' }, buckets, h('div', { class: 'col' }, needs, bills)),
    lastCard);
}
