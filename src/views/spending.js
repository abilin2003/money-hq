// Analytics → Spending: everything about one pay cycle in detail (moved here from the Overview in Phase 2).
//   The full breakdown | buckets against budget and last cycle
//   Where it went (categories, vs last cycle) | shops and payees
//   When you spent (calendar) | biggest payments
// Pick any cycle in your history; it opens on the cycle the Overview is showing.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleList } from '../lib/cycles.js';
import { dailySpend, categoryChanges } from '../lib/analytics.js';
import { merchantKey, normKey } from '../lib/text.js';
import { head, shortDay, pounds, bar } from '../ui/parts.js';
import { calendarChart } from '../ui/charts.js';
import { cycleState, cycleFigures, paydaysOf, usualDay } from './state.js';
import { historyRows } from './history.js';
import { focusCycle } from './pages.js';
import { kindTag } from './overview.js';

const signed = (p) => `${p < 0 ? '−' : ''}${formatPence(Math.abs(p))}`;
const stat = (label, value, extra, tag) => h('div', null, h('span', { class: 'muted' }, label, tag ? kindTag(tag) : null), extra || h('span', null, value));

// Shops and payees, biggest first: your share of each, after refunds (spending lines only).
export function merchants(txs, splits = {}) {
  const out = new Map();
  for (const t of txs) {
    if (t.status === 'needs_review' || !['spend', 'refund'].includes(t.kind)) continue;
    const name = merchantKey(t.raw_description) || normKey(t.raw_description) || '(no description)';
    const cost = t.kind === 'spend' ? -t.amount_pence - Math.min(splits[t.id] || 0, -t.amount_pence) : -t.amount_pence;
    const m = out.get(name) || { name, pence: 0, count: 0, sample: t.raw_description };
    m.pence += cost; m.count += t.kind === 'spend' ? 1 : 0;
    out.set(name, m);
  }
  return [...out.values()].filter((m) => m.pence > 0).sort((a, b) => b.pence - a.pence);
}

export function spendingPage(ctx, param, rerender) {
  const rows = historyRows(ctx.all);
  const first = rows.map((t) => t.date).sort()[0] || ctx.today;
  const cycles = cycleList(paydaysOf(ctx), first, ctx.today, usualDay(ctx));
  const c = cycles.find((x) => x.start === param) || cycles.find((x) => x.start === focusCycle(ctx).focus.start) || cycles[0];
  const finished = c.end < ctx.today;
  const st = cycleState(ctx, c, rows);
  const { s, eff } = st;
  const f = cycleFigures(ctx, c, st, finished);
  const colour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));

  const picker = h('select', { class: 'input', 'aria-label': 'Pay cycle', style: { width: 'auto', minWidth: '220px' }, onchange: (e) => { location.hash = `spending/${e.target.value}`; } },
    cycles.map((x) => h('option', { value: x.start, selected: x.start === c.start }, `${x.name} cycle (${shortDay(x.start)} to ${shortDay(x.end)})`)));

  // ---- the full breakdown
  const breakdown = h('section', { class: 'card', 'aria-labelledby': 'sb' },
    h('h2', { id: 'sb' }, 'Breakdown'),
    h('div', { class: 'stats' },
      stat('Money in', formatPence(s.income), null, 'actual'),
      stat(s.fromSavings ? 'Spent from your pay' : 'Spent (your share)', formatPence(s.netSpent), null, 'actual'),
      f.unbudgeted > 0 && f.budgetTotal ? stat('…of which in buckets with no budget', formatPence(f.unbudgeted)) : null,
      s.fromSavings ? stat('Paid from savings (your share)', formatPence(s.fromSavings), null, 'actual') : null,
      s.fromSavings ? stat('Total spent (pay + savings)', formatPence(s.totalSpent), null, 'actual') : null,
      s.refunds ? stat('Refunds (taken off spending)', formatPence(s.refunds)) : null,
      s.paidBack ? stat('Paid back to you', formatPence(s.paidBack)) : null,
      s.owedToYou ? stat('Owed to you', null, h('a', { href: '#people', class: 'tap' }, formatPence(s.owedToYou))) : null,
      stat('Invested (after withdrawals)', signed(s.invested), null, 'actual'),
      f.plannedOf('invested') ? stat('Invested in your payday plan', formatPence(f.plannedOf('invested')), null, 'planned') : null,
      stat('Saved (after withdrawals)', signed(s.saved), null, 'actual'),
      f.plannedOf('saved') ? stat('Sinking funds in your payday plan', formatPence(f.plannedOf('saved')), null, 'planned') : null,
      f.owed && f.owed.status !== 'unknown' ? stat(`${f.card.name} to repay`, formatPence(f.owed.pence), null, f.owed.status) : null,
      stat('Bills', `${formatPence(f.billsPaid)} paid${f.billsDue ? `, ${formatPence(f.billsDue)} ${finished ? 'not seen' : 'due'}` : ''}`),
      f.budgetTotal ? stat('Budgets', formatPence(f.budgetTotal), null, 'planned') : null,
      !finished ? stat('Cash in your current accounts', f.cash.total === null ? 'Not entered' : formatPence(f.cash.total), f.cash.total === null ? h('a', { href: '#wealth', class: 'tap' }, 'Add balances') : null, f.cash.status === 'unknown' ? 'not verified' : f.cash.status) : null,
      s.waiting ? stat('Waiting for your decision', null, h('a', { href: '#inbox', class: 'tap' }, `${s.waiting} to review`)) : null));

  // ---- buckets against budget and last cycle
  const share = f.today / c.totalDays;
  const bucketRows = ctx.ref.buckets.map((b) => {
    const spent = s.byBucket[b.name] || 0;
    const e = eff[b.name];
    const left = e ? e.total - spent : null;
    return h('div', { class: 'brow' },
      h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour } }), h('span', null, b.name, !e ? h('span', { class: 'muted small' }, ' · no budget') : e.carried ? h('span', { class: 'muted small' }, ` (+${pounds(e.carried)} carried)`) : null)),
      e ? bar(spent / e.total, { colour: b.colour, tick: finished ? null : share, over: spent > e.total, label: `${pounds(spent)} of ${pounds(e.total)}` }) : h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }),
      h('span', { class: 'r' }, pounds(spent)),
      h('span', { class: `r ${left !== null && left < 0 ? 'over' : ''}` }, left === null ? '–' : left < 0 ? `${pounds(-left)} over` : `${pounds(left)} left`),
      h('span', { class: 'r muted' }, pounds(st.prevS.byBucket[b.name] || 0)));
  });
  const buckets = h('section', { class: 'card', 'aria-labelledby': 'sk' },
    h('div', { class: 'ch' }, h('h2', { id: 'sk' }, 'Buckets'), h('a', { href: '#budgets', class: 'tap muted small' }, 'Manage')),
    h('div', { class: 'brow bhead muted' }, h('span', null, 'Bucket'), h('span', null, 'Spent of budget'), h('span', { class: 'r' }, 'Spent'), h('span', { class: 'r' }, finished ? 'Result' : 'Left'), h('span', { class: 'r' }, 'Last cycle')),
    bucketRows,
    f.budgetTotal ? h('div', { class: 'brow btotal' }, h('span', null, 'Budgeted buckets'), h('span', { class: 'muted small' }, `of ${pounds(f.budgetTotal)}`), h('span', { class: 'r' }, pounds(f.spentBudgeted)), h('span', { class: `r ${f.spentBudgeted > f.budgetTotal ? 'over' : ''}` }, f.spentBudgeted > f.budgetTotal ? `${pounds(f.spentBudgeted - f.budgetTotal)} over` : `${pounds(f.budgetTotal - f.spentBudgeted)} left`), h('span', { class: 'r muted' }, pounds(f.prevBudgeted))) : null,
    h('div', { class: 'brow btotal' }, h('span', null, 'All spending'), h('span', { class: 'muted small' }, f.unbudgeted > 0 && f.budgetTotal ? `incl. ${pounds(f.unbudgeted)} with no budget` : ''), h('span', { class: 'r' }, pounds(s.netSpent)), h('span'), h('span', { class: 'r muted' }, pounds(st.prevS.netSpent))),
    !finished ? h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'The white tick is where your spending would be today if you spent evenly.') : null);

  // ---- where it went, with change since last cycle
  const changes = categoryChanges(s, st.prevS).filter((x) => x.now > 0).slice(0, 12);
  const top = changes[0]?.now || 1;
  const catColour = (name) => colour[ctx.ref.buckets.find((b) => b.id === ctx.ref.categories.find((k) => k.name === name)?.bucket_id)?.name] || 'var(--text-2)';
  const where = h('section', { class: 'card', 'aria-labelledby': 'sw' },
    h('div', { class: 'ch' }, h('h2', { id: 'sw' }, 'Categories'), h('span', { class: 'muted small' }, 'vs last cycle')),
    changes.length ? changes.map((x) => h('a', { href: `#transactions/${c.start}`, class: 'crow linkrow' }, h('span', { class: 'cname' }, x.name), bar(x.now / top, { colour: catColour(x.name), label: pounds(x.now) }), h('span', { class: 'r' }, pounds(x.now)),
      h('span', { class: `r small ${x.change > 0 ? 'over' : 'muted'}` }, x.before ? `${x.change > 0 ? '+' : '−'}${pounds(Math.abs(x.change))}` : 'new')))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending in this cycle.'));

  // ---- shops and payees
  const shops = merchants(st.txs, ctx.splitMap).slice(0, 12);
  const shopTop = shops[0]?.pence || 1;
  const merch = h('section', { class: 'card', 'aria-labelledby': 'sm' },
    h('div', { class: 'ch' }, h('h2', { id: 'sm' }, 'Shops and payees'), h('span', { class: 'muted small' }, 'your share')),
    shops.length ? shops.map((m) => h('div', { class: 'crow' }, h('span', { class: 'cname', title: m.sample }, m.name, h('span', { class: 'muted small' }, m.count > 1 ? ` ×${m.count}` : '')), bar(m.pence / shopTop, { label: pounds(m.pence) }), h('span', { class: 'r' }, pounds(m.pence))))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending in this cycle.'));

  // ---- calendar and biggest payments
  const days = dailySpend(st.txs, c, ctx.splitMap, ctx.settled);
  const cal = h('section', { class: 'card', 'aria-labelledby': 'sc' },
    h('div', { class: 'ch' }, h('h2', { id: 'sc' }, 'When you spent'), h('span', { class: 'muted small' }, 'darker = bigger day')),
    h('div', { class: 'calwrap' }, calendarChart({ days: days.map((d) => ({ ...d, today: d.date === ctx.today })), onPick: () => { location.hash = `transactions/${c.start}`; } })));
  const biggest = st.txs.filter((t) => t.kind === 'spend' && t.status !== 'needs_review').sort((a, b) => a.amount_pence - b.amount_pence).slice(0, 6);
  const big = h('section', { class: 'card', 'aria-labelledby': 'sg' }, h('h2', { id: 'sg' }, 'Biggest payments'),
    biggest.length ? h('div', { class: 'stats' }, biggest.map((t) => h('div', null, h('span', null, t.raw_description, h('span', { class: 'muted small' }, ` · ${shortDay(t.date)}${t.from_savings ? ' · from savings' : ''}`)), h('span', null, formatPence(-t.amount_pence))))) : h('p', { class: 'muted' }, 'Nothing yet.'),
    h('p', { style: { margin: '10px 0 0' } }, h('a', { href: `#transactions/${c.start}`, class: 'tap' }, `See all ${st.txs.length} lines`)));

  return h('div', { class: 'page' },
    head('Spending', `${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}${finished ? '' : `, day ${c.dayNumber} of ${c.totalDays}`}. ${pounds(s.totalSpent)} spent${s.fromSavings ? `, incl. ${pounds(s.fromSavings)} from savings` : ''}.`, picker),
    h('div', { class: 'grid-main' }, buckets, breakdown),
    h('div', { class: 'grid-even' }, where, merch),
    h('div', { class: 'grid-even' }, cal, big));
}
