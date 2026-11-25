// Spending & Budgets: overview, breakdown, trends, behaviour, the budget manager and transaction tools.
import { h, option, fmtDay, plural, toast } from '../ui.js';
import { todayIso, addDays, r2, dayDiff } from '../money.js';
import { periodFor, cycleList, inPeriod } from '../paycycle.js';
import { cycleSummary } from '../insights.js';
import { dashboardSummary, overviewSeries, monthLabel, monthRange } from '../dashboard.js';
import { drawSpendChart, drawMoneyChart, loadChartJs } from '../charts.js';
import { applyFilters, breakdown, catOf, shopKey, spendKinds, essentialSplit, weeklySeries, rollingAverage, heatmap, byWeekday, monthlyTotals,
  comparisons, categoryChanges, spikes, habits, frequentShops, unusual, impulse, easeOff, monthOf, dailyTotals } from '../analytics.js';
import { budgetStatus, effectiveBudgets, recommendBudgets, safeSpend, goalForecast } from '../finance.js';
import { card, kpi, meter, note, tip, grid, subnav, table, field, numInput, textInput, selectInput, checkInput, plot, cfg, createRegistry, openDrill, gbp0, gbp2, uid, emptyState, insightCard } from '../kit.js';

const SUBS = [['overview', 'Overview'], ['breakdown', 'Breakdown'], ['trends', 'Trends'], ['behaviour', 'Behaviour'], ['budgets', 'Budgets'], ['history', 'History'], ['tools', 'Transaction tools']];
const RANGES = [['all', 'All time'], ['12m', 'Last 12 months'], ['90d', 'Last 90 days'], ['30d', 'Last 30 days'], ['cycle', 'Selected pay cycle'], ['month', 'Selected month'], ['custom', 'Custom dates']];
const TYPES = [['spending', 'Spending'], ['payback', 'Paid back to me'], ['income', 'Income'], ['invested', 'Invested'], ['internal', 'Moves between my accounts'], ['all', 'Everything']];

export function initSpending(ctx, root) {
  const reg = createRegistry();
  const f = { view: 'cycle', range: 'cycle', from: '', to: '', category: '', account: '', tag: '', type: 'spending', q: '' };
  const tools = { q: '', pick: '', setBucket: '', setTag: '', setKind: '', splitParts: [{ amount: 0, bucket: '' }, { amount: 0, bucket: '' }], cycle: '', cycleStart: '', month: '' };
  const route = () => (ctx.route && ctx.route.sub) || 'overview';
  const go = (sub) => { location.hash = `spending/${sub}`; };

  // Pay cycles that have transactions in them (newest first), and the calendar months that do.
  const cyclesWithData = (data, today) => {
    const dates = data.transactions.map((t) => t.date).sort();
    return cycleList(data.settings.paydates, dates[0] || today, today).filter((p) => data.transactions.some((t) => inPeriod(t.cycleDate || t.date, p)));
  };
  const selectedCycle = (data, today) => { const l = cyclesWithData(data, today); return l.find((p) => p.start === tools.cycleStart) || l[0] || periodFor(today, data.settings.paydates); };
  const monthsWithData = (data) => [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const selectedMonth = (data) => { const l = monthsWithData(data); return l.includes(tools.month) ? tools.month : l[0] || todayIso().slice(0, 7); };

  const range = (today) => {
    if (f.range === 'custom') return { from: f.from, to: f.to };
    if (f.range === 'cycle') { const p = selectedCycle(ctx.data, today); return { from: p.start, to: p.end }; }
    if (f.range === 'month') { const m = selectedMonth(ctx.data); return { from: `${m}-01`, to: `${m}-31` }; }
    const days = { '30d': 30, '90d': 90, '12m': 365 }[f.range];
    return days ? { from: addDays(today, -days), to: '' } : { from: '', to: '' };
  };
  const filters = (today) => {
    const r = range(today);
    return { from: r.from, to: r.to, type: f.type, categories: f.category ? [f.category] : [], accounts: f.account ? [f.account] : [], tag: f.tag, q: f.q };
  };

  // ---------------------------------------------------------------- shared filter bar
  function filterBar(data, list) {
    const cats = [...new Set(data.transactions.map(catOf))].sort();
    const accounts = [...new Set(data.transactions.map((t) => t.account).filter(Boolean))].sort();
    const tags = [...new Set(data.transactions.map((t) => t.tag).filter(Boolean))].sort();
    const set = (k) => (v) => { f[k] = v; render(); };
    return card(null,
      h('div', { class: 'filtergrid' },
        field('Dates', selectInput(RANGES, f.range, set('range'))),
        field('Type', selectInput(TYPES, f.type, set('type'))),
        field('Category', selectInput([['', 'All categories'], ...cats.map((c) => [c, c])], f.category, set('category'))),
        field('Account', selectInput([['', 'All accounts'], ...accounts.map((a) => [a, a])], f.account, set('account'))),
        tags.length ? field('Tag or event', selectInput([['', 'All tags'], ...tags.map((t) => [t, t])], f.tag, set('tag'))) : null,
        field('Shop contains', textInput(f.q, set('q'), { placeholder: 'e.g. Tesco' })),
        f.range === 'custom' ? field('From', h('input', { class: 'inp', type: 'date', value: f.from, onchange: (e) => set('from')(e.target.value) })) : null,
        f.range === 'custom' ? field('To', h('input', { class: 'inp', type: 'date', value: f.to, onchange: (e) => set('to')(e.target.value) })) : null),
      h('p', { class: 'muted' }, `${plural(list.length, 'transaction')} match · ${gbp0(list.reduce((a, t) => a + t.amount, 0))} in total. Click any chart to see the transactions behind it.`));
  }

  const drillGroup = (groups, i, sub) => { const g = groups[i]; if (g) openDrill(g.label, g.txs, sub); };

  // ---------------------------------------------------------------- Overview
  function overview(data, today) { return [periodCard(data, today)]; }

  // One pay cycle, on its own: what you spent from payday to the day before the next one.
  function periodCard(data, today) {
    const byMonth = f.view === 'month';
    if (byMonth ? !monthsWithData(data).length : !cyclesWithData(data, today).length) return card('Spending', emptyState('No transactions yet.'));
    let pick;
    if (byMonth) {
      const m = selectedMonth(data);
      const end = `${m}-${String(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;
      pick = { start: `${m}-01`, end, totalDays: +end.slice(8, 10), name: new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
    } else pick = selectedCycle(data, today);
    const upTo = pick.end < today ? pick.end : addDays(today, -1);
    const inCycle = data.transactions.filter((t) => (byMonth ? t.date >= pick.start && t.date <= pick.end : inPeriod(t.cycleDate || t.date, pick)));
    const sumOf = (l) => r2(l.reduce((a, t) => a + t.amount, 0));
    const spendTx = inCycle.filter((t) => t.kind === 'spending' && t.direction === 'out');
    const back = sumOf(inCycle.filter((t) => t.kind === 'payback' && t.direction === 'in'));
    const gross = sumOf(spendTx);
    const net = Math.max(0, r2(gross - back));
    const income = sumOf(inCycle.filter((t) => t.kind === 'income' && t.direction === 'in'));
    const invested = sumOf(inCycle.filter((t) => t.kind === 'invested' && t.direction === 'out'));
    const lastTx = inCycle.map((t) => t.date).sort().pop();
    const days = Math.max(1, dayDiff(pick.start, upTo) + 1);
    const label = byMonth ? pick.name : `${pick.name} cycle`;

    // Categories, with money to and from friends netted into one line (so it cannot look like your biggest spend).
    let cats = breakdown(spendTx, catOf);
    const fi = cats.findIndex((x) => x.key === 'Friends & family');
    if (fi >= 0 && back > 0) {
      cats[fi] = { ...cats[fi], label: 'Friends & family (net of paybacks)', total: Math.max(0, r2(cats[fi].total - back)) };
      cats = cats.sort((a, b) => b.total - a.total);
    }
    const buckets = byMonth
      ? breakdown(spendTx, (t) => t.category || 'No bucket').map((x) => ({ name: x.label, net: x.total, budget: null, left: null }))
      : cycleSummary(data, pick.start).buckets;
    const shops = breakdown(spendTx.filter((t) => catOf(t) !== 'Friends & family'), shopKey, (k, t) => t.desc).slice(0, 8);
    const biggest = spendTx.slice().sort((a, b) => b.amount - a.amount).slice(0, 8);

    return card(`${label}: what you spent`,
      h('p', { class: 'muted' }, `${byMonth ? '' : 'Payday '}${fmtDay(pick.start)} to ${fmtDay(pick.end)}, ${plural(pick.totalDays, 'day')}. Your data covers up to ${lastTx ? fmtDay(lastTx) : 'nothing yet'}.`),
      grid(4,
        kpi('Spent', gbp0(net), `after ${gbp0(back)} paid back to you`, ''),
        kpi('Per day', gbp0(net / days), `over ${plural(days, 'day')}`, 'amber'),
        kpi('Money in', gbp0(income), 'salary and other income', 'green'),
        kpi('Invested', gbp0(invested), 'put away', 'blue')),
      h('div', { class: 'charts' },
        card('Where it went', plot(reg, `${label} by category`, () => cfg.hbar(cats.slice(0, 10).map((x) => x.label), cats.slice(0, 10).map((x) => x.total), (i) => cats[i] && openDrill(cats[i].label, cats[i].txs), '#7c8cff'), 340)),
        card(byMonth ? 'By budget bucket' : 'Against your budgets', byMonth
          ? [note('Budgets are set per pay cycle, so switch to pay cycle to compare against them.'), table([{ label: 'Bucket', align: 'left', get: (b) => b.name }, { label: 'Spent', get: (b) => gbp0(b.net) }], buckets)]
          : table([
            { label: 'Bucket', align: 'left', get: (b) => b.name }, { label: 'Spent', get: (b) => gbp0(b.net) },
            { label: 'Budget', get: (b) => gbp0(b.budget) }, { label: 'Left', get: (b) => (b.left < 0 ? `-${gbp0(-b.left)}` : gbp0(b.left)) }], buckets))),
      h('div', { class: 'charts' },
        card('Top shops', shops.length ? plot(reg, `${label} top shops`, () => cfg.hbar(shops.map((x) => x.label), shops.map((x) => x.total), (i) => shops[i] && openDrill(shops[i].label, shops[i].txs), '#ffc857'), 300) : h('p', { class: 'empty' }, 'No shops yet.')),
        card('Biggest single payments', table([
          { label: 'Date', align: 'left', get: (t) => fmtDay(t.date) }, { label: 'What', align: 'left', get: (t) => t.desc }, { label: 'Amount', get: (t) => gbp2(t.amount) }], biggest))));
  }
  // ---------------------------------------------------------------- Breakdown
  function breakdownView(data, today) {
    const list = applyFilters(data, filters(today));
    if (!list.length) return [card('Breakdown', emptyState('Nothing matches these filters.'))];
    const out = [];
    // Money sent to friends and family mostly comes back, so it is shown net of what they paid back. Otherwise it
    // would look like your biggest spend.
    const paidBack = f.type === 'spending' ? r2(applyFilters(data, { ...filters(today), type: 'payback', categories: [], tag: '', q: '' }).reduce((a, t) => a + t.amount, 0)) : 0;
    let cats = breakdown(list, catOf);
    const fi = cats.findIndex((c) => c.key === 'Friends & family');
    if (fi >= 0 && paidBack > 0) {
      const c = cats[fi];
      cats[fi] = { ...c, label: 'Friends & family (net of paybacks)', total: Math.max(0, r2(c.total - paidBack)) };
      cats = cats.sort((a, b) => b.total - a.total);
      const grand = cats.reduce((a, x) => a + x.total, 0) || 1;
      cats = cats.map((x) => ({ ...x, share: Math.round((x.total / grand) * 1000) / 10, avg: x.count ? r2(x.total / x.count) : 0 }));
    }
    const months = Math.max(1, new Set(list.map((t) => monthOf(t.date))).size);
    const top = cats.slice(0, 10);
    out.push(h('div', { class: 'charts' },
      card('Spending by category', plot(reg, 'Spending by category', () => cfg.doughnut(top.map((c) => c.label), top.map((c) => c.total), (i) => drillGroup(top, i)), 320)),
      card('Categories ranked', plot(reg, 'Categories ranked by spending', () => cfg.hbar(top.map((c) => c.label), top.map((c) => c.total), (i) => drillGroup(top, i)), 320))));
    out.push(card('Category detail', table([
      { label: 'Category', align: 'left', get: (r) => r.label }, { label: 'Total', get: (r) => gbp0(r.total) }, { label: '/month', get: (r) => gbp0(r.total / months) },
      { label: 'Payments', get: (r) => r.count }, { label: 'Average', get: (r) => gbp2(r.avg) }, { label: 'Share', get: (r) => `${r.share}%` }], cats, (r) => openDrill(r.label, r.txs))));
    const shops = breakdown(list.filter((t) => catOf(t) !== 'Friends & family'), shopKey, (k, t) => t.desc).slice(0, 12); // shops, not people
    const accts = breakdown(list, (t) => t.account || 'Unknown');
    const buckets = breakdown(list, (t) => t.category || 'No bucket');
    out.push(h('div', { class: 'charts' },
      card('Top shops', plot(reg, 'Spending by shop', () => cfg.hbar(shops.map((c) => c.label), shops.map((c) => c.total), (i) => drillGroup(shops, i), '#ffc857'), 380)),
      card('By payment account', plot(reg, 'Spending by account', () => cfg.doughnut(accts.map((c) => c.label), accts.map((c) => c.total), (i) => drillGroup(accts, i)), 320))));
    const tagged = breakdown(list.filter((t) => t.tag), (t) => t.tag);
    const kinds = spendKinds(data, list);
    const kindRows = [['Recurring', kinds.recurring], ['Everyday / variable', kinds.variable], ['One-off (£50+)', kinds['one-off']]].map(([label, txs]) => ({ label, txs, total: r2(txs.reduce((a, t) => a + t.amount, 0)) }));
    const es = essentialSplit(data, list);
    const esRows = [['Essential', es.essential], ['Discretionary', es.discretionary]].map(([label, txs]) => ({ label, txs, total: r2(txs.reduce((a, t) => a + t.amount, 0)) }));
    out.push(h('div', { class: 'charts' },
      card('Fixed vs variable vs one-off', note('Recurring means a shop you pay in at least three different months for a similar amount.'), plot(reg, 'Recurring, variable and one-off', () => cfg.doughnut(kindRows.map((r) => r.label), kindRows.map((r) => r.total), (i) => drillGroup(kindRows, i), ['#7c8cff', '#2ee6b6', '#ffc857']), 280)),
      card('Essential vs discretionary', note(`Essential means the budgets you marked essential: ${(data.settings.essentialBuckets || []).join(', ') || 'none'}. Change this under Budgets.`), plot(reg, 'Essential and discretionary spending', () => cfg.doughnut(esRows.map((r) => r.label), esRows.map((r) => r.total), (i) => drillGroup(esRows, i), ['#7c8cff', '#ff9f5a']), 280))));
    out.push(h('div', { class: 'charts' },
      card('By budget bucket', plot(reg, 'Spending by budget bucket', () => cfg.doughnut(buckets.map((c) => c.label), buckets.map((c) => c.total), (i) => drillGroup(buckets, i)), 280)),
      card('By tag or event', tagged.length ? plot(reg, 'Spending by tag', () => cfg.hbar(tagged.map((c) => c.label), tagged.map((c) => c.total), (i) => drillGroup(tagged, i), '#b794ff'), 280) : h('p', { class: 'empty' }, 'No tags yet. Add a tag such as "Cousins visit" to a transaction and it appears here.'))));
    return out;
  }

  // ---------------------------------------------------------------- Trends
  function trends(data, today) {
    const list = applyFilters(data, { ...filters(today), from: '', to: '' }); // trends always show recent history
    if (!list.length) return [card('Trends', emptyState('Nothing matches these filters.'))];
    const out = [];
    const last = list.map((t) => t.date).sort().pop();
    const months = monthRange(addDays(last, -365).slice(0, 7), last.slice(0, 7));
    const mt = monthlyTotals(list, months);
    const avg = r2(mt.reduce((a, m) => a + m.total, 0) / Math.max(1, mt.length));
    const monthly = plot(reg, 'Monthly spending over 12 months', () => cfg.bars(mt.map((m) => m.label), [{ label: 'Spent', data: mt.map((m) => m.total), color: '#7c8cff' }, { label: 'Average', data: mt.map(() => avg), color: '#ffc857', type: 'line' }], { pick: (i) => openDrill(`Spending in ${mt[i].label}`, list.filter((t) => monthOf(t.date) === mt[i].month)) }), 280);
    const wk = weeklySeries(list, today, 12);
    const weekly = plot(reg, 'Weekly spending over 12 weeks', () => cfg.bars(wk.map((w) => fmtDay(w.start).slice(0, 6)), [{ label: 'Spent', data: wk.map((w) => w.total), color: '#2ee6b6' }], { pick: (i) => openDrill(`Week of ${fmtDay(wk[i].start)}`, list.filter((t) => t.date >= wk[i].start && t.date <= addDays(wk[i].start, 6))) }), 260);
    out.push(h('div', { class: 'charts' }, card('Monthly spending', monthly), card('Weekly comparison', weekly)));

    const daily = dailyTotals(list);
    const days = Array.from({ length: 60 }, (_, i) => addDays(today, i - 59));
    const r30 = rollingAverage(list, today, 30, 180);
    const r90 = rollingAverage(list, today, 90, 180);
    out.push(h('div', { class: 'charts' },
      card('Daily spending (last 60 days)', plot(reg, 'Daily spending', () => cfg.bars(days.map((d) => d.slice(5)), [{ label: 'Spent', data: days.map((d) => daily.get(d) || 0), color: '#ff9f5a' }], { pick: (i) => openDrill(`Spending on ${fmtDay(days[i])}`, list.filter((t) => t.date === days[i])) }), 260)),
      card('Rolling 30 and 90 day averages', note('Average spent per day, looking back 30 and 90 days.'), plot(reg, 'Rolling averages', () => cfg.lines(r30.map((p) => p.date.slice(5)), [{ label: '30-day', data: r30.map((p) => p.value), color: '#7c8cff' }, { label: '90-day', data: r90.map((p) => p.value), color: '#ffc857' }]), 240))));

    // Heatmap
    const hm = heatmap(list, today, 26);
    const wd = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
    out.push(card('Spending heatmap (last 26 weeks)', note('Darker days are higher spending. Click a day to see what you spent.'),
      h('div', { class: 'heat', role: 'group', 'aria-label': 'Daily spending heatmap' },
        h('div', { class: 'heat-days' }, wd.map((d) => h('span', null, d))),
        hm.cols.map((col) => h('div', { class: 'heat-col' }, col.days.map((d) => d.value === null ? h('span', { class: 'cell none' }) :
          h('span', { class: 'cell', title: `${fmtDay(d.date)}: ${gbp0(d.value)}`, style: d.value > 0 ? `background:rgba(46,230,182,${(0.18 + 0.82 * (d.value / (hm.max || 1))).toFixed(2)})` : '', onclick: () => openDrill(`Spending on ${fmtDay(d.date)}`, list.filter((t) => t.date === d.date)) }))))),
      h('div', { class: 'edgrid' }, field('Or pick a day to see what you spent', h('input', { class: 'inp', type: 'date', max: today, onchange: (e) => { if (e.target.value) openDrill(`Spending on ${fmtDay(e.target.value)}`, list.filter((t) => t.date === e.target.value)); } })))));
    const wdays = byWeekday(list);
    out.push(card('Spending by day of the week', plot(reg, 'Spending by weekday', () => cfg.bars(wdays.map((d) => d.name), [{ label: 'Spent', data: wdays.map((d) => d.total), color: '#b794ff' }]), 220)));

    // Comparisons, changes, highs and lows, spikes
    const cmp = comparisons(list, today);
    out.push(grid(3,
      kpi('This month so far', gbp0(cmp.now), cmp.vsPrevPct === null ? 'no earlier month to compare' : `${cmp.vsPrevPct >= 0 ? '+' : ''}${cmp.vsPrevPct}% vs the same days last month`, ''),
      kpi('Same days last month', gbp0(cmp.prev), `${monthLabel(cmp.lastMonth)} in full: ${gbp0(cmp.prevWhole)}`, ''),
      kpi('Same days last year', gbp0(cmp.year), cmp.vsYearPct === null ? 'no data from a year ago' : `${cmp.vsYearPct >= 0 ? '+' : ''}${cmp.vsYearPct}% year on year`, '')));
    const fullMonths = mt.slice(0, -1);
    if (fullMonths.length >= 2) {
      const a = fullMonths[fullMonths.length - 1].month;
      const b = fullMonths[fullMonths.length - 2].month;
      const ch = categoryChanges(list, a, b).filter((c) => Math.abs(c.change) >= 5).slice(0, 8);
      const sorted = fullMonths.slice().sort((x, y) => y.total - x.total);
      out.push(h('div', { class: 'charts' },
        card(`What changed: ${monthLabel(a)} vs ${monthLabel(b)}`, ch.length ? table([{ label: 'Category', align: 'left', get: (r) => r.name }, { label: monthLabel(a), get: (r) => gbp0(r.now) }, { label: monthLabel(b), get: (r) => gbp0(r.before) }, { label: 'Change', get: (r) => h('span', { class: r.change > 0 ? 'bad-t' : 'good-t' }, `${r.change > 0 ? '+' : '-'}${gbp0(Math.abs(r.change))}`) }], ch) : h('p', { class: 'empty' }, 'Nothing moved by more than £5.')),
        card('Highest and lowest months', h('dl', { class: 'facts' },
          h('div', null, h('dt', null, 'Highest'), h('dd', null, `${sorted[0].label}: ${gbp0(sorted[0].total)}`)),
          h('div', null, h('dt', null, 'Lowest'), h('dd', null, `${sorted[sorted.length - 1].label}: ${gbp0(sorted[sorted.length - 1].total)}`)),
          h('div', null, h('dt', null, 'Average'), h('dd', null, gbp0(avg)))))));
    }
    const sp = spikes(list, today).slice(0, 6);
    out.push(card('Unusual spending spikes', sp.length ? table([{ label: 'Day', align: 'left', get: (r) => fmtDay(r.date) }, { label: 'Spent', get: (r) => gbp0(r.total) }, { label: 'A usual day', get: (r) => gbp0(r.usual) }], sp, (r) => openDrill(`Spending on ${fmtDay(r.date)}`, list.filter((t) => t.date === r.date))) : h('p', { class: 'empty' }, 'No days stand out as unusually high.')));
    return out;
  }

  // ---------------------------------------------------------------- Behaviour
  function behaviour(data, today) {
    const list = applyFilters(data, { ...filters(today), type: 'spending' });
    if (!list.length) return [card('Behaviour', emptyState('Nothing matches these filters.'))];
    const out = [];
    const months = monthRange(list.map((t) => monthOf(t.date)).sort()[0], list.map((t) => monthOf(t.date)).sort().pop());
    const hab = habits(list, months);
    out.push(card('Habits that add up', note('Each is shown per month and per year. Click one to see every purchase.'),
      h('div', { class: 'grid g3' }, hab.map((x) => h('button', { class: 'stat habit', type: 'button', onclick: () => openDrill(x.name, x.txs) },
        h('div', { class: 'stat-l' }, x.name), h('div', { class: 'stat-v' }, gbp0(x.perMonth)), h('div', { class: 'stat-s' }, `a month · ${gbp0(x.perYear)} a year · ${x.count} purchases · avg ${gbp2(x.avg)}`))))));
    const goal = data.goals.slice().sort((a, b) => (a.priority || 3) - (b.priority || 3))[0];
    const eo = easeOff(hab, goal, today, goalForecast);
    out.push(card('Where you could ease off', note('If you trimmed each of these by a quarter:'),
      eo.length ? h('div', { class: 'insights' }, eo.map((e) => insightCard({ level: 'info', title: `${e.name}: ${gbp0(e.cut)} a month back in your pocket`, body: e.effect }))) : h('p', { class: 'empty' }, 'No habit is big enough to be worth flagging.')));
    const tx = list.length;
    const avg = r2(list.reduce((a, t) => a + t.amount, 0) / tx);
    const cats = breakdown(list, catOf);
    out.push(grid(3, kpi('Transactions', String(tx), `over ${plural(months.length, 'month')}`, ''), kpi('Average transaction', gbp2(avg), 'size of a typical purchase', 'amber'), kpi('Under £5', String(list.filter((t) => t.amount < 5).length), 'small purchases', 'purple')));
    const fs = frequentShops(list, 10);
    out.push(h('div', { class: 'charts' },
      card('Most visited shops', table([{ label: 'Shop', align: 'left', get: (r) => r.label }, { label: 'Visits', get: (r) => r.count }, { label: 'Total', get: (r) => gbp0(r.total) }, { label: 'Average', get: (r) => gbp2(r.avg) }], fs, (r) => openDrill(r.label, r.txs))),
      card('Payments per category', table([{ label: 'Category', align: 'left', get: (r) => r.label }, { label: 'Payments', get: (r) => r.count }, { label: 'Average', get: (r) => gbp2(r.avg) }], cats.slice().sort((a, b) => b.count - a.count).slice(0, 10), (r) => openDrill(r.label, r.txs)))));
    const un = unusual(list);
    const im = impulse(list);
    out.push(h('div', { class: 'charts' },
      card('Possibly unnecessary or unusual', note('Big for their category, or unusually large one-offs. A prompt to look, not a verdict.'), un.length ? table([{ label: 'When', align: 'left', get: (r) => fmtDay(r.date) }, { label: 'What', align: 'left', get: (r) => r.desc }, { label: 'Paid', get: (r) => gbp0(r.amount) }], un) : h('p', { class: 'empty' }, 'Nothing stands out.')),
      card('Possible impulse buys', note('Shopping, entertainment, takeaways and clothes under £30.'), h('div', { class: 'big' }, gbp0(im.reduce((a, t) => a + t.amount, 0))), h('p', { class: 'muted' }, `${plural(im.length, 'purchase')}, about ${gbp0((im.reduce((a, t) => a + t.amount, 0) / months.length))} a month.`), h('button', { class: 'btn ghost', type: 'button', onclick: () => openDrill('Possible impulse buys', im) }, 'See them'))));
    // habit changes over time
    const last6 = months.slice(-7, -1);
    if (last6.length >= 3) {
      const groups = hab.filter((x) => x.id !== 'small').slice(0, 3);
      out.push(card('How your habits changed', plot(reg, 'Habit spending by month', () => cfg.lines(last6.map(monthLabel), groups.map((g) => ({ label: g.name, data: last6.map((m) => r2(g.txs.filter((t) => monthOf(t.date) === m).reduce((a, t) => a + t.amount, 0))) }))), 240)));
    }
    return out;
  }

  // ---------------------------------------------------------------- Budgets
  function budgets(data, today) {
    const st = data.settings;
    const out = [];
    const bs = budgetStatus(data, today);
    const ss = safeSpend(data, today);
    const set = (fn) => ctx.update((d) => fn(d.settings, d));
    const cycleStart = bs.period.start;

    if (!bs.buckets.length) out.push(card('Budgets', emptyState('No budgets are set. Add one below, or use the suggestions further down.')));
    else {
      out.push(grid(4,
        kpi('Budget', gbp0(bs.totals.budget), `${plural(bs.period.totalDays, 'day')} cycle`, ''),
        kpi('Spent', gbp0(bs.totals.net), `${Math.round((bs.totals.net / Math.max(1, bs.totals.budget)) * 100)}% used`, bs.totals.net > bs.totals.budget ? 'amber' : 'green'),
        kpi('Projected by payday', gbp0(bs.projectedTotal), bs.willExceedTotal ? 'likely to go over' : 'on course to stay within', bs.willExceedTotal ? 'amber' : 'green'),
        kpi('Safe to spend', gbp0(ss.total), `${gbp2(ss.perDay)} a day`, 'blue')));
      out.push(h('div', { class: 'charts' },
        card('Budget vs actual', plot(reg, 'Budget against actual spending', () => cfg.bars(bs.buckets.map((b) => b.name), [{ label: 'Budget', data: bs.buckets.map((b) => b.budget), color: '#7e8aa3' }, { label: 'Spent so far', data: bs.buckets.map((b) => b.net), color: '#7c8cff' }, { label: 'Projected', data: bs.buckets.map((b) => b.projected), color: '#ffc857' }]), 300)),
        card('Progress and pace', h('div', { class: 'brows' }, bs.buckets.map((b) => {
          const level = b.over > 0 ? 'over' : b.pct >= 90 ? 'near' : 'ok';
          return h('div', { class: 'brow' }, h('div', { class: 'brow-top' }, h('span', { class: 'bname' }, b.name), h('span', { class: `bsum ${level}` }, `${b.pct}% used`)), meter(b.pct, level, b.name),
            h('p', { class: 'bnote' }, `${gbp0(b.net)} of ${gbp0(b.budget)} · ${b.over > 0 ? `${gbp0(b.over)} over` : `${gbp0(b.left)} left`} · expected by now ${gbp0(b.expected)} (${b.pace}) · projected ${gbp0(b.projected)}${b.willExceed ? ' – may exceed' : ''}`));
        })))));
      // Safe-to-spend calculator
      out.push(card('Safe-to-spend calculator', h('dl', { class: 'facts' }, ss.parts.map((p) => h('div', null, h('dt', null, p.label), h('dd', null, p.amount < 0 ? `-${gbp0(-p.amount)}` : gbp0(p.amount)))), h('div', null, h('dt', null, h('b', null, 'Safe to spend')), h('dd', null, h('b', null, gbp0(ss.total))))),
        field('Money to keep in reserve (£)', numInput(st.reserved, (v) => set((s) => { s.reserved = Math.max(0, v); }))),
        note('Left in budgets, minus bills not in your data yet, minus credit-card payments due, minus the reserve you choose.')));
    }

    // Edit budgets & categories
    const cats = st.categories;
    out.push(card('Budgets and categories',
      note('Set a spending limit per category for each pay cycle. Categories are the buckets every transaction belongs to.'),
      h('div', { class: 'editor' }, cats.map((c, i) => h('div', { class: 'edrow' }, h('div', { class: 'edgrid' },
        field('Category', textInput(c.name, (v) => set((s, d) => { const old = s.categories[i].name; if (!v.trim() || v === old) return; s.categories[i].name = v.trim(); if (s.budgets[old] !== undefined) { s.budgets[v.trim()] = s.budgets[old]; delete s.budgets[old]; } d.transactions.forEach((t) => { if (t.category === old) t.category = v.trim(); }); }))),
        field('Emoji', textInput(c.emoji || '', (v) => set((s) => { s.categories[i].emoji = v; }))),
        field('Budget (£ per cycle)', numInput(st.budgets[c.name] ?? '', (v) => set((s) => { if (v > 0) s.budgets[c.name] = v; else delete s.budgets[c.name]; }))),
        checkInput('Counts as essential', (st.essentialBuckets || []).includes(c.name), (on) => set((s) => { const l = new Set(s.essentialBuckets || []); on ? l.add(c.name) : l.delete(c.name); s.essentialBuckets = [...l]; })))))),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => set((s) => { s.categories.push({ name: `New category ${s.categories.length + 1}`, emoji: '', color: '#7c8cff' }); }) }, 'Add a category')),
      h('div', { class: 'optrow' },
        checkInput('Roll unspent budget over into the next pay cycle', st.rollover, (v) => set((s) => { s.rollover = v; })),
        checkInput('Scale budgets to the length of the pay cycle', st.scaleBudgets, (v) => set((s) => { s.scaleBudgets = v; })))));

    // Subcategories
    const inside = cats.filter((c) => st.budgets[c.name]).map((c) => ({ c, rows: breakdown(data.transactions.filter((t) => t.kind === 'spending' && t.direction === 'out' && t.category === c.name && t.date >= addDays(today, -90)), catOf).slice(0, 5) }));
    if (inside.length) out.push(card('What is inside each budget (last 90 days)', h('div', { class: 'grid g3' }, inside.map(({ c, rows }) => h('div', { class: 'subcat' }, h('b', null, c.name), rows.length ? h('ul', { class: 'plain' }, rows.map((r) => h('li', null, `${r.label}: ${gbp0(r.total)}`))) : h('p', { class: 'muted' }, 'No spending'))))));

    // Moves between budgets
    const names = Object.keys(st.budgets);
    if (names.length >= 2) {
      const mv = { from: names[0], to: names[1], amount: 10 };
      const adj = (st.budgetAdjust || {})[cycleStart] || {};
      const form = h('div', { class: 'edgrid' },
        field('Move from', selectInput(names.map((n) => [n, n]), mv.from, (v) => { mv.from = v; })),
        field('To', selectInput(names.map((n) => [n, n]), mv.to, (v) => { mv.to = v; })),
        field('Amount (£)', numInput(mv.amount, (v) => { mv.amount = v; })));
      out.push(card('Move money between budgets', note('For this pay cycle only.'), form,
        h('button', { class: 'btn', type: 'button', onclick: () => { if (mv.from === mv.to || !(mv.amount > 0)) { toast('Pick two different budgets and an amount.', 'bad'); return; } set((s) => { const a = (s.budgetAdjust[cycleStart] = s.budgetAdjust[cycleStart] || {}); a[mv.from] = r2((a[mv.from] || 0) - mv.amount); a[mv.to] = r2((a[mv.to] || 0) + mv.amount); }); toast(`Moved £${mv.amount} from ${mv.from} to ${mv.to}.`, 'ok'); } }, 'Move it'),
        Object.keys(adj).length ? h('p', { class: 'muted' }, `Moves this cycle: ${Object.entries(adj).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${gbp0(v)}`).join(', ')}. `, h('button', { class: 'link-btn', type: 'button', onclick: () => set((s) => { delete s.budgetAdjust[cycleStart]; }) }, 'Undo all')) : null));
    }

    // Recommendations and templates
    const rec = recommendBudgets(data, today, 6);
    const recRows = Object.entries(rec);
    if (recRows.length) out.push(card('Suggested budgets from your history', note('The average net spend per category over your last six pay cycles, rounded up a little.'),
      table([{ label: 'Category', align: 'left', get: (r) => r[0] }, { label: 'Now', get: (r) => st.budgets[r[0]] ? gbp0(st.budgets[r[0]]) : '—' }, { label: 'Suggested', get: (r) => gbp0(r[1]) }, { label: '', get: (r) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => set((s) => { s.budgets[r[0]] = r[1]; }) }, 'Use') }], recRows),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => set((s) => { Object.assign(s.budgets, rec); }) }, 'Use all suggestions')));
    const tplName = { v: '' };
    out.push(card('Budget templates', note('Save a set of budgets for a type of month (a tight month, a holiday month) and switch between them.'),
      (st.budgetTemplates || []).length ? h('div', { class: 'editor' }, st.budgetTemplates.map((t, i) => h('div', { class: 'edrow' }, h('b', { class: 'edtitle' }, t.name), h('p', { class: 'muted' }, Object.entries(t.budgets).map(([k, v]) => `${k} ${gbp0(v)}`).join(' · ')),
        h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => set((s) => { s.budgets = { ...t.budgets }; }) }, 'Apply'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => set((s) => { s.budgetTemplates.splice(i, 1); }) }, 'Remove'))))) : h('p', { class: 'empty' }, 'No templates yet.'),
      h('div', { class: 'edgrid' }, field('Save current budgets as', textInput('', (v) => { tplName.v = v; }, { placeholder: 'e.g. Tight month' }))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (!tplName.v.trim()) { toast('Give the template a name first.', 'bad'); return; } set((s) => { s.budgetTemplates.push({ name: tplName.v.trim(), budgets: { ...s.budgets } }); }); } }, 'Save template')));
    return out;
  }

  // ---------------------------------------------------------------- Transaction tools
  function toolsView(data, today) {
    const out = [];
    const audit = (d, id, what) => { d.audit.push({ ts: new Date().toISOString(), id, what }); if (d.audit.length > 2000) d.audit.splice(0, d.audit.length - 2000); };
    const q = tools.q.trim().toLowerCase();
    const matches = q ? data.transactions.filter((t) => `${t.desc} ${t.note || ''}`.toLowerCase().includes(q)) : [];
    out.push(card('Find transactions', h('div', { class: 'edgrid' }, field('Search (shop or note)', textInput(tools.q, (v) => { tools.q = v; tools.pick = ''; render(); }, { placeholder: 'e.g. Playtomic' }))),
      q ? h('p', { class: 'muted' }, `${plural(matches.length, 'transaction')} found.`) : note('Search first. Bulk edit, splitting and cycle assignment all work on what you find.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = 'transactions'; } }, 'Open the full list'))));
    if (q && matches.length) {
      out.push(card('Bulk edit', note('Changes every transaction found above. Each change is recorded in the audit trail.'),
        h('div', { class: 'edgrid' },
          field('Set bucket', selectInput([['', 'Leave as is'], ...data.settings.categories.map((c) => [c.name, c.name])], tools.setBucket, (v) => { tools.setBucket = v; })),
          field('Set tag or event', textInput(tools.setTag, (v) => { tools.setTag = v; }, { placeholder: 'e.g. Cousins visit' })),
          field('Set type', selectInput([['', 'Leave as is'], ['spending', 'Spending'], ['payback', 'Paid back to me'], ['internal', 'Move between my accounts'], ['income', 'Income'], ['invested', 'Invested']], tools.setKind, (v) => { tools.setKind = v; }))),
        h('button', { class: 'btn', type: 'button', onclick: () => {
          if (!tools.setBucket && !tools.setTag && !tools.setKind) { toast('Choose something to change first.', 'bad'); return; }
          const ids = new Set(matches.map((t) => t.id));
          ctx.update((d) => { for (const t of d.transactions) if (ids.has(t.id)) { if (tools.setBucket) t.category = tools.setBucket; if (tools.setTag) t.tag = tools.setTag; if (tools.setKind) { t.kind = tools.setKind; } } audit(d, 'bulk', `Bulk edit of ${ids.size} transactions matching "${tools.q}"`); });
          toast(`Updated ${ids.size} transactions.`, 'ok');
        } }, `Apply to ${plural(matches.length, 'transaction')}`)));
      const opts = matches.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
      const chosen = data.transactions.find((t) => t.id === tools.pick);
      out.push(card('One transaction: split it, or assign it to a budget cycle',
        field('Pick one', selectInput([['', 'Choose…'], ...opts.map((t) => [t.id, `${t.date} · ${t.desc} · ${gbp2(t.amount)}`])], tools.pick, (v) => { tools.pick = v; tools.splitParts = [{ amount: 0, bucket: '' }, { amount: 0, bucket: '' }]; render(); })),
        chosen ? h('div', null,
          h('h3', { class: 'h3' }, 'Assign to a budget cycle'), note(`Bank date stays ${fmtDay(chosen.date)}${chosen.cycleDate ? `; counted in the cycle containing ${fmtDay(chosen.cycleDate)}` : ''}.`),
          h('div', { class: 'edgrid' }, field('Count it in the cycle that contains', h('input', { class: 'inp', type: 'date', value: chosen.cycleDate || '', onchange: (e) => { tools.cycle = e.target.value; } }))),
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { ctx.update((d) => { const t = d.transactions.find((x) => x.id === chosen.id); if (tools.cycle) t.cycleDate = tools.cycle; audit(d, chosen.id, `Assigned to the budget cycle of ${tools.cycle || 'its own date'}`); }); toast('Saved. The original payment date is kept.', 'ok'); } }, 'Save'),
            chosen.cycleDate ? h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.update((d) => { const t = d.transactions.find((x) => x.id === chosen.id); delete t.cycleDate; audit(d, chosen.id, 'Removed the budget-cycle assignment'); }) }, 'Use its own date') : null),
          h('h3', { class: 'h3' }, `Split ${gbp2(chosen.amount)}`), note('Divide it between buckets. The parts must add up to the original amount.'),
          h('div', { class: 'editor' }, tools.splitParts.map((p, i) => h('div', { class: 'edgrid' },
            field(`Part ${i + 1} amount (£)`, numInput(p.amount, (v) => { p.amount = v; })),
            field('Bucket', selectInput([['', chosen.category || 'Same bucket'], ...data.settings.categories.map((c) => [c.name, c.name])], p.bucket, (v) => { p.bucket = v; }))))),
          h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { tools.splitParts.push({ amount: 0, bucket: '' }); render(); } }, 'Add a part'),
            h('button', { class: 'btn', type: 'button', onclick: () => {
              const total = r2(tools.splitParts.reduce((a, p) => a + (Number(p.amount) || 0), 0));
              if (total !== r2(chosen.amount)) { toast(`The parts add up to £${total}, not £${chosen.amount}.`, 'bad'); return; }
              ctx.update((d) => { const i = d.transactions.findIndex((x) => x.id === chosen.id); const parent = d.transactions[i]; const parts = tools.splitParts.filter((p) => p.amount > 0).map((p, k) => ({ ...parent, id: uid('tx'), amount: r2(p.amount), category: p.bucket || parent.category, splitOf: parent.id, note: `${parent.note ? `${parent.note} · ` : ''}split ${k + 1}` })); d.transactions.splice(i, 1, ...parts); audit(d, parent.id, `Split ${gbp2(parent.amount)} into ${parts.length} parts`); });
              tools.pick = ''; toast('Split done.', 'ok');
            } }, 'Split it'))) : null));
    }
    const log = data.audit.slice(-25).reverse();
    out.push(card('Audit trail', note('A record of edits made here. Imports and normal list edits are not logged.'), log.length ? table([{ label: 'When', align: 'left', get: (r) => fmtDay(r.ts.slice(0, 10)) }, { label: 'What', align: 'left', get: (r) => r.what }], log) : h('p', { class: 'empty' }, 'No edits recorded yet.')));
    return out;
  }

  // ---------------------------------------------------------------- History (kept from an earlier tracker, as headline totals)
  function historyView(data) {
    const hist = data.history.slice().sort((a, b) => a.start.localeCompare(b.start));
    if (!hist.length) return [card('History', emptyState('Keep the months from your previous finance tracker here, as simple totals: spent, invested and saved. Choose your old backup file and the headline numbers come across (no individual transactions).', 'Add my old history', '#settings/data'))];
    const moneyIn = (h) => {
      const real = data.transactions.filter((t) => t.kind === 'income' && t.direction === 'in' && t.date >= h.start && t.date <= h.end).reduce((a, t) => a + t.amount, 0);
      return real > 0 ? { v: r2(real), planned: false } : { v: h.plannedIncome || 0, planned: true };
    };
    const rows = hist.map((h) => ({ ...h, inc: moneyIn(h) }));
    const avg = (f) => r2(rows.reduce((a, r) => a + f(r), 0) / rows.length);
    const colours = Object.fromEntries(data.settings.categories.map((c) => [c.name, c.color]));
    const names = [...new Set(rows.flatMap((r) => Object.keys(r.spent)))];
    const label = (r) => `${fmtDay(r.start).slice(0, -5)}`;
    return [
      grid(4, kpi('Cycles kept', String(rows.length), `${fmtDay(rows[0].start)} to ${fmtDay(rows[rows.length - 1].end)}`, 'blue'), kpi('Average spent', gbp0(avg((r) => r.spentTotal)), 'per pay cycle', ''),
        kpi('Average invested', gbp0(avg((r) => r.invested)), 'per pay cycle', 'green'), kpi('Average saved', gbp0(avg((r) => r.saved)), 'into pots and buffer', 'purple')),
      card('What you spent, by budget', note('From your previous finance dashboard. Each pay cycle is shown as simple totals.'),
        plot(reg, 'Spending by budget in each earlier pay cycle', () => cfg.bars(rows.map(label), names.map((n) => ({ label: n, data: rows.map((r) => r.spent[n] || 0), color: colours[n] })), { stacked: true }), 300)),
      card('Cycle by cycle', table([
        { label: 'Pay cycle', align: 'left', get: (r) => `${fmtDay(r.start).slice(0, -5)} to ${fmtDay(r.end).slice(0, -5)}` },
        { label: 'Money in', get: (r) => `${gbp0(r.inc.v)}${r.inc.planned ? ' (planned)' : ''}` },
        { label: 'Spent', get: (r) => gbp0(r.spentTotal) }, { label: 'Invested', get: (r) => gbp0(r.invested) }, { label: 'Saved', get: (r) => gbp0(r.saved) }], rows.slice().reverse()),
      note('Money in comes from your bank data when it covers that cycle. Otherwise it is the income you had planned in the old dashboard, marked "planned". Money moved back out of your Cash ISA, and card repayments, are not counted as spending.')),
    ];
  }

  // ---------------------------------------------------------------- render
  function render() {
    reg.clear();
    root.replaceChildren();
    const data = ctx.data;
    const today = todayIso();
    const sub = SUBS.some((s) => s[0] === route()) ? route() : 'overview';
    root.append(subnav(SUBS, sub, go));
    if (['overview', 'breakdown', 'trends', 'behaviour'].includes(sub) && data.transactions.length) {
      const pickers = [];
      if (f.view === 'cycle') pickers.push(selectInput(cyclesWithData(data, today).map((p) => [p.start, `${p.name} cycle (${fmtDay(p.start)} to ${fmtDay(p.end)})`]), selectedCycle(data, today).start, (v) => { tools.cycleStart = v; render(); }));
      else pickers.push(selectInput(monthsWithData(data).map((m) => [m, new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })]), selectedMonth(data), (v) => { tools.month = v; render(); }));
      root.append(h('div', { class: 'viewbar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Group spending by' }, ...[['cycle', 'Pay cycle'], ['month', 'Month']].map(([id, lab]) => h('button', { type: 'button', 'aria-pressed': String(f.view === id), onclick: () => { f.view = id; f.range = id; render(); } }, lab))), ...pickers));
    }
    if (!data.transactions.length && sub !== 'budgets' && sub !== 'history') { root.append(card('Spending', emptyState('No transactions yet. Import your bank files or add one by hand.', 'Bring my data in', '#import'))); return; }
    if (['breakdown', 'trends', 'behaviour'].includes(sub)) root.append(filterBar(data, applyFilters(data, filters(today))));
    const view = { overview, breakdown: breakdownView, trends, behaviour, budgets, history: historyView, tools: toolsView }[sub];
    try { for (const el of view(data, today)) root.append(el); } catch (err) { root.append(card('Something went wrong drawing this page', note(err.message))); }
  }

  return { render };
}
