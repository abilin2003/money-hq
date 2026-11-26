// End-of-cycle review: "Review & Close Pay Cycle". Opens from the Overview on the last day of a cycle (the day
// before payday) and stays available after payday until you close it. The report is worked out live until you
// close; closing saves it (with your reflection and chosen improvements) on the cycle's row, marks the cycle
// closed and changes nothing else: transactions are never moved or edited. If lines are imported later for a
// closed cycle, the report says it may need refreshing; a refresh is saved next to the original, never over it.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleFor, cycleList, cycleName } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { spendLines, inRange } from '../lib/explore.js';
import { buildReport, suggestBudgets, needsRefresh } from '../lib/report.js';
import { goalProgress, wealthSeries } from '../lib/planning.js';
import { head, shortDay, dayLabel, pounds, bar, inCycle, alertLine } from '../ui/parts.js';
import { groupedBars, paceChart, payFlow } from '../ui/charts.js';
import { closeCycleWithReport, saveCycleReport, reopenCycle } from '../lib/data.js';
import { cycleState, paydaysOf, usualDay, currentCycle, budgetsFor } from './state.js';
import { periodInfo, periodData, stateHref } from './explorer.js';
import { insightsFor } from './insights.js';
import { planProgress } from './moneyday.js';
import { savedFor, historyFor } from './goals.js';
import { planFor } from './plan.js';
import { resolvePeriod } from '../lib/period.js';

const signed = (p) => `${p < 0 ? '−' : ''}${pounds(Math.abs(p))}`;
const diffTxt = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${pounds(Math.abs(p))}`;
const yearName = (c) => `${cycleName(c)} ${c.end.slice(0, 4)}`;
const rowOf = (ctx, c) => ctx.ref.cycles.find((x) => x.start_date === c.start);
export const savedReport = (row) => (row?.report ? row.report.latest || row.report.original : null);

// Which cycle is ready for review: a finished one you haven't closed, or the current one on its last day.
export function reviewDue(ctx) {
  const cur = currentCycle(ctx);
  const info = periodInfo(ctx);
  const finished = cycleList(paydaysOf(ctx), info.firstDate, ctx.today, usualDay(ctx)).filter((c) => c.end < cur.start && c.start >= info.firstDate && !rowOf(ctx, c)?.closed_at && info.rows.some((t) => inCycle(t, c)));
  if (finished.length) return { cycle: finished[0], when: 'after' };
  if (ctx.today >= cur.end) return { cycle: cur, when: 'last day' };
  return null;
}

// Everything the report needs for a cycle.
export function reportInputs(ctx, c) {
  const info = periodInfo(ctx);
  const sel = c.end >= ctx.today ? { kind: 'current' } : { kind: 'cycle', start: c.start };
  const p = resolvePeriod(sel, info);
  const data = periodData(ctx, p, info);
  const txs = info.rows.filter((t) => inCycle(t, c));
  const prevC = cycleFor(addDays(c.start, -1), paydaysOf(ctx), usualDay(ctx));
  const hasPrev = prevC.start >= info.firstDate;
  const earlier = []; let k = prevC;
  for (let i = 0; i < 3 && k.start >= info.firstDate; i++) { earlier.push(k); k = cycleFor(addDays(k.start, -1), paydaysOf(ctx), usualDay(ctx)); }
  const st = cycleState(ctx, c, info.rows);
  const series = wealthSeries(ctx.ref.accounts, ctx.ref.snapshots || []);
  const a = series.filter((x) => x.date <= c.start).pop(); const b = series.filter((x) => x.date <= c.end && (!a || x.date > a.date)).pop();
  const prevRow = rowOf(ctx, prevC);
  return {
    sel, st, prevC, earlier,
    input: { cycle: { start: c.start, end: c.end, name: yearName(c), totalDays: c.totalDays }, txs,
      prev: hasPrev ? { txs: info.rows.filter((t) => inCycle(t, prevC)), name: yearName(prevC) } : null,
      usual: earlier.map((x) => spendLines(info.rows.filter(inRange(x.start, x.end)), ctx.splitMap, ctx.settled, info.merchants)),
      splits: ctx.splitMap, settled: ctx.settled, eff: st.eff, fctx: data.fctx, insights: insightsFor(ctx, p, info, data),
      goals: (ctx.ref.goals || []).map((g) => { const saved = savedFor(ctx, g); const gp = goalProgress({ target: g.target_pence, saved, date: g.target_date, monthly: g.monthly_pence, history: historyFor(ctx, g), today: ctx.today }); return { name: g.name, saved, target: g.target_pence, pct: gp.pct, status: gp.status }; }),
      netWorth: a && b ? { from: a.date, to: b.date, start: a.total, end: b.total } : null,
      merchants: info.merchants, plan: planProgress(ctx, c), previousImprovements: savedReport(prevRow)?.review?.improvements || [], smallLimit: ctx.smallLimit || 1000 },
  };
}

// ---------------------------------------------------------------- the report, drawn
// The report card: the cycle's main findings in under a minute, before the detail. Everything in it comes from
// the report's own figures and narrative (so a saved report's card is fixed with it).
export function reportCard(r) {
  const s = r.summary;
  const put = s.saved + s.invested;
  const overBy = s.budget.total ? s.budget.spent - s.budget.total : null;
  const change = s.prev ? s.spent - s.prev.spent : null;
  const observation = r.narrative.better[0] || r.narrative.drivers[0] || r.narrative.wentWell[0] || 'Nothing stood out this cycle.';
  const chosen = r.review?.improvements?.[0]?.text;
  const improvement = chosen || r.narrative.suggestions[0]?.text || 'No change suggested by this cycle’s numbers.';
  const fig = (label, value, sub, cls = '') => h('div', { class: 'rc-fig' }, h('span', { class: 'm-label' }, label), h('span', { class: `rc-v display ${cls}` }, value), sub ? h('span', { class: 'rc-sub' }, sub) : null);
  return h('section', { class: 'card report-card', id: 'report-card', 'aria-labelledby': 'rc-h' },
    h('div', { class: 'rc-head' }, h('h2', { id: 'rc-h' }, 'Report card'), h('span', { class: 'muted small' }, `${r.cycle.name} cycle`)),
    h('div', { class: 'rc-figs' },
      fig('Total spending', pounds(s.spent), s.fromSavings ? `incl. ${pounds(s.fromSavings)} from savings` : 'all from pay'),
      fig('Against budget', overBy === null ? 'No budget' : `${pounds(Math.abs(overBy))} ${overBy > 0 ? 'over' : 'under'}`, overBy === null ? null : `${pounds(s.budget.spent)} of ${pounds(s.budget.total)}`, overBy === null ? '' : overBy > 0 ? 'over' : 'good'),
      fig('Against last cycle', change === null ? '–' : `${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${pounds(Math.abs(change))}`, change === null ? 'no earlier cycle' : `${change > 0 ? 'more' : 'less'} than ${s.prev.name}`, change === null ? '' : change > 0 ? 'over' : 'good'),
      fig('Saved and invested', `${put < 0 ? '−' : ''}${pounds(Math.abs(put))}`, s.savingsRate === null ? null : `${s.savingsRate}% of income`)),
    h('div', { class: 'rc-notes' },
      h('div', null, h('span', { class: 'm-label' }, 'Most important observation'), h('p', null, observation)),
      h('div', null, h('span', { class: 'm-label' }, chosen ? 'Improvement you chose for next cycle' : 'Main potential improvement'), h('p', null, improvement))));
}

// Jump to any part of the report (scrolls; the page address stays the same).
export function reportToc(hasSeven = true) {
  const go = (id) => () => {
    const el = document.getElementById(id);
    if (!el) return;
    (el.closest('section') || el).scrollIntoView({ block: 'start' });
    const head = el.tagName === 'H2' ? el : el.querySelector('h2');
    head?.setAttribute('tabindex', '-1');
    head?.focus({ preventScroll: true });
  };
  const items = [['report-card', 'Report card'], ['rs1', 'Summary'], ['rs2', 'Spending'], ['rs3', 'Budgets'], ['rs4', 'Habits'], ['rs5', 'Savings'], ['rs6', 'Review'], ...(hasSeven ? [['rs7', 'Next cycle']] : [])];
  return h('nav', { class: 'report-toc no-print', 'aria-label': 'Report sections' }, items.map(([id, label]) => h('button', { type: 'button', onclick: go(id) }, label)));
}

export function renderReport(ctx, r, sel) {
  const s = r.summary;
  const sec = (n, title, ...kids) => h('section', { class: 'card rsec', 'aria-labelledby': `rs${n}` }, h('h2', { id: `rs${n}` }, h('span', { class: 'rnum' }, String(n)), title), ...kids);
  const tile = (label, value, sub, cls = '') => h('div', { class: 'rtile' }, h('span', { class: 'muted small' }, label), h('span', { class: `rtile-v display ${cls}` }, value), sub ? h('span', { class: 'muted small' }, sub) : null);
  const link = (f, txt, tx = null) => h('a', { href: stateHref('spending', sel, f, tx), class: 'tap' }, txt);
  const list = (items, cls = '') => (items.length ? h('ul', { class: `rlist ${cls}` }, items.map((x) => h('li', null, x))) : h('p', { class: 'muted small' }, 'Nothing to note.'));
  const colour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));
  const put = s.saved + s.invested;

  // 1. summary
  const one = sec(1, 'Financial summary',
    h('div', { class: 'rtiles' },
      tile('Income', pounds(s.income)),
      tile('Spending', pounds(s.spent), s.fromSavings ? `incl. ${pounds(s.fromSavings)} from savings` : 'all from pay'),
      tile('Saved', signed(s.saved), 'after withdrawals'),
      tile('Invested', signed(s.invested), 'after withdrawals'),
      tile('Unspent income', signed(s.net), 'income − spending − saving and investing; not the change in your bank balance', s.net < 0 ? 'over' : 'good'),
      tile('Saving + investing rate', s.savingsRate === null ? '–' : `${s.savingsRate}%`, s.prev?.savingsRate != null ? `${s.prev.savingsRate}% the cycle before` : null),
      tile('Spending vs budget', s.budget.total ? `${pounds(s.budget.spent)} / ${pounds(s.budget.total)}` : 'No budgets', s.budget.total ? (s.budget.spent > s.budget.total ? `${pounds(s.budget.spent - s.budget.total)} over` : `${pounds(s.budget.total - s.budget.spent)} under`) : null, s.budget.spent > s.budget.total && s.budget.total ? 'over' : ''),
      tile('Against last cycle', s.prev ? diffTxt(s.spent - s.prev.spent) : '–', s.prev ? `spent ${pounds(s.prev.spent)} in ${s.prev.name}` : 'no earlier cycle', s.prev && s.spent > s.prev.spent ? 'over' : 'good')),
    h('div', { class: 'grid-even' },
      s.prev ? groupedBars({ labels: [s.prev.name, r.cycle.name], series: [{ name: 'Income', colour: '#5BD6A0', values: [s.prev.income, s.income] }, { name: 'Spent', colour: '#F472B6', values: [s.prev.spent, s.spent] }, { name: 'Put away', colour: '#8B9CFF', values: [s.prev.saved + s.prev.invested, put] }], label: 'This cycle against the one before' }) : null,
      s.income > 0 ? payFlow({ total: s.income, flows: [{ name: 'Spent', pence: s.spent, colour: '#F472B6' }, { name: 'Saved', pence: Math.max(0, s.saved), colour: '#B79CFF' }, { name: 'Invested', pence: Math.max(0, s.invested), colour: '#5BD6A0' }, ...(s.net > 0 ? [{ name: 'Left over', pence: s.net, colour: '#5F6B7A' }] : [])].filter((x) => x.pence > 0), label: 'Where your income went' }) : null));

  // 2. spending breakdown
  const sp = r.spending;
  const topB = Math.max(1, ...sp.buckets.map((b) => b.pence));
  const two = sec(2, 'Spending breakdown',
    h('div', { class: 'rminis' },
      h('div', null, h('span', { class: 'muted small' }, 'Payments'), h('strong', null, String(sp.payments))),
      h('div', null, h('span', { class: 'muted small' }, 'Average payment'), h('strong', null, formatPence(sp.average))),
      h('div', null, h('span', { class: 'muted small' }, 'Typical payment'), h('strong', null, formatPence(sp.median))),
      h('div', null, h('span', { class: 'muted small' }, 'No-spend days'), h('strong', null, `${sp.noSpendDays} of ${sp.days}`))),
    h('div', { class: 'grid-even' },
      h('div', null, h('h3', { class: 'small-h' }, 'By category (tap to open)'),
        sp.buckets.map((b) => h('details', { class: 'rbucket' }, h('summary', { class: 'crow' }, h('span', { class: 'cname' }, h('span', { class: 'dot', style: { background: colour[b.key] || 'var(--muted)' } }), ` ${b.key}`), bar(Math.max(0, b.pence) / topB, { colour: colour[b.key] }), h('span', { class: 'r' }, signed(b.pence))),
          b.cats.map((c) => h('div', { class: 'crow sub' }, h('span', { class: 'cname' }, link({ bucket: b.key, category: c.key }, c.key), h('span', { class: 'muted small' }, c.count ? ` ×${c.count}` : '')), h('span'), h('span', { class: 'r' }, signed(c.pence))))))),
      h('div', null, h('h3', { class: 'small-h' }, 'Shops and payees'),
        sp.shops.map((m) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, link({ merchant: m.key }, m.name), h('span', { class: 'muted small' }, m.count > 1 ? ` ×${m.count}` : '')), h('span'), h('span', { class: 'r' }, pounds(m.pence)))))),
    h('div', { class: 'grid-even' },
      h('div', null, h('h3', { class: 'small-h' }, 'Biggest purchases'),
        h('div', { class: 'stats' }, sp.biggest.map((x) => h('div', null, h('span', null, link({}, x.name, x.id), h('span', { class: 'muted small' }, ` · ${shortDay(x.date)} · ${x.category}${x.fromSavings ? ' · from savings' : ''}`)), h('span', null, formatPence(x.pence)))))),
      h('div', null,
        h('h3', { class: 'small-h' }, 'Essential vs discretionary'), splitBar(sp.essential.yes, sp.essential.no, ['Essential', 'Discretionary'], [link({ essential: true }, 'see'), link({ essential: false }, 'see')]),
        h('p', { class: 'muted small' }, `Essential buckets: ${sp.essential.buckets.join(', ') || 'none chosen'}.`),
        h('h3', { class: 'small-h' }, 'Recurring vs one-off'), splitBar(sp.recurring.yes, sp.recurring.no, ['Recurring', 'One-off'], [link({ recurring: true }, 'see'), link({ recurring: false }, 'see')]))));

  // 3. budget performance
  const b = r.budget;
  const three = sec(3, 'Budget performance',
    b.rows.length ? [
      h('div', { class: 'rtable' },
        h('div', { class: 'rtr muted small' }, h('span', null, 'Bucket'), h('span', { class: 'r' }, 'Budget'), h('span', { class: 'r' }, 'Spent'), h('span', { class: 'r' }, 'Result')),
        b.rows.map((x) => h('div', { class: 'rtr' }, h('span', null, h('span', { class: 'dot', style: { background: colour[x.bucket] } }), ` ${x.bucket}`), h('span', { class: 'r muted' }, `${pounds(x.total)}${x.carried ? ` (+${pounds(x.carried)})` : ''}`), h('span', { class: 'r' }, pounds(x.actual)), h('span', { class: `r ${x.diff > 0 ? 'over' : 'good'}` }, x.diff > 0 ? `${pounds(x.diff)} over` : `${pounds(-x.diff)} under`))),
        h('div', { class: 'rtr btotal' }, h('span', null, 'Overall'), h('span', { class: 'r' }, pounds(s.budget.total)), h('span', { class: 'r' }, pounds(s.budget.spent)), h('span', { class: `r ${s.budget.spent > s.budget.total ? 'over' : 'good'}` }, s.budget.spent > s.budget.total ? `${pounds(s.budget.spent - s.budget.total)} over` : `${pounds(s.budget.total - s.budget.spent)} under`))),
      h('p', null, `${b.over.length} over (${b.over.join(', ') || 'none'}), ${b.under.length} within budget (${b.under.join(', ') || 'none'}). Unused allocations: ${pounds(b.unused)}.`),
      h('h3', { class: 'small-h' }, 'Spending pace'),
      paceChart({ days: r.cycle.totalDays, today: r.cycle.totalDays, spentByDay: b.cumulative, budget: s.budget.total, lastTotal: 0, startLabel: shortDay(r.cycle.start), endLabel: shortDay(r.cycle.end), todayLabel: null }),
      h('p', { class: 'muted small' }, b.crossedOn ? `Budgeted spending passed the budget on ${dayLabel(b.crossedOn)}.` : 'Budgeted spending stayed within the budget all cycle.'),
      Object.keys(b.reasons).length ? [h('h3', { class: 'small-h' }, 'Why the overspends happened'), Object.entries(b.reasons).map(([k, rs]) => h('div', { class: 'rreason' }, h('strong', null, k), list(rs)))] : null]
      : h('p', { class: 'muted' }, 'No budgets were set for this cycle.'));

  // 4. habits
  const hb = r.habits;
  const four = sec(4, 'Spending habits',
    h('div', { class: 'rminis' },
      h('div', null, h('span', { class: 'muted small' }, `Small payments (under ${pounds(hb.small.limit)})`), h('strong', null, `${hb.small.count} · ${pounds(hb.small.pence)}`), h('span', { class: 'muted small' }, hb.small.share !== null ? `${hb.small.share}% of spending · ` : '', link({ small: hb.small.limit }, 'see them'))),
      h('div', null, h('span', { class: 'muted small' }, 'Takeaway and convenience'), h('strong', null, pounds(hb.convenience.now)), h('span', { class: 'muted small' }, hb.convenience.prev !== null ? `${pounds(hb.convenience.prev)} the cycle before` : ''))),
    h('div', { class: 'grid-even' },
      h('div', null, h('h3', { class: 'small-h' }, 'Where you went most often'), hb.frequent.length ? hb.frequent.map((f) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, link({ merchant: f.key }, f.name)), h('span', { class: 'muted small' }, `×${f.count}`), h('span', { class: 'r' }, pounds(f.pence)))) : h('p', { class: 'muted small' }, 'No shop three times or more.')),
      h('div', null, h('h3', { class: 'small-h' }, 'Most expensive days'), hb.topDays.map((d) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, link({ day: d.date }, `${d.weekday} ${shortDay(d.date)}`), h('span', { class: 'muted small' }, d.top ? ` · ${d.top}` : '')), h('span', { class: 'muted small' }, `×${d.count}`), h('span', { class: 'r' }, pounds(d.pence)))))),
    hb.unusual.length ? [h('h3', { class: 'small-h' }, 'Unusual purchases'), list(hb.unusual.map((u) => u.body))] : null,
    hb.changes.length ? [h('h3', { class: 'small-h' }, 'Changes from the cycle before'),
      h('div', { class: 'rtable' }, h('div', { class: 'rtr muted small' }, h('span', null, 'Category'), h('span', { class: 'r' }, 'Before'), h('span', { class: 'r' }, 'Now'), h('span', { class: 'r' }, 'Change')),
        hb.changes.map((c) => h('div', { class: 'rtr' }, h('span', null, link({ category: c.key }, c.key), h('span', { class: 'muted small' }, ` ${c.countA}→${c.countB} payments`)), h('span', { class: 'r muted' }, pounds(c.a)), h('span', { class: 'r' }, pounds(c.b)), h('span', { class: `r ${c.diff > 0 ? 'over' : 'good'}` }, diffTxt(c.diff)))))] : null);

  // 5. savings and wealth
  const w = r.wealth;
  const five = sec(5, 'Savings and wealth',
    h('div', { class: 'rtiles' },
      tile('Saved (after withdrawals)', signed(w.saved)), tile('Invested (after withdrawals)', signed(w.invested)),
      tile('Net worth change', w.netWorth ? diffTxt(w.netWorth.end - w.netWorth.start) : '–', w.netWorth ? `${pounds(w.netWorth.start)} (${shortDay(w.netWorth.from)}) → ${pounds(w.netWorth.end)} (${shortDay(w.netWorth.to)})` : 'needs balances typed in at both ends of the cycle', w.netWorth && w.netWorth.end < w.netWorth.start ? 'over' : 'good')),
    w.funds.length ? [h('h3', { class: 'small-h' }, 'Sinking fund contributions in your plan'), h('div', { class: 'stats' }, w.funds.map((f) => h('div', null, h('span', null, f.name, h('span', { class: 'muted small' }, ` · ${f.state}`)), h('span', null, formatPence(f.pence)))))] : null,
    w.goals.length ? [h('h3', { class: 'small-h' }, 'Goals'), w.goals.map((g) => h('div', { class: 'rgoal' }, h('div', { class: 'ch' }, h('span', null, g.name), h('span', { class: 'muted small' }, `${g.pct}% · ${formatPence(g.saved)} of ${formatPence(g.target)} · ${g.status}`)), bar(g.saved / Math.max(1, g.target), { colour: 'var(--good)' })))] : h('p', { class: 'muted small' }, 'No goals set yet.'));

  // 6. the review
  const n = r.narrative;
  const six = sec(6, 'Your review',
    h('div', { class: 'grid-even' },
      h('div', { class: 'rnote good' }, h('h3', null, 'What went well'), list(n.wentWell)),
      h('div', { class: 'rnote warn' }, h('h3', null, 'What could have been better'), list(n.better))),
    h('div', { class: 'grid-even' },
      h('div', { class: 'rnote' }, h('h3', null, 'What cost the most'), list(n.drivers)),
      h('div', { class: 'rnote' }, h('h3', null, 'What changed'), list(n.changed))),
    r.improvementsReview.length ? h('div', { class: 'rnote' }, h('h3', null, 'Last cycle you chose to…'), h('ul', { class: 'rlist' }, r.improvementsReview.map((i) => h('li', null, h('span', { class: i.met === null ? 'muted' : i.met ? 'good' : 'over' }, i.met === null ? '• ' : i.met ? '✓ ' : '✗ '), i.text, i.actualText ? h('span', { class: 'muted small' }, ` (this cycle: ${i.actualText})`) : null)))) : null,
    h('p', { class: 'muted small' }, 'Every point above comes from your own transactions for this cycle and the one before; nothing is estimated.'));

  return [one, two, three, four, five, six];
}
function splitBar(a, b, names, links) {
  const t = Math.max(1, a + b);
  return h('div', null,
    h('div', { class: 'stack' }, h('span', { style: { flex: Math.max(0, a), background: 'var(--accent)' } }), h('span', { style: { flex: Math.max(0, b), background: '#F472B6' } })),
    h('div', { class: 'stats' }, h('div', null, h('span', null, `${names[0]} · `, links[0]), h('span', null, `${pounds(a)} (${Math.round((a / t) * 100)}%)`)), h('div', null, h('span', null, `${names[1]} · `, links[1]), h('span', null, `${pounds(b)} (${Math.round((b / t) * 100)}%)`))));
}

// ---------------------------------------------------------------- the page
export function reviewPage(ctx, param, rerender) {
  const info = periodInfo(ctx);
  const cycles = cycleList(paydaysOf(ctx), info.firstDate, ctx.today, usualDay(ctx));
  const due = reviewDue(ctx);
  const c = cycles.find((x) => x.start === param) || due?.cycle || cycles[1] || cycles[0];
  c.name = yearName(c);
  const row = rowOf(ctx, c);
  const closed = Boolean(row?.closed_at);
  const stored = row?.report || null;
  const { input, sel, st, earlier } = reportInputs(ctx, c);
  const showLatest = ctx.reportView !== 'original';
  const live = buildReport(input);
  const r = closed && stored ? (showLatest && stored.latest ? stored.latest : stored.original) : live;
  const stale = closed && stored && needsRefresh(stored.original.fingerprint, input.txs) && (!stored.latest || needsRefresh(stored.latest.fingerprint, input.txs));
  const print = h('button', { class: 'btn tap no-print', type: 'button', onclick: () => window.print() }, 'Export PDF');

  const banners = [];
  if (closed && !stored) banners.push(h('section', { class: 'card notice-card' }, h('p', { style: { margin: 0 } }, `This cycle was closed before reports existed, so this report is worked out from your records now.`)));
  if (closed && stored) banners.push(h('section', { class: 'card notice-card no-print' }, h('p', { style: { margin: 0 } }, `Closed on ${shortDay(stored.original.review?.closedOn || row.closed_at.slice(0, 10))}. ${stored.latest ? `You’re seeing the ${showLatest ? 'refreshed' : 'original'} report. ` : 'This is the report saved when you closed it. '}`,
    stored.latest ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { ctx.reportView = showLatest ? 'original' : 'latest'; rerender(); } }, showLatest ? 'Show the original' : 'Show the refreshed one') : null)));
  if (stale) {
    const refresh = h('button', { class: 'btn', type: 'button', onclick: async () => {
      try { const latest = { ...buildReport(input), generatedAt: new Date().toISOString(), review: stored.original.review }; const saved = await saveCycleReport(row.id, { ...stored, latest }); ctx.ref.cycles = ctx.ref.cycles.map((x) => (x.id === saved.id ? saved : x)); ctx.reportView = 'latest'; rerender(); } catch (err) { alertLine(refresh, err.message); }
    } }, 'Refresh report');
    banners.push(h('section', { class: 'card strip warn-strip no-print' }, h('span', null, h('strong', null, 'This report may need refreshing'), h('br'), h('span', { class: 'muted small' }, `Lines for this cycle have changed since it was saved (${input.txs.length} now). Refreshing keeps the original for comparison.`)), refresh));
  }

  // ---- 7. next-cycle planning and closing (open cycles); your saved notes (closed ones)
  let seven;
  const review = (closed && stored ? (r.review || stored.original.review) : null);
  if (closed) {
    seven = h('section', { class: 'card rsec', 'aria-labelledby': 'rs7' }, h('h2', { id: 'rs7' }, h('span', { class: 'rnum' }, '7'), 'Your notes for next cycle'),
      review ? [review.reflection ? h('blockquote', { class: 'rquote' }, review.reflection) : h('p', { class: 'muted' }, 'No reflection written.'),
        review.improvements?.length ? [h('h3', { class: 'small-h' }, 'Improvements you chose'), h('ul', { class: 'rlist' }, review.improvements.map((i) => h('li', null, i.text)))] : null,
        review.adjustments?.length ? [h('h3', { class: 'small-h' }, 'Budget changes you took'), h('ul', { class: 'rlist' }, review.adjustments.map((a) => h('li', null, `${a.bucket}: ${pounds(a.from)} → ${pounds(a.to)}`)))] : null] : h('p', { class: 'muted' }, 'No notes saved.'),
      h('div', { class: 'chips no-print' }, h('button', { class: 'linkbtn', type: 'button', onclick: async (e) => { const b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to reopen (the saved report is kept)'; return; } const saved = await reopenCycle(row.id); ctx.ref.cycles = ctx.ref.cycles.map((x) => (x.id === saved.id ? saved : x)); rerender(); } }, 'Reopen this cycle')));
  } else {
    const d = (ctx.reviewDraft ||= {})[c.start] ||= { reflection: '', chosen: [], custom: '', adjust: [], ready: false };
    const next = cycleFor(c.next || addDays(c.end, 1), paydaysOf(ctx), usualDay(ctx));
    // Suggestions start from next cycle's budgets if you've set them. A budget you've already cut for next cycle
    // is a deliberate choice, so no rise is suggested for it.
    const nextBudgets = budgetsFor(ctx, next).budgets;
    const basis = Object.keys(nextBudgets).length ? nextBudgets : st.budgets;
    const all = suggestBudgets(basis, [st.s.byBucket, ...earlier.slice(0, 2).map((x) => cycleState(ctx, x, info.rows).s.byBucket)]);
    const cut = all.filter((a) => a.to > a.from && Number.isInteger(st.budgets[a.bucket]) && a.from < st.budgets[a.bucket]);
    const adjustments = all.filter((a) => !cut.includes(a));
    const reflect = h('textarea', { class: 'input', rows: 3, placeholder: 'How did this cycle feel? What do you want to remember?', 'aria-label': 'Your reflection', oninput: (e) => { d.reflection = e.target.value; } }, d.reflection);
    const custom = h('input', { class: 'input', value: d.custom, placeholder: 'Your own improvement (optional)', 'aria-label': 'Your own improvement', oninput: (e) => { d.custom = e.target.value; } });
    const check = (list, id, label, extra) => h('label', { class: 'check rcheck' }, h('input', { type: 'checkbox', checked: d[list].includes(id), onchange: (e) => { d[list] = e.target.checked ? [...d[list], id] : d[list].filter((x) => x !== id); rerender(); } }), h('span', null, label, extra ? h('br') : null, extra ? h('span', { class: 'muted small' }, extra) : null));
    const planNext = h('button', { class: 'btn', type: 'button', onclick: () => {
      const base = { ...budgetsFor(ctx, next).budgets };
      for (const a of adjustments.filter((x) => d.adjust.includes(x.bucket))) base[a.bucket] = a.to;
      ctx.planDraft = { start: next.start, ...planFor(ctx.ref.settings?.extra, next.start), budgets: base, dirty: true };
      location.hash = `plan/${next.start}`;
    } }, d.adjust.length ? `Plan the next payday with ${d.adjust.length} change${d.adjust.length === 1 ? '' : 's'}` : 'Copy or change your payday plan');
    const close = h('button', { class: 'btn primary', type: 'button', disabled: !d.ready, onclick: async () => {
      close.disabled = true; close.textContent = 'Saving the report…';
      try {
        const improvements = [...r.narrative.suggestions.filter((x) => d.chosen.includes(x.id)).map(({ text, metric }) => ({ text, metric })), ...(d.custom.trim() ? [{ text: d.custom.trim(), metric: null }] : [])];
        const reviewNotes = { reflection: d.reflection.trim(), improvements, adjustments: adjustments.filter((x) => d.adjust.includes(x.bucket)).map(({ bucket, from, to }) => ({ bucket, from, to })), closedOn: ctx.today };
        const report = { ...buildReport(input), generatedAt: new Date().toISOString(), review: reviewNotes };
        const saved = await closeCycleWithReport(c, { original: report, latest: null });
        ctx.ref.cycles = [...ctx.ref.cycles.filter((x) => x.start_date !== saved.start_date), saved].sort((x, y) => x.start_date.localeCompare(y.start_date));
        delete ctx.reviewDraft[c.start];
        rerender();
      } catch (err) { close.disabled = false; close.textContent = 'Close cycle and save report'; alertLine(close, err.message); }
    } }, 'Close cycle and save report');
    seven = h('section', { class: 'card rsec no-print', 'aria-labelledby': 'rs7' }, h('h2', { id: 'rs7' }, h('span', { class: 'rnum' }, '7'), 'Plan the next cycle'),
      h('label', { class: 'field' }, 'Your reflection', reflect),
      h('h3', { class: 'small-h' }, 'Improvements for next cycle (each one is checked in your next review)'),
      r.narrative.suggestions.length ? r.narrative.suggestions.map((x) => check('chosen', x.id, x.text)) : h('p', { class: 'muted small' }, 'No suggestions from this cycle’s numbers.'), custom,
      h('h3', { class: 'small-h', style: { marginTop: '16px' } }, 'Suggested budget changes'),
      adjustments.length ? adjustments.map((a) => check('adjust', a.bucket, `${a.bucket}: ${pounds(a.from)} → ${pounds(a.to)}`, a.reason)) : h('p', { class: 'muted small' }, cut.length ? 'No other changes suggested.' : 'Your budgets match how you’ve been spending: no changes suggested.'),
      cut.length ? h('p', { class: 'muted small' }, `You’ve already cut ${cut.map((a) => `${a.bucket} (to ${pounds(a.from)})`).join(', ')} for the ${cycleName(next)} cycle, so no rise is suggested. For reference, you’ve spent ${cut.map((a) => `${pounds(a.to)} on ${a.bucket}`).join(', ')} on average.`) : null,
      h('div', { class: 'chips' }, planNext, h('a', { href: '#plan', class: 'btn tap' }, 'Open the current payday plan')),
      h('div', { class: 'rclose' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.ready, onchange: (e) => { d.ready = e.target.checked; rerender(); } }), `I’ve reviewed the ${c.name} cycle and it’s ready to close`),
        h('p', { class: 'muted small' }, 'Closing saves this report and your notes, and marks the cycle as reviewed. Your transactions stay exactly as they are; you can reopen it later.'),
        close));
  }

  return h('div', { class: 'page report' },
    head(`${c.name} cycle review`, `${shortDay(c.start)} to ${shortDay(c.end)} ${c.end.slice(0, 4)} · ${closed ? 'closed' : c.end >= ctx.today ? 'last day of the cycle' : 'finished, not closed yet'}`, print, h('a', { href: '#reports', class: 'btn tap no-print' }, 'All reports')),
    banners, reportToc(Boolean(seven)), reportCard(r), renderReport(ctx, r, sel), seven);
}
