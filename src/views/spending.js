// Analytics → Spending: analyse any period in detail. Pick a pay cycle, the last 3/6/12 cycles, a month or your own
// dates; every chart, row and number below responds, and clicking any of them opens a panel with the lines behind
// it (bucket → category → shop → transaction, which you can edit there).
// Everything is built from one list of spending lines (lib/explore.js), so every total reconciles with the
// transactions it's made of.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { monthName } from '../lib/summary.js';
import { resolvePeriod, previousPeriod } from '../lib/period.js';
import { shopName, spendLines, inRange, total, fromPay, group, byDay, applyFilter, compare, frequency, flows, weekStart, WEEKDAYS, weekdayOf } from '../lib/explore.js';
import { head, shortDay, pounds, bar } from '../ui/parts.js';
import { stackedBars, calendarChart, payFlow } from '../ui/charts.js';
import { cycleState } from './state.js';
import { readState, stateHref, periodInfo, periodData, periodBar, drillPanel } from './explorer.js';

const ROUTE = 'spending';
const signed = (p) => `${p < 0 ? '−' : ''}${pounds(Math.abs(p))}`;
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');

export function spendingPage(ctx, param, rerender) {
  const { sel, f, tx, q } = readState(ctx, param);
  const info = periodInfo(ctx);
  const p = resolvePeriod(sel, info);
  const data = periodData(ctx, p, info);
  const { lines, txs, fctx } = data;
  const go = (ff) => stateHref(ROUTE, p.sel, ff);
  const colour = Object.fromEntries(ctx.ref.buckets.map((b) => [b.name, b.colour]));
  const bucketNames = ctx.ref.buckets.map((b) => b.name);
  const all = total(lines);
  const pay = total(fromPay(lines));
  const prev = previousPeriod(p, info);
  const prevLines = prev ? spendLines(info.rows.filter(inRange(prev.from, prev.to)), ctx.splitMap, ctx.settled, info.merchants) : [];
  const fl = flows(txs);

  // ---- summary tiles (each opens what's behind it)
  const tile = (label, value, sub, href) => h(href ? 'a' : 'div', { href, class: `card tile${href ? ' linkrow' : ''}` }, h('span', { class: 'muted small' }, label), h('span', { class: 'tile-v display' }, value), sub ? h('span', { class: 'muted small' }, sub) : null);
  const left = fl.income - all - fl.saved - fl.invested;
  const tiles = h('div', { class: 'tiles' },
    tile('Total spent', pounds(all), prev ? `${all >= total(prevLines) ? '+' : '−'}${pounds(Math.abs(all - total(prevLines)))} vs ${prev.label.toLowerCase().startsWith('the') ? 'before' : prev.label}` : null, `${go({})}&all=1`),
    tile('From your pay', pounds(pay), `${pounds(pay / p.days)} a day`, go({ savings: false })),
    tile('From savings', pounds(all - pay), 'big buys', go({ savings: true })),
    tile('Money in', pounds(fl.income), null, go({ kind: 'income' })),
    tile('Saved and invested', signed(fl.saved + fl.invested), 'after withdrawals', go({ kind: 'putaway' })),
    tile('Unspent income', signed(left), 'income − spending − saving; not your bank balance', null));

  // ---- spending by category: buckets, each opening into its categories
  const buckets = group(lines, (l) => l.bucket);
  const prevBucket = Object.fromEntries(group(prevLines, (l) => l.bucket).map((g) => [g.key, g.pence]));
  const topB = Math.max(1, ...buckets.map((g) => g.pence));
  const catCard = h('section', { class: 'card', 'aria-labelledby': 'xc' },
    h('div', { class: 'ch' }, h('h2', { id: 'xc' }, 'Spending by category'), h('span', { class: 'muted small' }, prev ? 'change vs the period before' : '')),
    buckets.length ? buckets.map((g) => {
      const d = g.pence - (prevBucket[g.key] || 0);
      return h('a', { href: go({ bucket: g.key }), class: 'crow4 linkrow' },
        h('span', { class: 'cname' }, h('span', { class: 'dot', style: { background: colour[g.key] || 'var(--muted)' } }), ` ${g.key}`),
        bar(Math.max(0, g.pence) / topB, { colour: colour[g.key], label: pounds(g.pence) }),
        h('span', { class: 'r' }, signed(g.pence)),
        h('span', { class: `r small ${d > 0 ? 'over' : 'muted'}` }, prev ? `${d > 0 ? '+' : d < 0 ? '−' : ''}${pounds(Math.abs(d))}` : ''));
    }) : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending in this period.'),
    h('div', { class: 'crow4 btotal' }, h('span', null, 'Total'), h('span'), h('span', { class: 'r' }, pounds(all)), h('span', { class: 'r small muted' }, prev ? `${all >= total(prevLines) ? '+' : '−'}${pounds(Math.abs(all - total(prevLines)))}` : '')),
    h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'Tap a bucket to see its categories, then its shops and every payment.'));

  // ---- budget vs actual (budgets are per pay cycle, so only for cycle periods)
  let budgetCard;
  if (p.kind === 'cycle' || p.kind === 'last') {
    const budget = {}; const actual = {};
    for (const c of p.cycles) {
      const st = cycleState(ctx, c, info.rows);
      for (const [b, v] of Object.entries(st.effTotals)) budget[b] = (budget[b] || 0) + v;
      for (const [b, v] of Object.entries(st.s.byBucket)) actual[b] = (actual[b] || 0) + v;
    }
    const names = bucketNames.filter((b) => budget[b] || actual[b]);
    const bt = names.reduce((a, b) => a + (budget[b] || 0), 0);
    const at = names.filter((b) => budget[b]).reduce((a, b) => a + (actual[b] || 0), 0);
    budgetCard = h('section', { class: 'card', 'aria-labelledby': 'xb' },
      h('div', { class: 'ch' }, h('h2', { id: 'xb' }, 'Budget vs actual'), h('span', { class: 'muted small' }, p.cycles.length > 1 ? `${p.cycles.length} cycles added together` : 'from your pay')),
      names.map((b) => {
        const bud = budget[b] || 0; const act = actual[b] || 0;
        return h('a', { href: go({ bucket: b, savings: false }), class: 'bva linkrow' },
          h('span', { class: 'cname' }, h('span', { class: 'dot', style: { background: colour[b] } }), ` ${b}`),
          bud ? bar(act / bud, { colour: colour[b], over: act > bud, label: `${pounds(act)} of ${pounds(bud)}` }) : h('span', { class: 'bar dashed', role: 'img', 'aria-label': 'No budget' }),
          h('span', { class: 'r small' }, pounds(act), h('span', { class: 'muted' }, bud ? ` / ${pounds(bud)}` : ' · no budget')),
          h('span', { class: `r small ${bud && act > bud ? 'over' : 'muted'}` }, bud ? (act > bud ? `${pounds(act - bud)} over` : `${pounds(bud - act)} left`) : ''));
      }),
      bt ? h('div', { class: 'bva btotal' }, h('span', null, 'Budgeted buckets'), bar(at / bt, { over: at > bt }), h('span', { class: 'r small' }, `${pounds(at)} / ${pounds(bt)}`), h('span', { class: `r small ${at > bt ? 'over' : 'muted'}` }, at > bt ? `${pounds(at - bt)} over` : `${pounds(bt - at)} left`)) : null,
      h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'Big buys paid from savings don’t count against budgets.'));
  } else {
    budgetCard = h('section', { class: 'card', 'aria-labelledby': 'xb' }, h('h2', { id: 'xb' }, 'Budget vs actual'),
      h('p', { class: 'muted', style: { margin: 0 } }, 'Budgets are set per pay cycle, so pick a pay cycle (or the last few) to compare spending with them.'));
  }

  // ---- shops and payees
  const shops = group(lines.filter((l) => l.kind !== 'payback'), (l) => l.merchant).filter((g) => g.pence > 0);
  const topS = shops[0]?.pence || 1;
  const merchCard = h('section', { class: 'card', 'aria-labelledby': 'xm' },
    h('div', { class: 'ch' }, h('h2', { id: 'xm' }, 'Spending by shop or payee'), h('span', { class: 'muted small' }, `${shops.length} in total`)),
    shops.length ? shops.slice(0, 15).map((g) => h('a', { href: go({ merchant: g.key }), class: 'crow linkrow' },
      h('span', { class: 'cname', title: g.lines[0].t.raw_description }, shopName(g.lines), h('span', { class: 'muted small' }, g.count > 1 ? ` ×${g.count}` : '')), bar(g.pence / topS, { label: pounds(g.pence) }), h('span', { class: 'r' }, pounds(g.pence))))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending in this period.'));

  // ---- changes by category vs the period before
  const changes = prev ? compare(prevLines, lines, (l) => l.category).slice(0, 10) : [];
  const maxD = Math.max(1, ...changes.map((r) => Math.abs(r.diff)));
  const changeCard = h('section', { class: 'card', 'aria-labelledby': 'xd' },
    h('div', { class: 'ch' }, h('h2', { id: 'xd' }, 'Biggest changes by category'), prev && p.cycle ? h('a', { href: stateHref('compare', p.sel, {}, null, { a: `c.${prev.from}`, b: p.current ? 'cur' : `c.${p.from}` }), class: 'tap muted small' }, 'Compare in detail') : null),
    !prev ? h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing before this period to compare with.')
      : changes.length ? changes.map((r) => h('a', { href: go({ category: r.key }), class: 'chg linkrow' },
        h('span', { class: 'cname' }, r.key, h('span', { class: 'muted small' }, ` ${signed(r.a)} → ${signed(r.b)}`)),
        h('span', { class: 'diffbar', role: 'img', 'aria-label': `${r.diff > 0 ? 'up' : 'down'} ${pounds(Math.abs(r.diff))}` }, h('span', { class: r.diff > 0 ? 'up' : 'down', style: { width: `${(Math.abs(r.diff) / maxD) * 50}%` } })),
        h('span', { class: `r small ${r.diff > 0 ? 'over' : 'good'}` }, `${r.diff > 0 ? '+' : '−'}${pounds(Math.abs(r.diff))}`)))
        : h('p', { class: 'muted', style: { margin: 0 } }, 'No spending in either period.'),
    prev ? h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, `Against ${prev.label.startsWith('The') ? prev.label.toLowerCase() : prev.label} (${pounds(total(prevLines))}).`) : null);

  // ---- by pay cycle and by month (context around a single period), each bar opens that period
  const span = p.cycles.length > 1 ? [...p.cycles].reverse() : cycleList(info.paydays, info.firstDate, p.to < info.today ? p.to : info.today, info.usualDay).slice(0, 6).reverse();
  const spanLines = spendLines(info.rows.filter(inRange(span[0].start, span[span.length - 1].end)), ctx.splitMap, ctx.settled, info.merchants);
  const seriesFor = (keys, keyOf) => bucketNames.map((b) => ({ name: b, colour: colour[b], values: keys.map((k) => total(spanLines.filter((l) => l.bucket === b && keyOf(l) === k))) }));
  const cycKey = (l) => span.find((c) => l.date >= c.start && l.date <= c.end)?.start;
  const cycleCard = h('section', { class: 'card', 'aria-labelledby': 'xy' },
    h('div', { class: 'ch' }, h('h2', { id: 'xy' }, 'Spending by pay cycle'), h('span', { class: 'muted small' }, 'tap a bar to open that cycle')),
    stackedBars({ labels: span.map((c) => `${cycleName(c).slice(0, 3)}${c.start === p.cycle?.start ? ' ●' : ''}`), series: seriesFor(span.map((c) => c.start), cycKey), label: 'Spending per pay cycle by bucket',
      onPick: (i) => { location.hash = stateHref(ROUTE, i === span.length - 1 && span[i].end >= info.today ? { kind: 'current' } : { kind: 'cycle', start: span[i].start }); } }));
  const months = [];
  for (let ym = (p.to < info.today ? p.to : info.today).slice(0, 7); months.length < Math.max(6, Math.ceil(p.days / 30) + 1) && ym >= info.firstDate.slice(0, 7); ym = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)) months.unshift(ym);
  const monthLines = spendLines(info.rows.filter(inRange(`${months[0]}-01`, `${months[months.length - 1]}-31`)), ctx.splitMap, ctx.settled, info.merchants);
  const monthCard = h('section', { class: 'card', 'aria-labelledby': 'xn' },
    h('div', { class: 'ch' }, h('h2', { id: 'xn' }, 'Monthly spending'), h('span', { class: 'muted small' }, 'calendar months · tap to open')),
    stackedBars({ labels: months.map((ym) => monthName(ym).slice(0, 3)), series: bucketNames.map((b) => ({ name: b, colour: colour[b], values: months.map((ym) => total(monthLines.filter((l) => l.bucket === b && l.date.slice(0, 7) === ym))) })), label: 'Spending per calendar month by bucket',
      onPick: (i) => { location.hash = stateHref(ROUTE, { kind: 'month', ym: months[i] }); } }));

  // ---- daily and weekly spending
  const days = byDay(lines, p.from, p.to > info.today ? info.today : p.to);
  const weeks = [...new Set(days.map((d) => weekStart(d.key)))];
  const weekTotals = weeks.map((w) => total(lines.filter((l) => weekStart(l.date) === w)));
  const daily = h('section', { class: 'card', 'aria-labelledby': 'xa' },
    h('div', { class: 'ch' }, h('h2', { id: 'xa' }, 'Daily spending'), h('span', { class: 'muted small' }, `${pounds(all / Math.max(1, days.length))} a day on average`)),
    days.length <= 62 ? stackedBars({ labels: days.map((d, i) => (days.length <= 16 || i % Math.ceil(days.length / 12) === 0 ? String(+d.key.slice(8, 10)) : '')), series: [{ name: 'Spent', colour: '#8B9CFF', values: days.map((d) => d.pence) }], label: 'Spending per day', onPick: (i) => { if (days[i].lines.length) location.hash = go({ day: days[i].key }); } })
      : h('p', { class: 'muted', style: { margin: 0 } }, 'Too many days to show one by one: see the weeks alongside, or pick a shorter period.'));
  const weekly = h('section', { class: 'card', 'aria-labelledby': 'xw' },
    h('div', { class: 'ch' }, h('h2', { id: 'xw' }, 'Weekly spending'), h('span', { class: 'muted small' }, 'weeks start on Monday')),
    stackedBars({ labels: weeks.map((w, i) => (weeks.length <= 14 || i % Math.ceil(weeks.length / 10) === 0 ? shortDay(w) : '')), series: [{ name: 'Spent', colour: '#5BD6A0', values: weekTotals }], label: 'Spending per week', onPick: (i) => { location.hash = go({ week: weeks[i] }); } }));

  // ---- heatmap and how often you spend
  const heat = h('section', { class: 'card', 'aria-labelledby': 'xh' },
    h('div', { class: 'ch' }, h('h2', { id: 'xh' }, 'Spending heatmap'), h('span', { class: 'muted small' }, 'darker = bigger day · tap a day')),
    days.length && days.length <= 93 ? h('div', { class: 'calwrap' }, calendarChart({ days: days.map((d) => ({ date: d.key, pence: Math.max(0, d.pence), today: d.key === info.today })), onPick: (d) => { location.hash = go({ day: d.date }); } }))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'Pick a period of three months or less to see every day. The weekday pattern is alongside.'));
  const fq = frequency(lines, p.from, p.to > info.today ? info.today : p.to);
  const wd = WEEKDAYS.map((d) => { const ls = lines.filter((l) => weekdayOf(l.date) === d); return { d, pence: total(ls), count: ls.filter((l) => l.kind === 'spend').length }; });
  const topW = Math.max(1, ...wd.map((x) => x.pence));
  const freq = h('section', { class: 'card', 'aria-labelledby': 'xf' },
    h('h2', { id: 'xf' }, 'How often you spend'),
    h('div', { class: 'minis' },
      h('div', null, h('span', { class: 'muted small' }, 'Payments'), h('strong', null, String(fq.payments)), h('span', { class: 'muted small' }, `${fq.perDay.toFixed(1)} a day`)),
      h('div', null, h('span', { class: 'muted small' }, 'Days you spent'), h('strong', null, `${fq.spendDays} of ${fq.days}`), h('span', { class: 'muted small' }, `${fq.noSpendDays} no-spend day${fq.noSpendDays === 1 ? '' : 's'}`)),
      h('div', null, h('span', { class: 'muted small' }, 'Typical payment'), h('strong', null, formatPence(fq.median)), h('span', { class: 'muted small' }, `average ${formatPence(fq.average)}`))),
    h('h3', { class: 'small-h', style: { marginTop: '14px' } }, 'By day of the week'),
    wd.map((x) => h('a', { href: go({ weekday: x.d }), class: 'crow linkrow' }, h('span', { class: 'cname' }, x.d, h('span', { class: 'muted small' }, ` ×${x.count}`)), bar(Math.max(0, x.pence) / topW, { label: pounds(x.pence) }), h('span', { class: 'r' }, pounds(x.pence)))));

  // ---- recurring vs one-off, essential vs discretionary, small purchases
  const split2 = (title, a, b, hrefA, hrefB, note) => {
    const ta = total(a); const tb = total(b);
    return h('div', { class: 'panel-sec' }, h('h3', { class: 'small-h' }, title),
      h('div', { class: 'stack', role: 'img', 'aria-label': `${title}: ${pct(ta, ta + tb)} and ${pct(tb, ta + tb)}` }, h('span', { style: { flex: Math.max(0, ta), background: 'var(--accent)' } }), h('span', { style: { flex: Math.max(0, tb), background: '#F472B6' } })),
      h('a', { href: hrefA, class: 'crow linkrow' }, h('span', { class: 'cname' }, h('span', { class: 'dot', style: { background: 'var(--accent)' } }), ` ${note[0]}`), h('span', { class: 'muted small' }, pct(ta, ta + tb)), h('span', { class: 'r' }, pounds(ta))),
      h('a', { href: hrefB, class: 'crow linkrow' }, h('span', { class: 'cname' }, h('span', { class: 'dot', style: { background: '#F472B6' } }), ` ${note[1]}`), h('span', { class: 'muted small' }, pct(tb, ta + tb)), h('span', { class: 'r' }, pounds(tb))));
  };
  const limit = ctx.smallLimit || 1000;
  const small = applyFilter(lines, { small: limit });
  const smallShops = group(small, (l) => l.merchant).slice(0, 5);
  const kinds = h('section', { class: 'card', 'aria-labelledby': 'xk' },
    h('h2', { id: 'xk' }, 'Kinds of spending'),
    split2('Recurring vs one-off', applyFilter(lines, { recurring: true }, fctx), applyFilter(lines, { recurring: false }, fctx), go({ recurring: true }), go({ recurring: false }), ['Recurring (bills and regular payments)', 'One-off']),
    split2('Essential vs discretionary', applyFilter(lines, { essential: true }, fctx), applyFilter(lines, { essential: false }, fctx), go({ essential: true }), go({ essential: false }), [`Essential (${[...fctx.essential].join(', ')})`, 'Discretionary']),
    h('div', { class: 'panel-sec' },
      h('div', { class: 'ch' }, h('h3', { class: 'small-h', style: { margin: 0 } }, 'Small purchases'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Small means under' }, [500, 1000, 2000].map((v) => h('button', { type: 'button', 'aria-pressed': String(limit === v), onclick: () => { ctx.smallLimit = v; rerender(); } }, `<${pounds(v)}`)))),
      h('a', { href: go({ small: limit }), class: 'crow linkrow' }, h('span', { class: 'cname' }, `${small.length} payments under ${pounds(limit)}`), h('span', { class: 'muted small' }, `${pct(small.length, fq.payments)} of payments`), h('span', { class: 'r' }, pounds(total(small)))),
      h('p', { class: 'muted small', style: { margin: '4px 0 6px' } }, `${pct(total(small), all)} of your spending. Where they go most:`),
      smallShops.map((g) => h('a', { href: go({ small: limit, merchant: g.key }), class: 'crow linkrow' }, h('span', { class: 'cname' }, shopName(g.lines), h('span', { class: 'muted small' }, ` ×${g.count}`)), h('span'), h('span', { class: 'r' }, pounds(g.pence))))),
    h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, h('a', { href: '#manage', class: 'tap' }, 'Choose which buckets are essential')));

  // ---- money in, saved, invested and spent
  const flowRows = [['Spent from your pay', pay, '#F472B6', go({ savings: false })], ['Saved (after withdrawals)', fl.saved, '#B79CFF', go({ kind: 'saved' })], ['Invested (after withdrawals)', fl.invested, '#5BD6A0', go({ kind: 'invested' })], ['Paid from savings', all - pay, '#F7B955', go({ savings: true })]];
  const flowCard = h('section', { class: 'card', 'aria-labelledby': 'xi' },
    h('div', { class: 'ch' }, h('h2', { id: 'xi' }, 'Money in, saved, invested and spent'), h('a', { href: go({ kind: 'income' }), class: 'tap muted small' }, `${pounds(fl.income)} in`)),
    fl.income > 0 ? payFlow({ total: fl.income, flows: [...flowRows.slice(0, 3).filter((r) => r[1] > 0).map(([name, pence, c]) => ({ name, pence, colour: c })), ...(left > 0 ? [{ name: 'Not spent or put away', pence: left, colour: '#5F6B7A' }] : [])], label: 'Where your money in went' }) : null,
    h('div', { class: 'stats', style: { marginTop: '10px' } }, flowRows.map(([name, pence, c, href]) => h('div', null, h('a', { href, class: 'tap' }, h('span', { class: 'dot', style: { background: c, marginRight: '8px' } }), name), h('span', null, signed(pence))))),
    fl.incomeBy.length ? [h('h3', { class: 'small-h', style: { marginTop: '14px' } }, 'Money in by source'), fl.incomeBy.slice(0, 6).map((x) => h('a', { href: go({ kind: 'income' }), class: 'crow linkrow' }, h('span', { class: 'cname' }, x.key), h('span'), h('span', { class: 'r' }, pounds(x.pence))))] : null);

  const open = Object.keys(f).length || tx || q.get('all') === '1';
  return h('div', { class: 'page' },
    head('Spending', `${p.label}: ${pounds(all)} spent${all - pay ? `, incl. ${pounds(all - pay)} from savings` : ''}. Tap anything to see the payments behind it.`),
    periodBar(ctx, ROUTE, p, info),
    tiles,
    h('div', { class: 'grid-main' }, catCard, budgetCard),
    h('div', { class: 'grid-even' }, merchCard, changeCard),
    h('div', { class: 'grid-even' }, cycleCard, monthCard),
    h('div', { class: 'grid-even' }, daily, weekly),
    h('div', { class: 'grid-even' }, heat, freq),
    h('div', { class: 'grid-even' }, kinds, flowCard),
    open ? drillPanel(ctx, ROUTE, p, f, tx, data, rerender) : null);
}
