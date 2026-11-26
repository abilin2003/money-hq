// Analytics → Reports: every pay cycle's end-of-cycle review. Open any report, see trends across them, compare two,
// and look back at the reflections and improvements you chose (and whether they happened next cycle).
import { h } from '../ui/dom.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { needsRefresh } from '../lib/report.js';
import { head, shortDay, pounds, inCycle } from '../ui/parts.js';
import { groupedBars, lineChart } from '../ui/charts.js';
import { paydaysOf, usualDay, currentCycle } from './state.js';
import { periodInfo } from './explorer.js';
import { savedReport, reviewDue } from './review.js';

const diffTxt = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${pounds(Math.abs(p))}`;

export function reportsPage(ctx, param, rerender) {
  const info = periodInfo(ctx);
  const cur = currentCycle(ctx);
  const cycles = cycleList(paydaysOf(ctx), info.firstDate, ctx.today, usualDay(ctx)).filter((c) => c.end < cur.start && c.start >= info.firstDate);
  const items = cycles.map((c) => {
    const row = ctx.ref.cycles.find((x) => x.start_date === c.start);
    const r = savedReport(row);
    const txs = info.rows.filter((t) => inCycle(t, c));
    return { c, row, r, closed: Boolean(row?.closed_at), stale: r ? needsRefresh(r.fingerprint, txs) : false, name: `${cycleName(c)} ${c.end.slice(0, 4)}` };
  });
  const saved = items.filter((x) => x.r);
  const due = reviewDue(ctx);

  // ---- list
  const list = h('section', { class: 'card', 'aria-labelledby': 'rl' },
    h('h2', { id: 'rl' }, 'Your pay-cycle reports'),
    items.length ? items.map((x) => h('a', { href: `#review/${x.c.start}`, class: 'rrow linkrow' },
      h('span', null, h('strong', null, `${x.name} cycle`), h('br'), h('span', { class: 'muted small' }, `${shortDay(x.c.start)} to ${shortDay(x.c.end)}`)),
      h('span', { class: 'small' }, x.r ? [`Spent ${pounds(x.r.summary.spent)}`, h('br'), h('span', { class: 'muted' }, `${x.r.summary.savingsRate ?? '–'}% saved or invested · ${x.r.summary.budget.total ? (x.r.summary.budget.spent > x.r.summary.budget.total ? 'over budget' : 'within budget') : 'no budget'}`)] : h('span', { class: 'muted' }, 'No saved report')),
      h('span', { class: 'r' }, x.closed ? h('span', { class: 'ktag k-verified' }, 'Closed') : due?.cycle.start === x.c.start ? h('span', { class: 'ktag k-planned' }, 'Ready to review') : h('span', { class: 'ktag' }, 'Not reviewed'), x.stale ? h('span', { class: 'ktag k-estimated' }, 'May need refreshing') : null)))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'No finished pay cycles yet.'));

  // ---- trends across saved reports (oldest first)
  const series = [...saved].reverse();
  const trends = series.length >= 2 ? h('section', { class: 'card', 'aria-labelledby': 'rt' }, h('h2', { id: 'rt' }, 'Across your reports'),
    groupedBars({ labels: series.map((x) => cycleName(x.c).slice(0, 3)), series: [{ name: 'Income', colour: '#5BD6A0', values: series.map((x) => x.r.summary.income) }, { name: 'Spent', colour: '#F472B6', values: series.map((x) => x.r.summary.spent) }, { name: 'Put away', colour: '#8B9CFF', values: series.map((x) => x.r.summary.saved + x.r.summary.invested) }], onPick: (i) => { location.hash = `review/${series[i].c.start}`; }, label: 'Income, spending and money put away per reviewed cycle' }),
    lineChart({ labels: series.map((x) => cycleName(x.c).slice(0, 3)), series: [{ name: 'Saved or invested', colour: '#5BD6A0', values: series.map((x) => x.r.summary.savingsRate) }], percent: true, label: 'Share of income saved or invested per reviewed cycle' }))
    : h('section', { class: 'card' }, h('h2', null, 'Across your reports'), h('p', { class: 'muted', style: { margin: 0 } }, saved.length ? 'Close one more cycle with a review and trends across your reports appear here.' : 'Trends appear once you’ve reviewed and closed two cycles.'));

  // ---- compare two reports
  let compareCard = null;
  if (saved.length >= 2) {
    const q = new URLSearchParams(param || '');
    const A = saved.find((x) => x.c.start === q.get('a')) || saved[1];
    const B = saved.find((x) => x.c.start === q.get('b')) || saved[0];
    const pick = (which, x) => h('select', { class: 'input', 'aria-label': `Report ${which}`, onchange: (e) => { const u = new URLSearchParams({ a: A.c.start, b: B.c.start }); u.set(which.toLowerCase(), e.target.value); location.hash = `reports/${u.toString()}`; } }, saved.map((y) => h('option', { value: y.c.start, selected: y.c.start === x.c.start }, `${y.name} cycle`)));
    const ra = A.r.summary; const rb = B.r.summary;
    const line = (label, a, b, fmt = pounds, lowerIsBetter = false) => h('div', { class: 'rtr' }, h('span', null, label), h('span', { class: 'r muted' }, a === null ? '–' : fmt(a)), h('span', { class: 'r' }, b === null ? '–' : fmt(b)),
      h('span', { class: `r ${a === null || b === null || a === b ? 'muted' : (b > a) === lowerIsBetter ? 'over' : 'good'}` }, a === null || b === null ? '' : fmt === pounds ? diffTxt(b - a) : `${b - a > 0 ? '+' : ''}${b - a}`));
    const bucketsOf = (r) => Object.fromEntries(r.spending.buckets.map((x) => [x.key, x.pence]));
    const ba = bucketsOf(A.r); const bb = bucketsOf(B.r);
    compareCard = h('section', { class: 'card', 'aria-labelledby': 'rc' },
      h('div', { class: 'ch' }, h('h2', { id: 'rc' }, 'Compare two reports'), h('a', { href: `#compare/a=c.${A.c.start}&b=c.${B.c.start}`, class: 'tap small' }, 'Compare their transactions')),
      h('div', { class: 'cmp-pickers' }, h('label', { class: 'cmp-pick' }, h('span', { class: 'cmp-tag ta' }, 'A'), pick('A', A)), h('label', { class: 'cmp-pick' }, h('span', { class: 'cmp-tag tb' }, 'B'), pick('B', B))),
      h('div', { class: 'rtable' },
        h('div', { class: 'rtr muted small' }, h('span'), h('span', { class: 'r' }, A.name), h('span', { class: 'r' }, B.name), h('span', { class: 'r' }, 'Change')),
        line('Income', ra.income, rb.income), line('Spending', ra.spent, rb.spent, pounds, true), line('Saved', ra.saved, rb.saved), line('Invested', ra.invested, rb.invested),
        line('Left after spending and saving', ra.net, rb.net), line('Saving + investing rate', ra.savingsRate, rb.savingsRate, (v) => `${v}%`),
        line('Over budget by', Math.max(0, ra.budget.spent - ra.budget.total), Math.max(0, rb.budget.spent - rb.budget.total), pounds, true),
        line('Payments', A.r.spending.payments, B.r.spending.payments, String, true), line('Small payments', A.r.habits.small.pence, B.r.habits.small.pence, pounds, true),
        line('Takeaway and convenience', A.r.habits.convenience.now, B.r.habits.convenience.now, pounds, true),
        [...new Set([...Object.keys(ba), ...Object.keys(bb)])].map((k) => line(`  ${k}`, ba[k] || 0, bb[k] || 0, pounds, true))));
  }

  // ---- reflections and improvements, and whether they happened
  const notes = saved.filter((x) => x.r.review);
  const reflections = h('section', { class: 'card', 'aria-labelledby': 'rr' }, h('h2', { id: 'rr' }, 'Your reflections and improvements'),
    notes.length ? notes.map((x) => {
      const nextOne = items[items.indexOf(x) - 1]; // the cycle after (items are newest first), whose report checks these
      return h('div', { class: 'rrefl' }, h('h3', { class: 'small-h' }, `${x.name} cycle`),
        x.r.review.reflection ? h('blockquote', { class: 'rquote' }, x.r.review.reflection) : null,
        x.r.review.improvements?.length ? h('ul', { class: 'rlist' }, x.r.review.improvements.map((imp) => {
          const outcome = nextOne?.r?.improvementsReview?.find((o) => o.text === imp.text);
          return h('li', null, outcome ? h('span', { class: outcome.met ? 'good' : 'over' }, outcome.met ? '✓ ' : '✗ ') : null, imp.text, outcome?.actualText ? h('span', { class: 'muted small' }, ` (next cycle: ${outcome.actualText})`) : null);
        })) : h('p', { class: 'muted small' }, 'No improvements chosen.'));
    }) : h('p', { class: 'muted', style: { margin: 0 } }, 'When you close a cycle, your reflection and the improvements you choose are kept here, and each improvement is checked against the next cycle.'));

  return h('div', { class: 'page' },
    head('Financial reports', `${saved.length} saved report${saved.length === 1 ? '' : 's'}. Each pay cycle’s review: open it, compare two, or export one as a PDF from its page.`,
      due ? h('a', { href: `#review/${due.cycle.start}`, class: 'btn primary tap' }, `Review & close ${cycleName(due.cycle)}`) : null),
    list, h('div', { class: 'grid-even' }, trends, reflections), compareCard);
}
