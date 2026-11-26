// Analytics → Insights: what your spending in the chosen period says about your habits, each with how it was
// worked out and a link to the payments behind it (lib/insights.js has the rules).
import { h } from '../ui/dom.js';
import { cycleList } from '../lib/cycles.js';
import { resolvePeriod, previousPeriod } from '../lib/period.js';
import { spendLines, inRange } from '../lib/explore.js';
import { buildInsights } from '../lib/insights.js';
import { addDays, dayDiff } from '../lib/dates.js';
import { head, pounds } from '../ui/parts.js';
import { cycleState } from './state.js';
import { readState, stateHref, periodInfo, periodData, periodBar } from './explorer.js';

const LEVEL = { good: 'var(--good)', watch: 'var(--warning)', act: 'var(--over)', info: 'var(--accent)' };
const LEVEL_NAME = { act: 'Needs action', watch: 'Worth watching', info: 'Good to know', good: 'Opportunity' };

// Everything the rules need for a period: its lines, up to three earlier periods of the same kind, the history
// before it (for "unusual"), and recent cycles' budgets.
export function insightsFor(ctx, p, info, data = periodData(ctx, p, info)) {
  const to = p.to > info.today ? info.today : p.to;
  const days = dayDiff(p.from, to) + 1;
  const base = [];
  let prev = p;
  for (let i = 0; i < 3; i++) {
    prev = previousPeriod(prev, info);
    if (!prev || prev.to < info.firstDate) break;
    if (prev.from < info.firstDate) break; // only whole periods inside your records
    base.push({ lines: spendLines(info.rows.filter(inRange(prev.from, prev.to)), ctx.splitMap, ctx.settled, info.merchants), days: prev.days, label: prev.label.replace(/ cycle$/, '').replace(/ \d{4}/, '') });
  }
  const history = spendLines(info.rows.filter(inRange(addDays(p.from, -200), addDays(p.from, -1))), ctx.splitMap, ctx.settled, info.merchants);
  let budgets = [];
  if (p.cycle || p.kind === 'last') {
    const all = cycleList(info.paydays, info.firstDate, info.today, info.usualDay);
    const startAt = all.findIndex((c) => c.start === (p.cycle || p.cycles[0]).start);
    budgets = all.slice(startAt, startAt + 3).filter((c) => c.start >= info.firstDate).map((c) => {
      const st = cycleState(ctx, c, info.rows);
      return { label: c.name, budget: st.effTotals, actual: st.s.byBucket };
    });
  }
  return buildInsights({ lines: data.lines, from: p.from, to, days, base, history, budgets, fctx: data.fctx, smallLimit: ctx.smallLimit || 1000, periodName: p.cycle ? 'this cycle' : 'this period' });
}

export function insightCard(i, href, { compact = false } = {}) {
  return h('section', { class: `card insight ins2 ${compact ? 'compact' : ''}`, style: { borderLeftColor: LEVEL[i.level] }, 'aria-label': i.title },
    h('p', { class: 'ins-level small', style: { color: LEVEL[i.level] } }, LEVEL_NAME[i.level]),
    h('h3', { class: 'ins-title' }, i.title),
    h('p', { class: 'ins-body' }, i.body),
    i.saving ? h('p', { class: 'ins-save small' }, i.savingText || `${pounds(i.saving)} possible saving`) : null,
    compact ? null : h('details', { class: 'ins-how small' }, h('summary', null, 'How this is worked out'), h('p', { class: 'muted' }, i.how)),
    h('a', { href, class: 'btn tap ins-go' }, `See the ${i.count === 1 ? 'payment' : `${i.count} payments`} (${i.pence < 0 ? '−' : ''}${pounds(Math.abs(i.pence))})`));
}

export function insightsPage(ctx, param) {
  const { sel } = readState(ctx, param);
  const info = periodInfo(ctx);
  const p = resolvePeriod(sel, info);
  const list = insightsFor(ctx, p, info);
  const cards = list.map((i) => insightCard(i, stateHref('spending', p.sel, i.filter)));
  return h('div', { class: 'page' },
    head('Insights', list.length ? `${list.length} thing${list.length === 1 ? '' : 's'} worth knowing about ${p.label}. Each one links to the payments behind it.` : `Nothing to point out for ${p.label}.`),
    periodBar(ctx, 'insights', p, info),
    list.length ? h('div', { class: 'ins-grid' }, cards)
      : h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'There isn’t enough spending in this period to say anything reliable. Try a longer period, or a finished cycle.')),
    h('p', { class: 'muted small' }, 'Insights only use your own transactions: counts, totals, averages and medians. “Usual” is the average of up to three earlier periods of the same kind, scaled to the same number of days. Savings figures show what the numbers would be, not advice.'));
}
