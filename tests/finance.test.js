// Tests for the money engine, analytics and insights. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountsSummary, netWorthSeries, compound, goalForecast, suggestSurplus, effectiveBudgets, budgetStatus, safeSpend,
  planSummary, suggestPlan, calendarEvents, cashflow, scenario, healthScore, owedSummary, reconcileOwed, annualCost, recommendBudgets,
} from '../js/finance.js';
import { applyFilters, breakdown, detectRecurring, heatmap, weeklySeries, rollingAverage, comparisons, spikes, habits, spendKinds } from '../js/analytics.js';
import { insights, monthlyReview } from '../js/advice.js';
import { emptyData } from '../js/store.js';

const tx = (id, date, more) => ({ id, date, desc: 'Test Shop', amount: 10, direction: 'out', kind: 'spending', category: 'Groceries', account: 'Test Bank', source: 'csv', detail: 'Groceries', note: '', ...more });
function make(txs = [], more = {}) {
  const d = emptyData();
  d.settings.paydates = ['2026-01-10', '2026-02-09', '2026-03-11'];
  d.settings.categories = [{ name: 'Groceries' }, { name: 'Fun' }];
  d.settings.budgets = { Groceries: 100, Fun: 50 };
  d.transactions = txs;
  Object.assign(d, more);
  return d;
}

test('accounts: assets minus liabilities, and cards count as debt', () => {
  const s = accountsSummary([
    { id: 'a', type: 'current', balance: 500 }, { id: 'b', type: 'savings', balance: 1500 },
    { id: 'c', type: 'investment', balance: 4000 }, { id: 'd', type: 'credit', balance: 300 },
  ]);
  assert.deepEqual([s.assets, s.liabilities, s.netWorth, s.accessible, s.investments], [6000, 300, 5700, 2000, 4000]);
  assert.equal(s.allocation.length, 3);
});

test('net worth history says how much of each change was paid in versus growth', () => {
  const accounts = [{ id: 'i', type: 'investment', balance: 1300, name: 'ISA' }];
  const d = make([tx('1', '2026-01-15', { kind: 'invested', amount: 200 })], { accounts, snapshots: [{ id: 's', date: '2026-01-01', balances: { i: 1000 } }] });
  const pts = netWorthSeries(d, '2026-02-01');
  assert.equal(pts.length, 2);
  assert.deepEqual([pts[1].change, pts[1].contributions, pts[1].other], [300, 200, 100]);
});

test('compound growth is an estimate that grows with contributions', () => {
  assert.equal(compound(1000, 0, 0, 12)[12], 1000);
  assert.equal(compound(0, 100, 0, 12)[12], 1200);
  assert.ok(compound(1000, 100, 6, 12)[12] > 2200);
});

test('goal forecast: progress, projected date, required monthly and status', () => {
  const g = { balance: 400, target: 1000, monthly: 100, targetDate: '2026-12-01' };
  const f = goalForecast(g, '2026-06-01');
  assert.equal(f.remaining, 600);
  assert.equal(f.pct, 40);
  assert.equal(f.months, 6);
  assert.equal(f.projected, '2026-12-01');
  assert.equal(f.status, 'on-track');
  assert.equal(goalForecast({ ...g, monthly: 50 }, '2026-06-01').status, 'behind');
  assert.equal(goalForecast({ ...g, monthly: 0 }, '2026-06-01').status, 'stalled');
  assert.equal(goalForecast({ ...g, balance: 1000 }, '2026-06-01').status, 'done');
});

test('missed contributions recalculate the date automatically', () => {
  const on = goalForecast({ balance: 0, target: 600, monthly: 100 }, '2026-01-01');
  const missed = goalForecast({ balance: 0, target: 600, monthly: 100 }, '2026-01-01');
  assert.equal(on.months, missed.months);
  const later = goalForecast({ balance: 0, target: 600, monthly: 75 }, '2026-01-01');
  assert.ok(later.months > on.months);
});

test('surplus is shared across goals by priority', () => {
  const goals = [{ id: 'a', name: 'A', balance: 0, target: 1000, priority: 1 }, { id: 'b', name: 'B', balance: 0, target: 1000, priority: 3 }];
  const out = suggestSurplus(goals, 100, '2026-01-01');
  assert.ok(out[0].amount > out[1].amount);
  assert.ok(Math.abs(out[0].amount + out[1].amount - 100) < 0.05);
});

test('budgets: moves between budgets and rollover change what is available', () => {
  const d = make([tx('1', '2025-12-20', { amount: 30 })]);
  d.settings.paydates = ['2025-12-10', '2026-01-10', '2026-02-09'];
  d.settings.budgetAdjust = { '2026-01-10': { Groceries: -20, Fun: 20 } };
  let e = effectiveBudgets(d, '2026-01-15');
  assert.deepEqual([e.budgets.Groceries, e.budgets.Fun], [80, 70]);
  d.settings.rollover = true; // 70 left from December's £100 budget
  e = effectiveBudgets(d, '2026-01-15');
  assert.equal(e.budgets.Groceries, 150); // 100 - 20 + 70
});

test('budgets: expected pace and an end-of-cycle projection', () => {
  const d = make([tx('1', '2026-01-12', { amount: 60 })]);
  const s = budgetStatus(d, '2026-01-20'); // day 11 of 30
  const g = s.buckets.find((b) => b.name === 'Groceries');
  assert.equal(g.expected, 36.67);
  assert.equal(g.pace, 'fast');
  assert.equal(g.projected, 163.64);
  assert.equal(g.willExceed, true);
  assert.equal(s.willExceedTotal, true);
});

test('safe to spend comes off budgets, held-back bills, card payments due and your reserve', () => {
  const d = make([tx('1', '2026-01-12', { amount: 20 })], { accounts: [{ id: 'c', type: 'credit', name: 'Card', balance: 200, dueDay: 25, minPayment: 25 }] });
  d.settings.reserved = 10;
  const s = safeSpend(d, '2026-01-20');
  assert.equal(s.cards.length, 1);
  assert.equal(s.total, 95); // 130 left - 25 card - 10 reserve
  assert.equal(s.parts.length, 4);
});

test('the payday plan totals up, flags what is unallocated, and builds the salary flow', () => {
  const d = make();
  d.settings.plan = { salary: 2000, allocations: [{ id: '1', name: 'Rent', type: 'bills', amount: 800 }, { id: '2', name: 'ISA', type: 'investing', amount: 500 }] };
  const p = planSummary(d);
  assert.deepEqual([p.allocated, p.unallocated, p.over], [1300, 700, false]);
  assert.ok(p.links.some((l) => l.type === 'free' && l.value === 700));
  d.settings.plan.allocations.push({ id: '3', name: 'Big', type: 'spending', amount: 900 });
  assert.equal(planSummary(d).over, true);
  assert.ok(suggestPlan(d, '2026-01-20').allocations.some((a) => a.type === 'spending'));
});

test('calendar lists paydays, bills and card due dates for a month', () => {
  const d = make([], { accounts: [{ id: 'c', type: 'credit', name: 'Card', balance: 100, dueDay: 20, minPayment: 5 }] });
  d.settings.recurring = [{ id: 'r', name: 'Phone', amount: 10, day: 22, freq: 'monthly' }];
  const ev = calendarEvents(d, '2026-01');
  assert.deepEqual(ev.map((e) => e.type), ['payday', 'card', 'bill']);
  assert.equal(annualCost({ amount: 10, freq: 'monthly' }), 120);
});

test('cash-flow forecast: needs balances, then spots a shortfall', () => {
  assert.equal(cashflow(make(), '2026-01-20').available, false);
  const d = make([tx('1', '2025-12-20', { amount: 300 }), tx('2', '2025-11-20', { amount: 300 })], { accounts: [{ id: 'a', type: 'current', balance: 40, name: 'Current' }] });
  const cf = cashflow(d, '2026-01-20', 30);
  assert.equal(cf.available, true);
  assert.equal(cf.series.length, 31);
  assert.ok(cf.shortfall, 'a £40 balance with everyday spending should run out');
});

test('what-if: a new bill lowers cash flow, more saving moves a goal date', () => {
  const d = make([tx('1', '2025-12-05', { kind: 'income', direction: 'in', amount: 2000 }), tx('2', '2025-12-10', { amount: 500 })], {
    accounts: [{ id: 'a', type: 'current', balance: 1000, name: 'C' }], goals: [{ id: 'g', name: 'Goal', balance: 0, target: 1200, monthly: 100 }],
  });
  const s = scenario(d, '2026-01-20', { newBill: 100, save: 100 });
  assert.ok(s.changed.free < s.baseline.free);
  assert.equal(s.horizons.length, 5);
  assert.ok(s.horizons[0].deltaNetWorth < 0);
  assert.ok(s.goals[0].after < s.goals[0].before);
});

test('health score: explains itself, and leaves out parts with no data', () => {
  const h = healthScore(make(), '2026-01-20');
  assert.equal(h.score, null);
  assert.match(h.how, /plain average/);
  assert.ok(h.parts.every((p) => p.note.length > 0));
  const d = make([tx('1', '2026-01-12', { amount: 30 })], { goals: [{ id: 'e', name: 'Emergency', kind: 'emergency', balance: 300, target: 1000, monthly: 50 }] });
  const hs = healthScore(d, '2026-01-20');
  assert.ok(hs.parts.find((p) => p.id === 'budget').score === 100);
});

test('money owed: partial payments, and received money reconciles oldest first', () => {
  const owed = [{ id: '1', person: 'Sam', amount: 20, received: 0, date: '2026-01-01' }, { id: '2', person: 'Sam', amount: 30, received: 0, date: '2026-01-05' }];
  const next = reconcileOwed(owed, 'Sam', 35);
  assert.deepEqual(next.map((o) => o.received), [20, 15]);
  const s = owedSummary(next, '2026-02-01');
  assert.equal(s.outstanding, 15);
  assert.equal(s.rows[1].status, 'partial');
  assert.equal(owedSummary([{ amount: 10, received: 0, expected: '2026-01-01' }], '2026-02-01').rows[0].status, 'overdue');
});

test('recommended budgets come from your average spending in recent cycles', () => {
  const d = make([tx('1', '2025-12-15', { amount: 80 }), tx('2', '2026-01-15', { amount: 120 })]);
  d.settings.paydates = ['2025-12-10', '2026-01-10', '2026-02-09'];
  assert.equal(recommendBudgets(d, '2026-02-15', 2).Groceries, 100);
});

// ---- analytics ----
test('filters narrow by date, category, account, shop and type', () => {
  const d = make([tx('1', '2026-01-05', { detail: 'Fuel' }), tx('2', '2026-01-06', { account: 'Other' }), tx('3', '2026-02-06', { kind: 'income', direction: 'in' })]);
  assert.equal(applyFilters(d).length, 2);
  assert.equal(applyFilters(d, { categories: ['Fuel'] }).length, 1);
  assert.equal(applyFilters(d, { accounts: ['Other'] }).length, 1);
  assert.equal(applyFilters(d, { from: '2026-01-06' }).length, 1);
  assert.equal(applyFilters(d, { type: 'income' }).length, 1);
  assert.equal(applyFilters(d, { q: 'nomatch' }).length, 0);
});

test('breakdown ranks groups with totals, counts and shares', () => {
  const b = breakdown([tx('1', '2026-01-05', { amount: 30, detail: 'A' }), tx('2', '2026-01-06', { amount: 10, detail: 'B' }), tx('3', '2026-01-07', { amount: 10, detail: 'A' })], (t) => t.detail);
  assert.deepEqual(b.map((x) => [x.key, x.total, x.count, x.share]), [['A', 40, 2, 80], ['B', 10, 1, 20]]);
});

test('recurring payments are found from repeated amounts across months', () => {
  const list = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'].map((d, i) => tx(`r${i}`, d, { desc: 'Test Gym', amount: 29.95, detail: 'Gym membership' }));
  const d = make([...list, tx('x', '2026-02-10', { desc: 'One Off Shop', amount: 90 })]);
  const rec = detectRecurring(d);
  assert.equal(rec.length, 1);
  assert.equal(rec[0].amount, 29.95);
  const kinds = spendKinds(d, d.transactions);
  assert.equal(kinds.recurring.length, 4);
  assert.equal(kinds['one-off'].length, 1);
});

test('time series: weeks start on Monday, rolling averages, heatmap and month comparison', () => {
  const list = [tx('1', '2026-01-19', { amount: 70 }), tx('2', '2026-01-21', { amount: 30 })];
  const w = weeklySeries(list, '2026-01-21', 2);
  assert.deepEqual(w.map((x) => x.total), [0, 100]);
  assert.equal(rollingAverage(list, '2026-01-21', 10, 3).pop().value, 10);
  const hm = heatmap(list, '2026-01-21', 2);
  assert.equal(hm.max, 70);
  assert.equal(hm.cols.length, 2);
  const c = comparisons([tx('a', '2026-01-03', { amount: 10 }), tx('b', '2025-12-03', { amount: 20 })], '2026-01-10');
  assert.deepEqual([c.now, c.prev, c.vsPrevPct], [10, 20, -50]);
});

test('spikes flag unusually expensive days; habits total the small stuff', () => {
  const many = Array.from({ length: 40 }, (_, i) => tx(`s${i}`, `2025-12-${String((i % 28) + 1).padStart(2, '0')}`, { amount: 10 }));
  many.push(tx('big', '2026-01-02', { amount: 400 }));
  assert.equal(spikes(many, '2026-01-10')[0].date, '2026-01-02');
  const h = habits([tx('1', '2026-01-02', { amount: 3, detail: 'Energy drink' }), tx('2', '2026-01-03', { amount: 4, detail: 'Energy drink' })], ['2026-01']);
  assert.equal(h.find((x) => x.id === 'snacks').total, 7);
  assert.equal(h.find((x) => x.id === 'small').count, 2);
});

// ---- insights ----
test('insights are plain-worded and flag an overspent budget', () => {
  const d = make([tx('1', '2026-01-12', { amount: 130 }), tx('i', '2026-01-10', { kind: 'income', direction: 'in', amount: 2000 })]);
  const list = insights(d, '2026-01-20');
  assert.ok(list.some((i) => /over budget/.test(i.title)));
  assert.ok(list.every((i) => ['good', 'watch', 'act', 'info'].includes(i.level)));
  assert.equal(insights(make(), '2026-01-20')[0].level, 'info');
});

test('the monthly review summarises the last full month', () => {
  const d = make([
    tx('i1', '2025-12-05', { kind: 'income', direction: 'in', amount: 2000 }), tx('s1', '2025-12-06', { amount: 500 }),
    tx('i2', '2026-01-05', { kind: 'income', direction: 'in', amount: 2000 }), tx('s2', '2026-01-06', { amount: 300 }),
    tx('i3', '2026-02-05', { kind: 'income', direction: 'in', amount: 2000 }), tx('s3', '2026-02-06', { amount: 100 }),
  ]);
  const r = monthlyReview(d, '2026-02-20');
  assert.ok(r.label);
  assert.ok(r.lines[0].includes('earned'));
  assert.ok(Array.isArray(r.wins) && Array.isArray(r.improve));
  assert.equal(monthlyReview(make(), '2026-02-20'), null);
});
