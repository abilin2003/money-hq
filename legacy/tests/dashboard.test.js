// Tests for the Dashboard numbers. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardSummary, monthRange, fullMonths, overviewSeries } from '../js/dashboard.js';
import { emptyData } from '../js/store.js';

const tx = (id, date, more) => ({ id, date, desc: 'Test', amount: 10, direction: 'out', kind: 'spending', category: 'Groceries', account: 'Test Bank', source: 'csv', detail: '', note: '', ...more });
const make = (txs, settings = {}) => { const d = emptyData(); d.transactions = txs; Object.assign(d.settings, settings); return d; };

test('monthRange lists every month between two months, across a year end', () => {
  assert.deepEqual(monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('the newest month is left out of averages unless the data reaches its last days', () => {
  assert.deepEqual(fullMonths(['2026-09', '2026-10', '2026-11'], '2026-11-18'), ['2026-09', '2026-10']);
  assert.deepEqual(fullMonths(['2026-09', '2026-10', '2026-11'], '2026-11-29'), ['2026-09', '2026-10', '2026-11']);
});

test('averages use full months only, and friends paying back reduce spending, not income', () => {
  const d = make([
    tx('1', '2026-01-05', { kind: 'income', direction: 'in', amount: 2000 }),
    tx('2', '2026-02-05', { kind: 'income', direction: 'in', amount: 2000 }),
    tx('3', '2026-01-10', { amount: 300 }),
    tx('4', '2026-01-12', { kind: 'payback', direction: 'in', amount: 100 }),
    tx('5', '2026-02-10', { amount: 100 }),
    tx('6', '2026-02-11', { kind: 'invested', amount: 500 }),
    tx('7', '2026-03-02', { amount: 999 }), // March is only just started: must not drag the averages
  ]);
  const s = dashboardSummary(d);
  assert.equal(s.fullMonths, 2);
  assert.equal(s.cards.avgIncome, 2000);
  assert.equal(s.cards.avgSpend, 150); // Jan 300-100 = 200, Feb 100 -> average 150
  assert.equal(s.cards.avgInvested, 250);
  assert.equal(s.cards.investedShare, 13); // 250 / 2000
  assert.equal(s.perMonth.find((m) => m.month === '2026-01').paidBack, 100);
});

test('a month the data only starts part-way through is not a full month, so six days is never called an average month', () => {
  assert.deepEqual(fullMonths(['2026-10', '2026-11'], '2026-11-30', '2026-10-26'), ['2026-11'], 'data began on the 26th');
  assert.deepEqual(fullMonths(['2026-10', '2026-11'], '2026-11-30', '2026-10-03'), ['2026-10', '2026-11'], 'data began in the first week');
  assert.deepEqual(fullMonths(['2026-10', '2026-11'], '2026-11-22', '2026-10-26'), [], 'neither month is covered');
});

test('with no full month yet, averages are scaled from the days the data actually covers', () => {
  // 28 days of data (26 Oct to 22 Nov): £100 spent in the 6 days of October, £600 in November so far.
  const d = make([
    tx('1', '2026-10-26', { kind: 'income', direction: 'in', amount: 2000 }),
    tx('2', '2026-10-28', { amount: 100 }),
    tx('3', '2026-11-10', { amount: 600 }),
    tx('4', '2026-11-22', { amount: 0.01 }),
  ]);
  const s = dashboardSummary(d);
  assert.equal(s.basis, 'span');
  assert.equal(s.basisDays, 28);
  assert.equal(s.fullMonths, 0);
  // £700 over 28 days is about £761 a month, nowhere near the £100 that a naive "October" average would give.
  assert.ok(s.cards.avgSpend > 750 && s.cards.avgSpend < 770, `monthly pace was ${s.cards.avgSpend}`);
  assert.ok(s.cards.avgIncome > 2150 && s.cards.avgIncome < 2200);
});

test('once a full month exists, averages use full months and say so', () => {
  const d = make([tx('1', '2026-01-02', { amount: 300 }), tx('2', '2026-02-02', { amount: 100 }), tx('3', '2026-02-27', { amount: 1 })]);
  const s = dashboardSummary(d);
  assert.equal(s.basis, 'months');
  assert.deepEqual(s.fullList, ['2026-01', '2026-02']);
});

test('internal moves and undecided lines are left out of every figure', () => {
  const d = make([
    tx('1', '2026-01-05', { kind: 'internal', amount: 5000 }),
    tx('2', '2026-01-06', { kind: 'unsure', amount: 700 }),
    tx('3', '2026-01-07', { amount: 40 }),
  ]);
  const s = dashboardSummary(d);
  assert.equal(s.perMonth[0].spent, 40);
  assert.equal(s.coverage.internal, 1);
  assert.equal(s.coverage.unsure, 1);
});

test('the account filter narrows every figure', () => {
  const d = make([tx('1', '2026-01-07', { amount: 40, account: 'Ulster Bank' }), tx('2', '2026-01-08', { amount: 60, account: 'Revolut' })]);
  assert.equal(dashboardSummary(d, { accounts: ['Revolut'] }).perMonth[0].spent, 60);
  assert.equal(dashboardSummary(d).perMonth[0].spent, 100);
});

test('the month range narrows the figures, and is clamped to the months that exist', () => {
  const d = make([tx('1', '2026-01-07', { amount: 40 }), tx('2', '2026-02-08', { amount: 60 }), tx('3', '2026-03-09', { amount: 80 })]);
  const s = dashboardSummary(d, { from: '2026-02', to: '2026-03' });
  assert.deepEqual(s.months, ['2026-02', '2026-03']);
  assert.equal(dashboardSummary(d, { from: '2020-01', to: '2030-01' }).months.length, 3);
});

test('the picked category totals the last 12 months, and subscriptions are averaged', () => {
  const d = make([
    tx('1', '2026-01-05', { amount: 500, detail: 'Travel' }),
    tx('2', '2026-01-06', { amount: 10, detail: 'Subscriptions' }),
    tx('3', '2026-02-06', { amount: 10, detail: 'Subscriptions' }),
    tx('4', '2026-03-01', { amount: 1 }),
  ]);
  const s = dashboardSummary(d, { pick: 'Travel' });
  assert.equal(s.cards.pickTotal, 500);
  assert.equal(s.cards.subsPerMonth, 10); // £20 over 2 full months
  assert.ok(s.cards.pickOptions.includes('Subscriptions'));
});

test('fixed bills add up your monthly bills only', () => {
  const d = make([tx('1', '2026-01-05')], { recurring: [{ amount: 10, freq: 'monthly' }, { amount: 30, freq: 'monthly' }, { amount: 100, freq: 'yearly' }] });
  assert.equal(dashboardSummary(d).cards.fixedBills, 40);
});

test('no transactions is handled calmly', () => {
  assert.equal(dashboardSummary(make([])).empty, true);
});

// ---- chart numbers ----
const cat = (id, date, detail, amount, more) => tx(id, date, { detail, amount, ...more });

test('chart categories: the biggest few get their own bar, the rest are grouped, people are merged', () => {
  const d = make([
    cat('1', '2026-01-05', 'Groceries', 300),
    cat('2', '2026-01-06', 'Fuel', 100),
    cat('3', '2026-01-07', 'Friends', 30),
    cat('4', '2026-01-08', 'Partner', 20),
    cat('5', '2026-01-09', 'Shopping', 5),
    cat('6', '2026-02-05', 'Groceries', 200),
    tx('7', '2026-01-10', { kind: 'invested', amount: 999, detail: 'ISA deposit' }),
    tx('8', '2026-01-11', { kind: 'internal', amount: 888, detail: 'Own transfers' }),
  ]);
  const o = overviewSeries(d, {}, 2);
  assert.deepEqual(o.spend.series.map((s) => s.name), ['Groceries', 'Fuel', 'Everything else']);
  assert.deepEqual(o.spend.series[0].values, [300, 200]);
  assert.equal(o.spend.series[2].total, 55); // Friends & family 50 + Shopping 5
  assert.equal(o.spend.grand, 655); // investing and internal moves are not in it
  assert.match(o.spend.takeaway, /Groceries is your biggest category: £500/);
});

test('chart categories: money sent to people is one net bar, so it cannot look like your biggest spend', () => {
  const d = make([
    cat('1', '2026-01-05', 'Friends', 300),
    cat('2', '2026-01-06', 'Family (mum)', 100),
    tx('3', '2026-01-07', { kind: 'payback', direction: 'in', amount: 350, detail: 'Friends' }),
    cat('4', '2026-01-08', 'Groceries', 120),
  ]);
  const o = overviewSeries(d, {}, 7);
  const people = o.spend.series.find((s) => s.name === 'Friends & family (net)');
  assert.equal(people.total, 50); // 400 sent - 350 paid back
  assert.match(o.spend.takeaway, /Groceries is your biggest category/);
});

test('chart categories: paybacks bigger than what you sent never make a bar go negative', () => {
  const d = make([cat('1', '2026-01-05', 'Friends', 10), tx('2', '2026-01-07', { kind: 'payback', direction: 'in', amount: 50, detail: 'Friends' }), cat('3', '2026-01-08', 'Fuel', 5)]);
  const o = overviewSeries(d, {}, 7);
  assert.deepEqual(o.spend.series.map((s) => s.name), ['Fuel']);
});

test('money chart lines up with the headline cards, and the takeaway counts months under budget', () => {
  const d = make([
    tx('1', '2026-01-05', { kind: 'income', direction: 'in', amount: 2000 }),
    tx('2', '2026-02-05', { kind: 'income', direction: 'in', amount: 2000 }),
    cat('3', '2026-01-10', 'Groceries', 500),
    cat('4', '2026-02-10', 'Groceries', 2500),
    tx('5', '2026-02-11', { kind: 'payback', direction: 'in', amount: 100 }),
  ]);
  const o = overviewSeries(d);
  assert.deepEqual(o.money.income, [2000, 2000]);
  assert.deepEqual(o.money.spent, [500, 2400]); // February: 2500 - 100 paid back
  assert.deepEqual(o.money.back, [0, 100]);
  assert.match(o.money.takeaway, /less than you earned in 1 of 2 months/);
});

test('chart numbers follow the filters', () => {
  const d = make([cat('1', '2026-01-05', 'Groceries', 10, { account: 'Ulster Bank' }), cat('2', '2026-01-06', 'Fuel', 90, { account: 'Revolut' })]);
  const o = overviewSeries(d, { accounts: ['Ulster Bank'] });
  assert.deepEqual(o.spend.series.map((s) => s.name), ['Groceries']);
});
