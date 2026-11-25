// Savings & Goals: pots with targets, forecasts, what-if contributions, priorities and suggestions for spare money.
import { h, fmtDay, plural, toast, armConfirm } from '../ui.js';
import { todayIso, r2 } from '../money.js';
import { dashboardSummary } from '../dashboard.js';
import { GOAL_KINDS, goalForecast, suggestSurplus, compound, budgetStatus } from '../finance.js';
import { card, kpi, meter, note, tip, grid, field, numInput, textInput, dateInput, selectInput, plot, cfg, createRegistry, gbp0, gbp2, uid, emptyState } from '../kit.js';

const STATUS = { 'on-track': ['On track', 'b-income'], behind: ['Behind', 'b-unsure'], stalled: ['No monthly amount', 'b-unsure'], done: ['Reached', 'b-income'] };

export function initSavings(ctx, root) {
  const reg = createRegistry();
  const surplus = { v: null };
  const contrib = {};

  const update = (id, patch) => ctx.update((d) => {
    const g = d.goals.find((x) => x.id === id);
    if (!g) return;
    Object.assign(g, patch);
    if ('balance' in patch) { g.history = g.history || []; g.history.push({ date: todayIso(), balance: Number(g.balance) || 0 }); }
  });

  function goalCard(g, today) {
    const f = goalForecast(g, today);
    const [label, cls] = STATUS[f.status];
    let model = Number(g.monthly) || 0;
    const modelOut = h('p', { class: 'lead' });
    const showModel = () => {
      const m = goalForecast({ ...g, monthly: model }, today);
      modelOut.textContent = m.status === 'done' ? 'Already reached.' : m.projected ? `At ${gbp0(model)} a month: reached ${fmtDay(m.projected)} (${plural(m.months, 'month')}).` : 'Add a monthly amount to see a date.';
    };
    showModel();
    const slider = h('input', { type: 'range', min: '0', max: String(Math.max(500, Math.ceil(((Number(g.monthly) || 0) * 3) / 50) * 50)), step: '5', value: String(model), 'aria-label': `What if I saved more into ${g.name}`, oninput: (e) => { model = Number(e.target.value); showModel(); modelLabel.textContent = gbp0(model); } });
    const modelLabel = h('b', null, gbp0(model));
    const del = h('button', { class: 'btn danger small', type: 'button' }, 'Delete goal');
    armConfirm(del, 'Delete goal', 'Tap again to delete', () => ctx.update((d) => { d.goals = d.goals.filter((x) => x.id !== g.id); }));
    const add = contrib[g.id] || (contrib[g.id] = { v: 0 });
    return h('section', { class: 'card goal' },
      h('div', { class: 'brow-top' }, h('h2', null, g.name || 'New goal'), h('span', { class: `badge ${cls}` }, label)),
      h('div', { class: 'brow-top' }, h('span', { class: 'bsum' }, `${gbp0(g.balance)} of ${gbp0(g.target)}`), h('span', { class: 'bsum' }, `${f.pct}%`)),
      meter(f.pct, f.status === 'behind' || f.status === 'stalled' ? 'near' : 'ok', g.name),
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Still to save'), h('dd', null, gbp0(f.remaining))),
        h('div', null, h('dt', null, 'Projected finish'), h('dd', null, f.status === 'done' ? 'Reached' : f.projected ? fmtDay(f.projected) : 'Add a monthly amount')),
        g.targetDate ? h('div', null, h('dt', null, `Needed monthly to hit ${fmtDay(g.targetDate)}`), h('dd', null, f.required !== null ? gbp0(f.required) : '—')) : null,
        h('div', null, h('dt', null, 'Interest earned so far'), h('dd', null, gbp0(g.interest || 0)))),
      f.status === 'behind' ? tip(`At this pace you finish ${fmtDay(f.projected)}, after your target date. Raise the monthly amount to about ${gbp0(f.required)}.`) : null,
      h('div', { class: 'edgrid' },
        field('Name', textInput(g.name, (v) => update(g.id, { name: v }))),
        field('Type', selectInput(GOAL_KINDS, g.kind, (v) => update(g.id, { kind: v }))),
        field('Balance now (£)', numInput(g.balance, (v) => update(g.id, { balance: v }))),
        field('Target (£)', numInput(g.target, (v) => update(g.id, { target: v }))),
        field('Target date', dateInput(g.targetDate, (v) => update(g.id, { targetDate: v }))),
        field('Monthly amount (£)', numInput(g.monthly, (v) => update(g.id, { monthly: v }))),
        field('Interest rate (% a year)', numInput(g.rate, (v) => update(g.id, { rate: v }))),
        field('Priority (1 = first)', numInput(g.priority, (v) => update(g.id, { priority: Math.max(1, Math.round(v)) }))),
        field('Interest earned (£)', numInput(g.interest, (v) => update(g.id, { interest: v })))),
      h('div', { class: 'optrow' },
        h('div', { class: 'edgrid' }, field('Paid in just now (£)', numInput('', (v) => { add.v = v; }))),
        h('button', { class: 'btn', type: 'button', onclick: () => { if (!(add.v > 0)) { toast('Enter an amount first.', 'bad'); return; } update(g.id, { balance: r2((Number(g.balance) || 0) + add.v) }); toast(`Added ${gbp2(add.v)} to ${g.name}.`, 'ok'); add.v = 0; } }, 'Add to balance')),
      h('div', { class: 'whatif' }, h('b', null, 'What if I saved '), modelLabel, h('b', null, ' a month?'), slider, modelOut),
      note('This pot carries over every pay cycle. It never resets. Missed a month? Just leave the balance as it is: the date moves out on its own.'),
      del);
  }

  function render() {
    reg.clear();
    root.replaceChildren();
    const data = ctx.data;
    const today = todayIso();
    const goals = data.goals.slice().sort((a, b) => (Number(a.priority) || 3) - (Number(b.priority) || 3));
    const dash = dashboardSummary(data, {});
    const total = r2(goals.reduce((a, g) => a + (Number(g.balance) || 0), 0));
    const monthly = r2(goals.reduce((a, g) => a + (Number(g.monthly) || 0), 0));
    const income = dash.empty ? 0 : dash.cards.avgIncome;
    const interest = r2(goals.reduce((a, g) => a + (Number(g.interest) || 0), 0));
    const yearEnd = r2(goals.reduce((a, g) => a + compound(Number(g.balance) || 0, Number(g.monthly) || 0, Number(g.rate) || 0, 12)[12], 0));

    root.append(grid(4,
      kpi('Saved in pots', gbp0(total), plural(goals.length, 'goal'), 'green'),
      kpi('Going in each month', gbp0(monthly), income > 0 ? `${Math.round((monthly / income) * 100)}% of your income` : 'monthly contributions', 'blue'),
      kpi('In 12 months', gbp0(yearEnd), 'at your current pace', 'purple'),
      kpi('Interest earned', gbp0(interest), 'as you have entered it', 'amber')));

    if (!goals.length) {
      root.append(card('Savings goals', emptyState('No goals yet. Add an emergency fund, a holiday pot, a house deposit: anything you are saving towards.')));
    }
    for (const g of goals) root.append(goalCard(g, today));
    root.append(h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => ctx.update((d) => { d.goals.push({ id: uid('goal'), name: 'New goal', kind: 'sinking', balance: 0, target: 1000, targetDate: '', monthly: 50, rate: 0, priority: 3, interest: 0, history: [] }); }) }, 'Add a goal'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.update((d) => {
        const lt = d.settings.legacy?.lt || {}; const st = d.settings.legacy?.st || {}; const L = d.settings.legacy || {};
        const seeds = [['Cash ISA (Trading 212)', 'longterm', L.isaBalance, L.isaTarget, lt['Cash ISA (Trading 212)']], ['Holiday Pot', 'holiday', L.holBalance, L.holTarget, st['Holiday Pot']], ['Watch for Dad', 'gift', L.dadBalance, L.dadTarget, st['Watch for Dad']]];
        let n = 0;
        for (const [name, kind, balance, target, monthly] of seeds) if (target && !d.goals.some((g) => g.name === name)) { d.goals.push({ id: uid('goal'), name, kind, balance: Number(balance) || 0, target: Number(target) || 0, targetDate: '', monthly: Number(monthly) || 0, rate: 0, priority: 2, interest: 0, history: [] }); n++; }
        toast(n ? `Added ${n} goals from your old dashboard.` : 'Nothing new to bring across.', n ? 'ok' : '');
      }) }, 'Use my old dashboard goals')));

    if (goals.length) {
      // Progress over time
      const withHistory = goals.filter((g) => (g.history || []).length >= 2);
      root.append(card('Progress over time',
        withHistory.length ? plot(reg, 'Savings balances over time', () => {
          const dates = [...new Set(withHistory.flatMap((g) => g.history.map((p) => p.date)))].sort();
          return cfg.lines(dates.map(fmtDay), withHistory.map((g) => { let last = null; return { label: g.name, data: dates.map((d) => { const p = g.history.filter((x) => x.date <= d).pop(); if (p) last = p.balance; return last; }) }; }), { zero: true });
        }, 240) : h('p', { class: 'empty' }, 'Each time you update a balance it is remembered, and the line builds up here.')));
      // Annual projection per goal
      root.append(card('Where each pot will be', note('Estimates from your monthly amount and interest rate. Not guaranteed.'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'mtable' }, h('thead', null, h('tr', null, h('th', { class: 'l' }, 'Goal'), h('th', null, 'Now'), h('th', null, '6 months'), h('th', null, '12 months'), h('th', null, '24 months'))),
          h('tbody', null, goals.map((g) => { const c = compound(Number(g.balance) || 0, Number(g.monthly) || 0, Number(g.rate) || 0, 24); return h('tr', null, h('td', { class: 'l' }, g.name), h('td', null, gbp0(c[0])), h('td', null, gbp0(c[6])), h('td', null, gbp0(c[12])), h('td', null, gbp0(c[24]))); }))))));
      // Surplus suggestions
      const bs = budgetStatus(data, today);
      const amount = surplus.v ?? Math.max(0, Math.round(bs.totals.left));
      const sug = suggestSurplus(goals, amount, today);
      root.append(card('If you have spare money', note('Share an amount across your goals by priority and how much each still needs.'),
        h('div', { class: 'edgrid' }, field('Spare money (£)', numInput(amount, (v) => { surplus.v = v; render(); }))),
        sug.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'mtable' }, h('tbody', null, sug.map((s) => h('tr', null, h('td', { class: 'l' }, s.name), h('td', null, gbp0(s.amount)),
          h('td', null, h('button', { class: 'btn ghost small', type: 'button', onclick: () => { const g = data.goals.find((x) => x.id === s.id); update(s.id, { balance: r2((Number(g.balance) || 0) + s.amount) }); } }, 'Add')))))))
          : h('p', { class: 'empty' }, 'Nothing to share out.'),
        note(`Your budgets have ${gbp0(bs.totals.left)} unspent this cycle.`)));
    }
  }

  return { render };
}
