// Tests for the "Am I okay?" numbers. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleSummary, billDates } from '../js/insights.js';
import { periodFor } from '../js/paycycle.js';
import { emptyData } from '../js/store.js';

const tx = (id, more) => ({ id, date: '2026-01-15', desc: 'Test Shop', amount: 10, direction: 'out', kind: 'spending', category: 'Groceries', account: 'Test Bank', source: 'csv', ...more });

function sample(txs, settings = {}) {
  const d = emptyData();
  d.settings.paydates = ['2026-01-10', '2026-02-09'];
  d.settings.categories = [{ name: 'Groceries' }, { name: 'Fun' }];
  d.settings.budgets = { Groceries: 100, Fun: 50 };
  Object.assign(d.settings, settings);
  d.transactions = txs;
  return d;
}

test('safe to spend is what is left in the budgets, shared over the days until payday', () => {
  const s = cycleSummary(sample([tx('1', { amount: 30 }), tx('2', { category: 'Fun', amount: 20 })]), '2026-01-20');
  assert.equal(s.totals.net, 50);
  assert.equal(s.safe.total, 100); // (100 - 30) + (50 - 20)
  assert.equal(s.safe.days, 20); // today counts: 19 days left + today
  assert.equal(s.safe.perDay, 5);
  assert.equal(s.status.level, 'good');
});

test('friends paying back reduce the bucket they were for, and money between accounts is ignored', () => {
  const s = cycleSummary(sample([
    tx('1', { category: 'Fun', amount: 60 }),
    tx('2', { category: 'Fun', amount: 25, direction: 'in', kind: 'payback' }),
    tx('3', { kind: 'internal', amount: 500 }),
  ]), '2026-01-20');
  const fun = s.buckets.find((b) => b.name === 'Fun');
  assert.deepEqual([fun.spent, fun.back, fun.net, fun.left], [60, 25, 35, 15]);
  assert.equal(s.totals.net, 35);
});

test('one bucket over budget gives a calm "keep an eye" status, not an alarm', () => {
  const s = cycleSummary(sample([tx('1', { category: 'Fun', amount: 70 })]), '2026-01-20');
  assert.equal(s.status.level, 'watch');
  assert.match(s.status.headline, /Fun/);
  assert.equal(s.buckets.find((b) => b.name === 'Fun').over, 20);
  assert.ok(s.actions.some((a) => a.text.includes('Fun') && a.effect.includes('£20')));
});

test('a small overshoot in total stays calm (amber), never red', () => {
  // budgets total 150; spending 160 is about 7% over
  const s = cycleSummary(sample([tx('1', { amount: 100 }), tx('2', { category: 'Fun', amount: 60 })]), '2026-01-20');
  assert.equal(s.status.level, 'watch');
  assert.match(s.status.reason, /£10 over in total/);
});

test('overall clearly over the total budget (15% or more) needs a change', () => {
  const s = cycleSummary(sample([tx('1', { amount: 120 }), tx('2', { category: 'Fun', amount: 60 })]), '2026-01-20');
  assert.equal(s.status.level, 'act');
});

test('a bill due after the data stops is held back from safe to spend', () => {
  const d = sample([tx('1', { date: '2026-01-12', amount: 20 })], { recurring: [{ name: 'Test Phone', amount: 10, day: 18, freq: 'monthly' }, { name: 'Gym', amount: 30, day: 11, freq: 'monthly' }] });
  const s = cycleSummary(d, '2026-01-20');
  const phone = s.bills.find((b) => b.name === 'Test Phone');
  const gym = s.bills.find((b) => b.name === 'Gym');
  assert.equal(phone.unseen, true); // due 18 Jan, data stops 12 Jan
  assert.equal(gym.unseen, false); // due 11 Jan, already inside the data
  assert.equal(s.safe.billsHeldBack, 10);
  assert.equal(s.safe.total, 120); // left in budgets (80 + 50) minus the £10 bill not yet in the data
});

test('stale data is mentioned as the first thing to do', () => {
  const s = cycleSummary(sample([tx('1', { date: '2026-01-12' })]), '2026-01-20');
  assert.equal(s.staleDays, 8);
  assert.match(s.actions[0].text, /latest statements/);
});

test('billDates: a monthly bill lands once per cycle, and a yearly bill only in its month', () => {
  const p = periodFor('2026-02-20', ['2026-01-28', '2026-02-27']); // cycle: 28 Jan to 26 Feb
  assert.deepEqual(billDates({ day: 31, freq: 'monthly' }, p), ['2026-01-31']);
  assert.deepEqual(billDates({ day: 15, freq: 'monthly' }, p), ['2026-02-15']);
  assert.deepEqual(billDates({ day: 15, freq: 'yearly', month: 6 }, p), []);
  assert.deepEqual(billDates({ day: 15, freq: 'yearly', month: 2 }, p), ['2026-02-15']);
});

test('with no budgets set, it asks for them instead of inventing a status', () => {
  const d = sample([tx('1')], { budgets: {} });
  assert.match(cycleSummary(d, '2026-01-20').status.headline, /budgets/);
});

test('nothing in the cycle yet is handled calmly', () => {
  const s = cycleSummary(sample([]), '2026-01-20');
  assert.equal(s.through, null);
  assert.equal(s.safe.total, 150);
});
