// History: what you spent in every pay cycle (or calendar month) since your records begin, live and archived.
// Open any period to see it by bucket and category, and the lines behind it.
import { h } from '../ui/dom.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { summarise, ranked, monthName } from '../lib/summary.js';
import { head, shortDay, pounds, inCycle, txList, bar } from '../ui/parts.js';

// The bank's own copy of the fresh-start period is stored, but the live lines are the ones counted,
// so those archived copies are left out here to avoid counting November twice.
const OVERLAP = 'overlaps fresh start';
export const historyRows = (all) => all.filter((t) => !(t.archived && String(t.source || '').includes(OVERLAP)));

export function periods(all, mode, settings, today) {
  const rows = historyRows(all);
  if (!rows.length) return [];
  if (mode === 'month') {
    const months = [...new Set(rows.map((t) => t.date.slice(0, 7)))].sort().reverse();
    return months.map((m) => ({ key: m, label: monthName(m), sub: '', txs: rows.filter((t) => t.date.slice(0, 7) === m) }));
  }
  const first = rows.map((t) => t.date).sort()[0];
  return cycleList(settings?.paydays || [], first, today, settings?.payday_usual_day || 24)
    // Cycles that don't start on a payday you entered are estimates (the 24th, or the Friday before).
    .map((c) => ({ key: c.start, label: `${cycleName(c)} ${c.end.slice(0, 4)} cycle`, sub: `${shortDay(c.start)} to ${shortDay(c.end)}${c.predicted || !(settings?.paydays || []).includes(c.start) ? ' (payday estimated)' : ''}`, txs: rows.filter((t) => inCycle(t, c)) }))
    .filter((p) => p.txs.length);
}

export function historyPage(ctx, rerender) {
  const mode = ctx.historyMode || 'cycle';
  const list = periods(ctx.all, mode, ctx.ref.settings, ctx.today);
  const sums = list.map((p) => ({ ...p, s: summarise(p.txs, ctx.splitMap) }));
  const top = Math.max(1, ...sums.map((p) => p.s.netSpent));
  const colourOf = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));

  const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'Group by' },
    [['cycle', 'Pay cycles'], ['month', 'Months']].map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(mode === id), onclick: () => { ctx.historyMode = id; rerender(); } }, label)));

  const period = (p) => {
    const body = h('div', { class: 'period-body' });
    const details = h('details', { class: 'period', ontoggle: () => {
      if (!details.open || body.childElementCount) return;
      // Built only when opened, so the page stays quick with a year of data.
      const buckets = ranked(p.s.byBucket);
      const cats = ranked(p.s.byCategory).slice(0, 8);
      body.append(
        h('div', { class: 'grid2' },
          h('div', null, h('h3', { class: 'small-h' }, 'By bucket'), buckets.length ? buckets.map(([b, v]) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, h('span', { class: 'dot', style: { background: colourOf[b] || 'var(--muted)' } }), ` ${b}`), bar(v / buckets[0][1], { colour: colourOf[b] }), h('span', { class: 'r' }, pounds(v)))) : h('p', { class: 'muted' }, 'No spending.')),
          h('div', null, h('h3', { class: 'small-h' }, 'Top categories'), cats.length ? cats.map(([c, v]) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, c), bar(v / cats[0][1]), h('span', { class: 'r' }, pounds(v)))) : h('p', { class: 'muted' }, 'No spending.'))),
        h('div', { class: 'stats', style: { margin: '12px 0' } },
          h('div', null, h('span', { class: 'muted' }, 'Money in'), h('span', null, pounds(p.s.income))),
          h('div', null, h('span', { class: 'muted' }, 'Invested'), h('span', null, pounds(p.s.invested))),
          h('div', null, h('span', { class: 'muted' }, 'Paid back to you'), h('span', null, pounds(p.s.paidBack))),
          p.s.waiting ? h('div', null, h('span', { class: 'muted' }, 'Lines never decided (not counted)'), h('span', null, String(p.s.waiting))) : null),
        h('details', { class: 'lines' }, h('summary', null, `Show all ${p.txs.length} lines`), txList([...p.txs].sort((a, b) => b.date.localeCompare(a.date)))));
    } },
    h('summary', null,
      h('span', { class: 'plabel' }, h('span', { style: { fontWeight: 600 } }, p.label), p.sub ? h('span', { class: 'muted small' }, p.sub) : null),
      bar(p.s.netSpent / top, { label: `${pounds(p.s.netSpent)} spent` }),
      h('span', { class: 'r' }, pounds(p.s.netSpent))),
    body);
    return details;
  };

  return h('div', { class: 'page' },
    head('History', 'Everything you’ve spent since your records begin. Open a period to see where it went.', toggle),
    h('section', { class: 'card', 'aria-label': 'Spending by period' },
      sums.length ? sums.map(period) : h('p', { class: 'muted', style: { margin: 0 } }, 'No history yet.')));
}
