// The money engine: accounts, net worth, goals, budgets, safe-to-spend, forecasts, scenarios, health score,
// the payday plan and the calendar. Pure functions (no browser needed), so they can all be tested.
import { r2, addDays, addMonths, dayDiff, isIsoDate } from './money.js';
import { periodFor, inPeriod } from './paycycle.js';
import { cycleSummary, billDates } from './insights.js';
import { dashboardSummary } from './dashboard.js';

const sum = (list, f = (x) => x) => r2(list.reduce((a, x) => a + (Number(f(x)) || 0), 0));
const ym = (iso) => iso.slice(0, 7);

// ================================================================ accounts & net worth
export const ACCOUNT_TYPES = [
  ['current', 'Current account'], ['savings', 'Savings / pot'], ['investment', 'Investment'],
  ['pension', 'Pension'], ['other', 'Other asset'], ['credit', 'Credit card'], ['loan', 'Loan'],
];
export const isLiability = (a) => a.type === 'credit' || a.type === 'loan';
const GROUP = { current: 'Cash', savings: 'Savings', investment: 'Investments', pension: 'Pension', other: 'Other assets' };

// Assets minus liabilities. Liabilities are entered as the amount you owe (a positive number).
export function accountsSummary(accounts = []) {
  const by = {};
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const v = Number(a.balance) || 0;
    if (isLiability(a)) liabilities += Math.abs(v);
    else { assets += v; const g = GROUP[a.type] || 'Other assets'; by[g] = (by[g] || 0) + v; }
  }
  const cash = by.Cash || 0;
  const savings = by.Savings || 0;
  return {
    count: accounts.length,
    assets: r2(assets), liabilities: r2(liabilities), netWorth: r2(assets - liabilities),
    cash: r2(cash), savings: r2(savings), accessible: r2(cash + savings),
    investments: r2(by.Investments || 0), pension: r2(by.Pension || 0), other: r2(by['Other assets'] || 0), debt: r2(liabilities),
    allocation: Object.entries(by).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value: r2(value) })),
  };
}

// Net worth over time from saved snapshots, plus today's balances. Each point after the first says how much of the
// change came from money you paid in (contributions) and how much from everything else (growth, interest, other).
export function netWorthSeries(data, today) {
  const byId = new Map(data.accounts.map((a) => [a.id, a]));
  const pts = data.snapshots.slice().sort((a, b) => a.date.localeCompare(b.date)).map((s) => {
    const list = Object.entries(s.balances || {}).map(([id, balance]) => (byId.has(id) ? { ...byId.get(id), balance } : null)).filter(Boolean);
    return { date: s.date, ...accountsSummary(list) };
  });
  if (data.accounts.length && (!pts.length || pts[pts.length - 1].date < today)) pts.push({ date: today, ...accountsSummary(data.accounts), current: true });
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    cur.change = r2(cur.netWorth - prev.netWorth);
    cur.contributions = sum(data.transactions.filter((t) => t.kind === 'invested' && t.direction === 'out' && t.date > prev.date && t.date <= cur.date), (t) => t.amount);
    cur.other = r2(cur.change - cur.contributions);
    cur.pct = prev.netWorth ? r2((cur.change / Math.abs(prev.netWorth)) * 100) : 0;
  }
  return pts;
}

// Compound growth: balance at the end of each month. An estimate, never a promise.
export function compound(start, monthly, annualPct, months) {
  const r = (Number(annualPct) || 0) / 100 / 12;
  let b = Number(start) || 0;
  const out = [r2(b)];
  for (let i = 0; i < months; i++) { b = b * (1 + r) + (Number(monthly) || 0); out.push(r2(b)); }
  return out;
}

// ================================================================ goals / savings pots
export const GOAL_KINDS = [['emergency', 'Emergency fund'], ['sinking', 'Sinking fund'], ['holiday', 'Holiday'], ['gift', 'Gifts'], ['bills', 'Annual bills'], ['purchase', 'Major purchase'], ['longterm', 'Long-term']];

export function goalForecast(g, today) {
  const target = Number(g.target) || 0;
  const bal = Number(g.balance) || 0;
  const monthly = Number(g.monthly) || 0;
  const rate = (Number(g.rate) || 0) / 100 / 12;
  const remaining = Math.max(0, r2(target - bal));
  const pct = target > 0 ? Math.min(100, Math.round((bal / target) * 1000) / 10) : 0;
  let months = 0;
  if (remaining > 0) {
    if (monthly <= 0 && rate <= 0) months = null;
    else {
      let b = bal;
      while (b < target && months < 1200) { b = b * (1 + rate) + monthly; months++; }
      if (b < target) months = null;
    }
  }
  const projected = months === null ? null : addMonths(today, months);
  let required = null;
  let monthsLeft = null;
  if (g.targetDate && isIsoDate(g.targetDate)) {
    monthsLeft = Math.max(0, Math.round(dayDiff(today, g.targetDate) / 30.44));
    required = remaining > 0 ? (monthsLeft > 0 ? r2(remaining / monthsLeft) : remaining) : 0;
  }
  let status = 'on-track';
  if (remaining === 0) status = 'done';
  else if (months === null) status = 'stalled';
  else if (g.targetDate && isIsoDate(g.targetDate) && projected > g.targetDate) status = 'behind';
  return { remaining, pct, months, projected, required, monthsLeft, status };
}

// Where could spare money go? Shared across goals by priority (1 = most important) and by how much each still needs.
export function suggestSurplus(goals, amount, today) {
  const open = goals.map((g) => ({ g, f: goalForecast(g, today) })).filter((x) => x.f.remaining > 0);
  if (!open.length || !(amount > 0)) return [];
  const weights = open.map((x) => (1 / Math.max(1, Number(x.g.priority) || 3)) * Math.min(x.f.remaining, amount * 4));
  const total = weights.reduce((a, w) => a + w, 0) || 1;
  return open.map((x, i) => ({ id: x.g.id, name: x.g.name, amount: Math.min(x.f.remaining, r2((weights[i] / total) * amount)) }));
}

// ================================================================ budgets
// Effective budgets for the current cycle: base budgets, scaled for the cycle length (if switched on), plus moves
// between budgets, plus last cycle's unspent money (if rollover is on).
export function effectiveBudgets(data, today) {
  const st = data.settings;
  const period = periodFor(today, st.paydates);
  const scale = st.scaleBudgets ? period.totalDays / 30.44 : 1;
  const adj = (st.budgetAdjust || {})[period.start] || {};
  const roll = {};
  if (st.rollover) {
    const prev = cycleSummary(data, addDays(period.start, -1));
    if (prev.through) for (const b of prev.buckets) roll[b.name] = Math.max(0, b.left);
  }
  const budgets = {};
  for (const [k, v] of Object.entries(st.budgets || {})) budgets[k] = r2(Number(v) * scale + (adj[k] || 0) + (roll[k] || 0));
  return { budgets, period, scale, adjust: adj, rollover: roll };
}

// Budgets vs actual for this cycle, with the expected pace and an end-of-cycle projection.
export function budgetStatus(data, today) {
  const eff = effectiveBudgets(data, today);
  const s = cycleSummary({ ...data, settings: { ...data.settings, budgets: eff.budgets } }, today);
  const p = s.period;
  const buckets = s.buckets.map((b) => {
    const expected = r2((b.budget * p.dayNumber) / p.totalDays);
    const projected = p.dayNumber > 0 ? r2((b.net / p.dayNumber) * p.totalDays) : b.net;
    return {
      ...b, expected, projected,
      pct: b.budget > 0 ? Math.round((b.net / b.budget) * 100) : 0,
      pace: b.net > expected * 1.1 + 1 ? 'fast' : b.net < expected * 0.9 - 1 ? 'slow' : 'steady',
      willExceed: projected > b.budget * 1.02 && b.net < b.budget * 1.05 ? true : projected > b.budget,
    };
  });
  const projectedTotal = r2(buckets.reduce((a, b) => a + b.projected, 0));
  return { ...s, buckets, eff, projectedTotal, willExceedTotal: projectedTotal > s.totals.budget };
}

// Suggested budgets: the average net spend per bucket over the last few full pay cycles, rounded up a little.
export function recommendBudgets(data, today, cycles = 6) {
  const out = {};
  const names = data.settings.categories.map((c) => c.name);
  let cursor = today;
  const seen = [];
  for (let i = 0; i < cycles + 1; i++) {
    const p = periodFor(cursor, data.settings.paydates);
    if (i > 0) seen.push(p);
    cursor = addDays(p.start, -1);
  }
  for (const name of names) {
    const totals = seen.map((p) => {
      const tx = data.transactions.filter((t) => inPeriod(t.cycleDate || t.date, p) && t.category === name);
      const spent = sum(tx.filter((t) => t.kind === 'spending' && t.direction === 'out'), (t) => t.amount);
      const back = sum(tx.filter((t) => t.kind === 'payback' && t.direction === 'in'), (t) => t.amount);
      return Math.max(0, spent - back);
    }).filter((v) => v > 0);
    if (totals.length) out[name] = Math.ceil(totals.reduce((a, v) => a + v, 0) / totals.length / 5) * 5;
  }
  return out;
}

// ================================================================ safe to spend
// Credit-card payments that fall due between two dates. A repayment is a settlement of a debt, not spending, but the
// cash does leave your account, so it comes out of what is safe to spend.
export function cardPaymentsDue(data, fromIso, toIso) {
  const out = [];
  for (const a of data.accounts.filter((x) => x.type === 'credit' && Number(x.dueDay) > 0)) {
    for (const date of billDates({ day: Number(a.dueDay), freq: 'monthly' }, { start: fromIso, end: toIso })) {
      const amount = Number(a.statementBalance) > 0 ? Number(a.statementBalance) : Number(a.minPayment) || 0;
      if (amount > 0) out.push({ name: a.name, date, amount: r2(amount) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function safeSpend(data, today) {
  const s = budgetStatus(data, today);
  const cards = cardPaymentsDue(data, today, s.period.end);
  const cardTotal = sum(cards, (c) => c.amount);
  const reserved = r2(Number(data.settings.reserved) || 0);
  const parts = [
    { label: 'Left in your budgets', amount: s.totals.left },
    { label: 'Bills not in your data yet', amount: -s.safe.billsHeldBack },
    { label: 'Credit-card payments due', amount: -cardTotal },
    { label: 'Money you keep in reserve', amount: -reserved },
  ];
  const total = Math.max(0, r2(s.totals.left - s.safe.billsHeldBack - cardTotal - reserved));
  const days = s.safe.days;
  return { total, perDay: r2(total / days), perWeek: r2((total / days) * 7), days, parts, cards, status: s };
}

// ================================================================ the payday plan & Sankey
export const PLAN_TYPES = [['spending', 'Spending'], ['bills', 'Bills'], ['savings', 'Savings'], ['investing', 'Investing'], ['debt', 'Debt repayment'], ['other', 'Other']];

export function planSummary(data) {
  const plan = data.settings.plan || { salary: 0, allocations: [] };
  const allocated = sum(plan.allocations, (a) => a.amount);
  const salary = Number(plan.salary) || 0;
  const byType = {};
  for (const a of plan.allocations) byType[a.type] = r2((byType[a.type] || 0) + (Number(a.amount) || 0));
  const unallocated = r2(salary - allocated);
  const links = Object.entries(byType).filter(([, v]) => v > 0).map(([type, value]) => ({ type, label: (PLAN_TYPES.find((t) => t[0] === type) || [, type])[1], value }));
  if (unallocated > 0) links.push({ type: 'free', label: 'Not allocated yet', value: unallocated });
  return { salary, allocated, unallocated, byType, links, over: unallocated < 0 };
}

// A first plan built from what you already have: budgets, bills, goal contributions and planned investing.
export function suggestPlan(data, today) {
  const st = data.settings;
  const dash = dashboardSummary(data, {});
  const salary = Number(st.plan?.salary) || (dash.empty ? 0 : Math.round(dash.cards.avgIncome / 10) * 10);
  const id = (n) => `plan-${n}`;
  const allocations = [];
  for (const [name, amount] of Object.entries(st.budgets || {})) if (Number(amount) > 0) allocations.push({ id: id(`b-${name}`), name: `${name} budget`, type: 'spending', amount: Number(amount) });
  const bills = sum((st.recurring || []).filter((b) => (b.freq || 'monthly') === 'monthly' && !b.cancelled), (b) => b.amount);
  if (bills > 0) allocations.push({ id: id('bills'), name: 'Fixed bills & subscriptions', type: 'bills', amount: bills });
  for (const g of data.goals) if (Number(g.monthly) > 0) allocations.push({ id: id(`g-${g.id}`), name: g.name, type: 'savings', amount: Number(g.monthly) });
  for (const [name, amount] of Object.entries(st.legacy?.lt || {})) if (Number(amount) > 0) allocations.push({ id: id(`i-${name}`), name, type: 'investing', amount: Number(amount) });
  return { salary, allocations };
}

// ================================================================ calendar & recurring
export function monthBounds(ymStr) {
  const last = new Date(Date.UTC(+ymStr.slice(0, 4), +ymStr.slice(5, 7), 0)).getUTCDate();
  return { start: `${ymStr}-01`, end: `${ymStr}-${String(last).padStart(2, '0')}` };
}

export function calendarEvents(data, ymStr) {
  const { start, end } = monthBounds(ymStr);
  const period = { start, end };
  const ev = [];
  for (const d of data.settings.paydates || []) if (d >= start && d <= end) ev.push({ date: d, type: 'payday', label: 'Payday' });
  for (const b of data.settings.recurring || []) {
    if (b.cancelled) continue;
    for (const date of billDates(b, period)) ev.push({ date, type: 'bill', label: b.name, amount: Number(b.amount) || 0 });
  }
  for (const a of data.accounts.filter((x) => x.type === 'credit' && Number(x.dueDay) > 0)) {
    for (const date of billDates({ day: Number(a.dueDay), freq: 'monthly' }, period)) ev.push({ date, type: 'card', label: `${a.name} payment due`, amount: Number(a.statementBalance) || Number(a.minPayment) || 0 });
  }
  for (const g of data.goals) if (g.targetDate && g.targetDate >= start && g.targetDate <= end) ev.push({ date: g.targetDate, type: 'goal', label: `${g.name}: target date`, amount: Number(g.target) || 0 });
  const planned = sum((data.settings.plan?.allocations || []).filter((a) => a.type === 'savings' || a.type === 'investing'), (a) => a.amount);
  if (planned > 0) for (const d of data.settings.paydates || []) if (d >= start && d <= end) ev.push({ date: d, type: 'saving', label: 'Savings & investing planned', amount: planned });
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}

export const annualCost = (b) => r2((Number(b.amount) || 0) * ({ weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[b.freq || 'monthly'] || 12));

// ================================================================ cash-flow forecast
// Day by day for the next `days` days: today's current-account balances, plus pay, minus bills, card payments and
// an estimate of everyday spending. Only as good as the balances you have entered.
export function cashflow(data, today, days = 60) {
  const cur = data.accounts.filter((a) => a.type === 'current');
  if (!cur.length) return { available: false };
  const start = sum(cur, (a) => a.balance);
  const dash = dashboardSummary(data, {});
  const bills = sum((data.settings.recurring || []).filter((b) => (b.freq || 'monthly') === 'monthly' && !b.cancelled), (b) => b.amount);
  const monthlySpend = dash.empty ? 0 : dash.cards.avgSpend;
  const daily = Number(data.settings.forecast?.dailySpend) || Math.max(0, r2((monthlySpend - bills) / 30.44));
  const salary = Number(data.settings.plan?.salary) || (dash.empty ? 0 : dash.cards.avgIncome);
  const end = addDays(today, days);
  const events = [];
  for (const d of data.settings.paydates || []) if (d > today && d <= end && salary > 0) events.push({ date: d, label: 'Payday', amount: salary });
  const months = new Set();
  for (let d = today; d <= end; d = addDays(d, 20)) months.add(ym(d));
  months.add(ym(end));
  for (const m of months) {
    const mb = monthBounds(m);
    for (const b of data.settings.recurring || []) {
      if (b.cancelled) continue;
      for (const date of billDates(b, mb)) if (date > today && date <= end) events.push({ date, label: b.name, amount: -(Number(b.amount) || 0) });
    }
    for (const c of cardPaymentsDue(data, mb.start, mb.end)) if (c.date > today && c.date <= end) events.push({ date: c.date, label: `${c.name} payment`, amount: -c.amount });
  }
  const series = [];
  let bal = start;
  let low = { date: today, balance: start };
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    if (i > 0) { bal -= daily; for (const e of events.filter((x) => x.date === date)) bal += e.amount; }
    series.push({ date, balance: r2(bal) });
    if (bal < low.balance) low = { date, balance: r2(bal) };
  }
  const shortfall = series.find((p) => p.balance < 0) || null;
  return { available: true, start, daily, salary, series, events: events.sort((a, b) => a.date.localeCompare(b.date)), low, shortfall, end: series[series.length - 1].balance };
}

// ================================================================ what-if scenarios
// inputs: { spend, save, invest, income, newBill, oneOff, oneOffMonth, rate } (monthly changes in £; oneOff is a single £ cost)
export function scenario(data, today, inputs = {}) {
  const dash = dashboardSummary(data, {});
  const acc = accountsSummary(data.accounts);
  const goalsMonthly = sum(data.goals, (g) => g.monthly);
  const base = {
    income: dash.empty ? 0 : dash.cards.avgIncome,
    spend: dash.empty ? 0 : dash.cards.avgSpend,
    invest: dash.empty ? 0 : dash.cards.avgInvested,
    save: goalsMonthly,
  };
  const rate = Number(inputs.rate ?? 5);
  const run = (i) => {
    const income = base.income + (Number(i.income) || 0);
    const spend = base.spend + (Number(i.spend) || 0) + (Number(i.newBill) || 0);
    const invest = base.invest + (Number(i.invest) || 0);
    const save = base.save + (Number(i.save) || 0);
    const free = r2(income - spend - invest - save);
    const rows = {};
    for (const m of [3, 6, 12, 24, 60]) {
      const oneOff = Number(i.oneOff) && m >= (Number(i.oneOffMonth) || 1) ? Number(i.oneOff) : 0;
      const cash = r2(acc.cash + free * m - oneOff);
      const savings = r2(acc.savings + save * m);
      const investments = compound(acc.investments, invest, rate, m)[m];
      rows[m] = { cash, savings, investments, netWorth: r2(cash + savings + investments + acc.pension + acc.other - acc.debt), freeCash: free };
    }
    return { income, spend, invest, save, free, rows };
  };
  const baseline = run({});
  const changed = run(inputs);
  const horizons = [3, 6, 12, 24, 60].map((m) => ({
    months: m, base: baseline.rows[m], next: changed.rows[m],
    deltaNetWorth: r2(changed.rows[m].netWorth - baseline.rows[m].netWorth),
  }));
  const share = goalsMonthly > 0 ? (Number(inputs.save) || 0) / goalsMonthly : 0;
  const goals = data.goals.map((g) => ({
    name: g.name,
    before: goalForecast(g, today).projected,
    after: goalForecast({ ...g, monthly: Math.max(0, (Number(g.monthly) || 0) * (1 + share)) }, today).projected,
  }));
  return { base, baseline, changed, horizons, goals, rate };
}

// ================================================================ financial health score
// Five parts with equal weight. A part without enough data is left out (and says so), never guessed.
export function healthScore(data, today) {
  const dash = dashboardSummary(data, {});
  const bs = budgetStatus(data, today);
  const acc = accountsSummary(data.accounts);
  const parts = [];
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

  // 1. Saving & investing rate: 20% of income or more is full marks.
  if (!dash.empty && dash.cards.avgIncome > 0) {
    const rate = dash.cards.investedShare;
    const saved = Math.round(((sum(data.goals, (g) => g.monthly)) / dash.cards.avgIncome) * 100);
    const total = rate + saved;
    parts.push({ id: 'saving', name: 'Saving rate', score: clamp((total / 20) * 100), note: `You put about ${total}% of your income into investing and savings. 20% or more scores full marks.` });
  } else parts.push({ id: 'saving', name: 'Saving rate', score: null, note: 'Needs your income in the data.' });

  // 2. Budget adherence: how many of your budgets are within their limit this cycle.
  if (bs.buckets.length && bs.through) {
    const ok = bs.buckets.filter((b) => b.over <= 0.005).length;
    parts.push({ id: 'budget', name: 'Budget adherence', score: clamp((ok / bs.buckets.length) * 100), note: `${ok} of ${bs.buckets.length} budgets are within their limit this pay cycle.` });
  } else parts.push({ id: 'budget', name: 'Budget adherence', score: null, note: 'Needs budgets and spending in the current pay cycle.' });

  // 3. Debt: credit-card use. Under 30% of your limit is full marks; no debt is full marks.
  const cards = data.accounts.filter((a) => a.type === 'credit');
  const limit = sum(cards, (a) => a.limit);
  if (!cards.length) parts.push({ id: 'debt', name: 'Debt', score: null, note: 'No credit cards or loans entered yet.' });
  else if (limit > 0) {
    const util = (acc.debt / limit) * 100;
    parts.push({ id: 'debt', name: 'Debt', score: clamp(util <= 30 ? 100 : 100 - (util - 30) * (100 / 70)), note: `You use ${Math.round(util)}% of your credit limit. Under 30% scores full marks.` });
  } else parts.push({ id: 'debt', name: 'Debt', score: acc.debt === 0 ? 100 : null, note: acc.debt === 0 ? 'You owe nothing on cards.' : 'Add your card limit to score this.' });

  // 4. Emergency savings: 3 months of spending in an emergency pot is full marks.
  const emergency = data.goals.filter((g) => g.kind === 'emergency');
  if (emergency.length && !dash.empty && dash.cards.avgSpend > 0) {
    const months = sum(emergency, (g) => g.balance) / dash.cards.avgSpend;
    parts.push({ id: 'emergency', name: 'Emergency savings', score: clamp((months / 3) * 100), note: `Your emergency pot covers ${months.toFixed(1)} months of spending. 3 months scores full marks.` });
  } else parts.push({ id: 'emergency', name: 'Emergency savings', score: null, note: 'Add an emergency-fund goal to score this.' });

  // 5. Cash-flow stability: how steady your monthly surplus is.
  if (!dash.empty && dash.perMonth.length >= 4) {
    const full = dash.perMonth.filter((p) => p.income > 0).map((p) => p.income - p.spent);
    if (full.length >= 4) {
      const mean = full.reduce((a, v) => a + v, 0) / full.length;
      const sd = Math.sqrt(full.reduce((a, v) => a + (v - mean) ** 2, 0) / full.length);
      const cv = Math.abs(mean) > 1 ? sd / Math.abs(mean) : 2;
      parts.push({ id: 'stability', name: 'Cash-flow stability', score: clamp(100 - cv * 50), note: `Your monthly surplus has varied by about £${Math.round(sd).toLocaleString('en-GB')} around £${Math.round(mean).toLocaleString('en-GB')}.` });
    } else parts.push({ id: 'stability', name: 'Cash-flow stability', score: null, note: 'Needs at least four months with income.' });
  } else parts.push({ id: 'stability', name: 'Cash-flow stability', score: null, note: 'Needs at least four months of data.' });

  const scored = parts.filter((p) => p.score !== null);
  const score = scored.length ? Math.round(scored.reduce((a, p) => a + p.score, 0) / scored.length) : null;
  const label = score === null ? 'Not enough data yet' : score >= 75 ? 'Strong' : score >= 50 ? 'Steady' : 'Needs attention';
  return {
    score, label, parts,
    how: 'The score is the plain average of the parts that have enough data. Each part is scored 0 to 100 using the rule shown beside it. Nothing is weighted in secret, and parts without data are left out, not guessed.',
  };
}

// ================================================================ money owed to you
export function owedSummary(owed, today) {
  const rows = owed.map((o) => {
    const outstanding = Math.max(0, r2((Number(o.amount) || 0) - (Number(o.received) || 0)));
    const status = outstanding === 0 ? 'paid' : Number(o.received) > 0 ? 'partial' : o.expected && o.expected < today ? 'overdue' : 'owed';
    return { ...o, outstanding, status };
  });
  return { rows, outstanding: sum(rows, (r) => r.outstanding), count: rows.filter((r) => r.outstanding > 0).length };
}

// Pay someone's debt down with a received amount, oldest first. Returns the new list (the input is not changed).
export function reconcileOwed(owed, person, amount) {
  let left = Number(amount) || 0;
  return owed.map((o) => {
    if (o.person !== person || left <= 0) return o;
    const room = Math.max(0, (Number(o.amount) || 0) - (Number(o.received) || 0));
    const take = Math.min(room, left);
    left = r2(left - take);
    return take > 0 ? { ...o, received: r2((Number(o.received) || 0) + take) } : o;
  });
}
