// Planning & Forecasting: payday plan and salary flow, cash-flow forecast, calendar, recurring payments,
// what-if scenarios, and the insights / health score / monthly review.
import { h, fmtDay, plural, toast } from '../ui.js';
import { todayIso, r2, addDays, addMonths, dayDiff } from '../money.js';
import { periodFor, inPeriod } from '../paycycle.js';
import { dashboardSummary, monthLabel } from '../dashboard.js';
import { PLAN_TYPES, planSummary, suggestPlan, cashflow, calendarEvents, monthBounds, annualCost, scenario, healthScore, goalForecast } from '../finance.js';
import { detectRecurring } from '../analytics.js';
import { insights, monthlyReview } from '../advice.js';
import { card, kpi, meter, note, tip, grid, subnav, table, field, numInput, textInput, selectInput, listEditor, plot, cfg, createRegistry, insightCard, gbp0, gbp2, uid, emptyState } from '../kit.js';

const SUBS = [['payday', 'Payday plan'], ['cashflow', 'Cash flow'], ['calendar', 'Calendar'], ['recurring', 'Recurring'], ['whatif', 'What-if'], ['insights', 'Insights & review']];
const SANKEY = { spending: '#7c8cff', bills: '#ffc857', savings: '#2ee6b6', investing: '#b794ff', debt: '#ff5c7a', other: '#7e8aa3', free: '#22e1d0' };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kid of kids) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};

// Salary flow: one band per kind of use, from the salary on the left to its destination on the right.
export function sankey(salary, links) {
  const W = 780;
  const total = Math.max(salary, links.reduce((a, l) => a + l.value, 0), 1);
  const H = 340;
  const gap = 8;
  const usable = H - gap * Math.max(0, links.length - 1);
  const k = usable / total;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H + 20}`, role: 'img', 'aria-label': 'How your salary is shared out', class: 'sankey' });
  const leftTop = (H - total * k) / 2;
  svg.append(sv('rect', { x: 18, y: leftTop, width: 14, height: total * k, rx: 3, fill: '#2ee6b6' }));
  svg.append(sv('text', { x: 38, y: leftTop - 6, class: 'snlabel' }, `Salary ${gbp0(salary)}`));
  let yl = leftTop;
  let yr = 0;
  const heights = links.map((l) => l.value * k);
  // Small amounts still get a slot tall enough for their label, so labels never crowd each other.
  const slots = heights.map((hgt) => Math.max(hgt, 22));
  const rightTotal = slots.reduce((a, b) => a + b, 0) + gap * Math.max(0, links.length - 1);
  yr = Math.max(0, (H - rightTotal) / 2);
  links.forEach((l, i) => {
    const hgt = Math.max(2, heights[i]);
    const top = yr + (slots[i] - hgt) / 2; // the band meets the middle of its slot
    const x1 = 32; const x2 = 520; const xm = (x1 + x2) / 2;
    const colour = SANKEY[l.type] || '#7e8aa3';
    svg.append(sv('path', { d: `M${x1},${yl} C${xm},${yl} ${xm},${top} ${x2},${top} L${x2},${top + hgt} C${xm},${top + hgt} ${xm},${yl + hgt} ${x1},${yl + hgt} Z`, fill: colour, 'fill-opacity': '0.42' }));
    svg.append(sv('rect', { x: x2, y: top, width: 14, height: hgt, rx: 3, fill: colour }));
    svg.append(sv('text', { x: x2 + 22, y: yr + slots[i] / 2 + 4, class: 'snlabel' }, `${l.label} ${gbp0(l.value)}`));
    yl += heights[i]; yr += slots[i] + gap;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${Math.max(H, rightTotal, leftTop + total * k) + 30}`); // tall enough for every label
  return svg;
}

export function initPlanning(ctx, root) {
  const reg = createRegistry();
  const route = () => (ctx.route && ctx.route.sub) || 'payday';
  const go = (s) => { location.hash = `planning/${s}`; };
  const set = (fn) => ctx.update((d) => fn(d.settings, d));
  const state = { month: todayIso().slice(0, 7), day: '', scn: { spend: 0, save: 0, invest: 0, income: 0, newBill: 0, oneOff: 0, oneOffMonth: 1, rate: 5 }, tpl: '' };

  // ---------------------------------------------------------------- Payday plan
  function payday(data, today) {
    const out = [];
    const st = data.settings;
    const plan = planSummary(data);
    const p = periodFor(today, st.paydates);
    const until = dayDiff(today, p.next);
    out.push(grid(4,
      kpi('Next payday', fmtDay(p.next), until <= 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until} days`, 'green'),
      kpi('Salary', gbp0(plan.salary), 'per pay cycle', 'blue'),
      kpi('Allocated', gbp0(plan.allocated), `${plan.salary ? Math.round((plan.allocated / plan.salary) * 100) : 0}% of salary`, ''),
      kpi(plan.over ? 'Over-allocated' : 'Not allocated yet', gbp0(Math.abs(plan.unallocated)), plan.over ? 'more than your salary' : 'free to assign', plan.over ? 'amber' : 'purple')));
    if (plan.over) out.push(tip(`You have planned ${gbp0(-plan.unallocated)} more than your salary. Trim an allocation below.`));
    out.push(card('Your payday plan', note('Enter your salary and share it out. The salary-flow diagram updates as you change it.'),
      h('div', { class: 'edgrid' }, field('Salary each pay cycle (£)', numInput(st.plan.salary, (v) => set((s) => { s.plan.salary = Math.max(0, v); })))),
      listEditor({
        items: st.plan.allocations, empty: 'No allocations yet.', addLabel: 'Add an allocation',
        makeNew: () => ({ id: uid('plan'), name: 'New allocation', type: 'spending', amount: 0 }),
        onChange: (items) => set((s) => { s.plan.allocations = items; }),
        fields: [{ key: 'name', label: 'What for' }, { key: 'type', label: 'Type', type: 'select', options: PLAN_TYPES }, { key: 'amount', label: 'Amount (£)', type: 'number' }],
      }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const sp = suggestPlan(data, today); set((s) => { s.plan = sp; }); toast('Built from your budgets, bills, goals and investing. Adjust it to suit.', 'ok'); } }, 'Build a plan from what I already have'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => set((s) => { s.plan.allocations = []; }) }, 'Clear'))));
    out.push(card('Where your salary goes', plan.links.length ? h('div', { class: 'sankeybox' }, sankey(plan.salary, plan.links)) : h('p', { class: 'empty' }, 'Add a salary and some allocations to see the flow.')));

    // plans for different months
    const tpls = st.planTemplates || [];
    out.push(card('Plans for different months', note('Save this plan under a name (for example "Holiday month") and switch back to it any time.'),
      tpls.length ? h('div', { class: 'editor' }, tpls.map((t, i) => h('div', { class: 'edrow' }, h('b', { class: 'edtitle' }, t.name), h('p', { class: 'muted' }, `${gbp0(t.plan.salary)} salary · ${plural(t.plan.allocations.length, 'allocation')}`),
        h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => set((s) => { s.plan = JSON.parse(JSON.stringify(t.plan)); }) }, 'Use this plan'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => set((s) => { s.planTemplates.splice(i, 1); }) }, 'Remove'))))) : null,
      h('div', { class: 'edgrid' }, field('Save the current plan as', textInput('', (v) => { state.tpl = v; }, { placeholder: 'e.g. Holiday month' }))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (!state.tpl.trim()) { toast('Give it a name first.', 'bad'); return; } set((s) => { s.planTemplates = [...(s.planTemplates || []), { name: state.tpl.trim(), plan: JSON.parse(JSON.stringify(s.plan)) }]; }); } }, 'Save plan')));

    // compare previous pay cycles
    const rows = [];
    let cursor = today;
    for (let i = 0; i < 7; i++) {
      const per = periodFor(cursor, st.paydates);
      const tx = data.transactions.filter((t) => inPeriod(t.cycleDate || t.date, per));
      const sum = (f) => r2(tx.filter(f).reduce((a, t) => a + t.amount, 0));
      rows.push({ per, income: sum((t) => t.kind === 'income' && t.direction === 'in'), spent: Math.max(0, r2(sum((t) => t.kind === 'spending' && t.direction === 'out') - sum((t) => t.kind === 'payback' && t.direction === 'in'))), invested: sum((t) => t.kind === 'invested' && t.direction === 'out'), n: tx.length, current: i === 0 });
      cursor = addDays(per.start, -1);
    }
    const shown = rows.filter((r) => r.n > 0).reverse();
    if (shown.length) out.push(card('Compare pay cycles', table([{ label: 'Cycle', align: 'left', get: (r) => `${fmtDay(r.per.start).slice(0, -5)}${r.current ? ' (now)' : ''}` }, { label: 'In', get: (r) => gbp0(r.income) }, { label: 'Spent', get: (r) => gbp0(r.spent) }, { label: 'Invested', get: (r) => gbp0(r.invested) }, { label: 'Left over', get: (r) => gbp0(r.income - r.spent - r.invested) }], shown),
      plot(reg, 'Pay cycles compared', () => cfg.bars(shown.map((r) => fmtDay(r.per.start).slice(0, 6)), [{ label: 'In', data: shown.map((r) => r.income), color: '#2ee6b6' }, { label: 'Spent', data: shown.map((r) => r.spent), color: '#ff5c7a' }, { label: 'Invested', data: shown.map((r) => r.invested), color: '#4cc9ff' }]), 220)));
    return out;
  }

  // ---------------------------------------------------------------- Cash flow
  function cashFlow(data, today) {
    const cf = cashflow(data, today, 60);
    if (!cf.available) return [card('Cash-flow forecast', emptyState('Add your current-account balances and I can forecast the next 60 days: pay in, bills out, and everyday spending.', 'Add accounts', '#settings/accounts'))];
    const out = [];
    out.push(grid(4,
      kpi('Balance today', gbp0(cf.start), 'your current accounts', 'blue'),
      kpi('Lowest point', gbp0(cf.low.balance), `on ${fmtDay(cf.low.date)}`, cf.low.balance < 0 ? 'amber' : 'green'),
      kpi('In 60 days', gbp0(cf.end), 'projected balance', ''),
      kpi('Everyday spending', `${gbp2(cf.daily)}/day`, 'estimated from your history', 'purple')));
    out.push(cf.shortfall ? tip(`A shortfall is possible: your balance could drop below zero on ${fmtDay(cf.shortfall.date)}. Move money in, or move a payment, before then.`) : note('No shortfall in the next 60 days at this pace.'));
    out.push(card('Expected balance', plot(reg, 'Projected current-account balance', () => cfg.lines(cf.series.map((p) => fmtDay(p.date).slice(0, 6)), [{ label: 'Balance', data: cf.series.map((p) => p.balance), color: '#4cc9ff', fill: true }], { zero: false }), 280),
      note('This is a forecast from the balances you entered, your pay, bills and an estimate of everyday spending. It is not a verified balance.'),
      h('div', { class: 'edgrid' }, field('Everyday spending per day (£, blank = estimate)', numInput(data.settings.forecast?.dailySpend || '', (v) => set((s) => { s.forecast = { ...s.forecast, dailySpend: Math.max(0, v) }; }))))));
    out.push(card('Cash-flow timeline', table([{ label: 'Date', align: 'left', get: (r) => fmtDay(r.date) }, { label: 'What', align: 'left', get: (r) => r.label }, { label: 'Amount', get: (r) => h('span', { class: r.amount < 0 ? '' : 'good-t' }, `${r.amount < 0 ? '-' : '+'}${gbp0(Math.abs(r.amount))}`) }], cf.events.slice(0, 40))));
    return out;
  }

  // ---------------------------------------------------------------- Calendar
  function calendar(data, today) {
    const out = [];
    const ym = state.month;
    const { start, end } = monthBounds(ym);
    const ev = calendarEvents(data, ym);
    const firstDow = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
    const days = +end.slice(8, 10);
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(h('div', { class: 'cal-cell empty' }));
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, '0')}`;
      const here = ev.filter((e) => e.date === iso);
      cells.push(h('button', { class: `cal-cell ${iso === today ? 'today' : ''} ${state.day === iso ? 'sel' : ''}`, type: 'button', 'aria-label': `${fmtDay(iso)}: ${here.length} events`, onclick: () => { state.day = state.day === iso ? '' : iso; render(); } },
        h('span', { class: 'cal-n' }, String(d)), h('span', { class: 'cal-dots' }, here.slice(0, 4).map((e) => h('i', { class: `dot-${e.type}` })))));
    }
    out.push(card(monthLabel(ym).replace(/(\w+) (\d+)/, '$1 20$2'),
      h('div', { class: 'cal-nav' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => { state.month = addMonths(`${ym}-01`, -1).slice(0, 7); state.day = ''; render(); } }, 'Previous'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { state.month = today.slice(0, 7); state.day = ''; render(); } }, 'Today'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { state.month = addMonths(`${ym}-01`, 1).slice(0, 7); state.day = ''; render(); } }, 'Next')),
      h('div', { class: 'cal' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'cal-h' }, d)), cells),
      h('div', { class: 'legend' }, [['payday', 'Payday'], ['bill', 'Bill'], ['card', 'Card due'], ['goal', 'Goal date'], ['saving', 'Saving']].map(([t, l]) => h('span', null, h('i', { class: `dot-${t}` }), l)))));
    const shown = state.day ? ev.filter((e) => e.date === state.day) : ev;
    out.push(card(state.day ? fmtDay(state.day) : 'This month', shown.length ? h('div', { class: 'txlist' }, shown.map((e) => h('div', { class: 'txrow static' }, h('div', { class: 'tx-main' }, h('b', null, e.label), h('span', { class: 'tx-meta' }, `${fmtDay(e.date)} · ${e.type}`)), h('div', { class: 'tx-right' }, e.amount ? h('span', { class: 'amt' }, gbp0(e.amount)) : null)))) : h('p', { class: 'empty' }, 'Nothing scheduled.')));
    // reminders
    const soon = [...calendarEvents(data, today.slice(0, 7)), ...calendarEvents(data, addMonths(`${today.slice(0, 7)}-01`, 1).slice(0, 7))].filter((e) => e.date >= today && e.date <= addDays(today, 7) && e.type !== 'saving');
    out.push(card('Reminders (next 7 days)', soon.length ? h('div', { class: 'insights' }, soon.map((e) => insightCard({ level: e.type === 'payday' ? 'good' : 'info', title: `${e.label}${e.amount ? ` · ${gbp0(e.amount)}` : ''}`, body: `${fmtDay(e.date)} (${e.date === today ? 'today' : `in ${dayDiff(today, e.date)} day${dayDiff(today, e.date) === 1 ? '' : 's'}`})` }))) : h('p', { class: 'empty' }, 'Nothing due this week.'),
      note('In-page reminders only: this app does not send phone notifications.')));
    return out;
  }

  // ---------------------------------------------------------------- Recurring
  function recurring(data, today) {
    const out = [];
    const bills = data.settings.recurring || [];
    const live = bills.filter((b) => !b.cancelled);
    const monthly = r2(live.reduce((a, b) => a + annualCost(b) / 12, 0));
    const dash = dashboardSummary(data, {});
    const income = dash.empty ? 0 : dash.cards.avgIncome;
    out.push(grid(3, kpi('Per month', gbp0(monthly), plural(live.length, 'active payment'), 'amber'), kpi('Per year', gbp0(monthly * 12), 'annualised cost', ''), kpi('Share of income', income > 0 ? `${Math.round((monthly / income) * 100)}%` : '—', 'of average income', income > 0 && monthly / income > 0.25 ? 'amber' : 'green')));
    if (income > 0 && monthly / income > 0.25) out.push(tip(`Recurring payments take ${Math.round((monthly / income) * 100)}% of your income, which is high. Look for anything you could cancel.`));
    out.push(card('Recurring payments & subscriptions', listEditor({
      items: bills, empty: 'No recurring payments yet.', addLabel: 'Add a payment',
      makeNew: () => ({ id: uid('rec'), name: 'New payment', amount: 0, day: 1, freq: 'monthly', month: 1, category: 'Essentials', account: 'Ulster Bank', match: '', cancelled: false }),
      onChange: (items) => set((s) => { s.recurring = items; }),
      itemTitle: (b) => `${b.name} · ${gbp0(annualCost(b))} a year${b.cancelled ? ' · cancelled' : ''}`,
      fields: [{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount (£)', type: 'number' }, { key: 'freq', label: 'How often', type: 'select', options: [['monthly', 'Monthly'], ['yearly', 'Yearly']] }, { key: 'day', label: 'Day of month', type: 'number' }, { key: 'month', label: 'Month (yearly only, 1-12)', type: 'number' },
        { key: 'account', label: 'Paid from' }, { key: 'category', label: 'Category' }, { key: 'match', label: 'Shop name to match' }, { key: 'cancelled', label: 'Cancelled', type: 'check' }],
    })));
    const found = detectRecurring(data).filter((r) => !r.alreadyEntered).slice(0, 10);
    out.push(card('Spotted in your spending', note('Shops you pay in at least three different months for a similar amount.'),
      found.length ? table([{ label: 'Shop', align: 'left', get: (r) => r.name }, { label: 'Amount', get: (r) => gbp2(r.amount) }, { label: 'Months', get: (r) => r.months }, { label: 'A year', get: (r) => gbp0(r.annual) },
        { label: '', get: (r) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => set((s) => { s.recurring.push({ id: uid('rec'), name: r.name, amount: r.amount, day: r.day, freq: 'monthly', month: 1, category: r.category || 'Essentials', account: r.account || '', match: r.name, cancelled: false }); }) }, 'Add') }], found)
        : h('p', { class: 'empty' }, 'Nothing new spotted.')));
    return out;
  }

  // ---------------------------------------------------------------- What-if
  const PRESETS = [
    ['Buy a car', { oneOff: 8000, oneOffMonth: 2, newBill: 150, spend: 0, save: 0, invest: 0, income: 0 }], ['Holiday in 6 months', { oneOff: 1500, oneOffMonth: 6, newBill: 0, spend: 0, save: 0, invest: 0, income: 0 }],
    ['Pay rise of £200', { income: 200, oneOff: 0, newBill: 0, spend: 0, save: 0, invest: 0 }], ['Spend £100 less a month', { spend: -100, oneOff: 0, newBill: 0, save: 0, invest: 0, income: 0 }],
    ['Invest £100 more', { invest: 100, oneOff: 0, newBill: 0, spend: 0, save: 0, income: 0 }], ['New £50 monthly bill', { newBill: 50, oneOff: 0, spend: 0, save: 0, invest: 0, income: 0 }]];
  function whatIf(data, today) {
    const out = [];
    const sc = state.scn;
    const upd = (k) => (v) => { sc[k] = v; render(); };
    out.push(card('What if…?', note('Change a number or pick a scenario. Everything is an estimate from your own averages.'),
      h('div', { class: 'chips wrapchips' }, PRESETS.map(([name, v]) => h('button', { class: 'chip', type: 'button', onclick: () => { Object.assign(sc, { spend: 0, save: 0, invest: 0, income: 0, newBill: 0, oneOff: 0, oneOffMonth: 1 }, v); render(); } }, name))),
      h('div', { class: 'edgrid' },
        field('Spend more (+) or less (−) per month (£)', numInput(sc.spend, upd('spend'))), field('Save more per month (£)', numInput(sc.save, upd('save'))), field('Invest more per month (£)', numInput(sc.invest, upd('invest'))),
        field('Income change per month (£)', numInput(sc.income, upd('income'))), field('New monthly bill (£)', numInput(sc.newBill, upd('newBill'))), field('One-off purchase (£)', numInput(sc.oneOff, upd('oneOff'))),
        field('One-off happens in month', numInput(sc.oneOffMonth, upd('oneOffMonth'))), field('Investment growth (% a year)', numInput(sc.rate, upd('rate')))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { Object.assign(sc, { spend: 0, save: 0, invest: 0, income: 0, newBill: 0, oneOff: 0, oneOffMonth: 1 }); render(); } }, 'Reset')));
    const s = scenario(data, today, sc);
    out.push(grid(4,
      kpi('Free cash each month', gbp0(s.changed.free), `was ${gbp0(s.baseline.free)}`, s.changed.free < s.baseline.free ? 'amber' : 'green'),
      kpi('Income', gbp0(s.changed.income), 'per month', 'green'), kpi('Spending', gbp0(s.changed.spend), 'per month', ''), kpi('Invested + saved', gbp0(s.changed.invest + s.changed.save), 'per month', 'blue')));
    out.push(card('Where you end up', plot(reg, 'Net worth with and without the change', () => cfg.lines(['Now', ...s.horizons.map((x) => `${x.months} mo`)], [{ label: 'As things are', data: [s.baseline.rows[3] ? r2(s.baseline.rows[3].netWorth - s.baseline.free * 3) : 0, ...s.horizons.map((x) => x.base.netWorth)], color: '#7e8aa3', dash: [5, 4] }, { label: 'With the change', data: [s.baseline.rows[3] ? r2(s.baseline.rows[3].netWorth - s.baseline.free * 3) : 0, ...s.horizons.map((x) => x.next.netWorth)], color: '#2ee6b6' }], { zero: false }), 260),
      table([{ label: 'In', align: 'left', get: (r) => `${r.months} months` }, { label: 'Cash', get: (r) => gbp0(r.next.cash) }, { label: 'Savings', get: (r) => gbp0(r.next.savings) }, { label: 'Investments', get: (r) => gbp0(r.next.investments) }, { label: 'Net worth', get: (r) => gbp0(r.next.netWorth) }, { label: 'vs now', get: (r) => h('span', { class: r.deltaNetWorth < 0 ? 'bad-t' : 'good-t' }, `${r.deltaNetWorth >= 0 ? '+' : '-'}${gbp0(Math.abs(r.deltaNetWorth))}`) }], s.horizons),
      note('Cash grows or shrinks by your free cash each month. Net worth includes your accounts as you entered them. Projections are estimates, not guarantees.')));
    if (s.goals.length) out.push(card('Goal dates', table([{ label: 'Goal', align: 'left', get: (r) => r.name }, { label: 'Before', get: (r) => (r.before ? fmtDay(r.before) : '—') }, { label: 'After', get: (r) => (r.after ? fmtDay(r.after) : '—') }], s.goals), note('Goals move when you change how much you save per month.')));
    return out;
  }

  // ---------------------------------------------------------------- Insights
  function insightsView(data, today) {
    const out = [];
    const hs = healthScore(data, today);
    out.push(card('Financial health score',
      h('div', { class: 'big' }, hs.score === null ? '—' : `${hs.score}/100`), h('p', { class: 'lead' }, hs.label),
      h('div', { class: 'brows' }, hs.parts.map((p) => h('div', { class: 'brow' }, h('div', { class: 'brow-top' }, h('span', { class: 'bname' }, p.name), h('span', { class: 'bsum' }, p.score === null ? 'not enough data' : `${p.score}/100`)), p.score === null ? null : meter(p.score, p.score >= 75 ? 'ok' : p.score >= 50 ? 'near' : 'over', p.name), h('p', { class: 'bnote' }, p.note)))),
      note(hs.how)));
    out.push(card('Insights', h('div', { class: 'insights' }, insights(data, today).map(insightCard))));
    const r = monthlyReview(data, today);
    if (r) {
      const text = `Monthly review: ${r.label}\n\n${r.lines.join('\n')}\n\nGoing well:\n- ${r.wins.join('\n- ')}\n\nTo improve:\n- ${r.improve.join('\n- ')}\n`;
      out.push(card(`Monthly review: ${r.label}`, h('div', { class: 'review' }, r.lines.map((l) => h('p', null, l)), h('h3', { class: 'h3' }, 'Going well'), h('ul', { class: 'plain' }, r.wins.map((w) => h('li', null, w))), h('h3', { class: 'h3' }, 'To improve'), h('ul', { class: 'plain' }, r.improve.map((w) => h('li', null, w)))),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied. Paste it to Claude for honest feedback.', 'ok'); } catch { toast('Could not copy here. Select the text instead.', 'bad'); } } }, 'Copy summary for Claude'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = `money-hq-review-${r.month}.txt`; a.click(); } }, 'Download'))));
    } else out.push(card('Monthly review', emptyState('A review is written once you have a full month of data.')));
    return out;
  }

  function render() {
    reg.clear();
    root.replaceChildren();
    const data = ctx.data;
    const today = todayIso();
    const sub = SUBS.some((s) => s[0] === route()) ? route() : 'payday';
    root.append(subnav(SUBS, sub, go));
    try { for (const el of { payday, cashflow: cashFlow, calendar, recurring, whatif: whatIf, insights: insightsView }[sub](data, today)) root.append(el); } catch (err) { root.append(card('Something went wrong drawing this page', note(err.message))); }
  }

  return { render };
}
