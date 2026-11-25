// Tests for pay cycles, favourite tiles and list filtering. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodFor, inPeriod } from '../js/paycycle.js';
import { quickTiles } from '../js/quick.js';
import { filterTransactions, summarise } from '../js/txfilter.js';
import { addDays, addMonths, dayDiff } from '../js/money.js';

const paydates = ['2026-01-10', '2026-02-09'];

test('date maths: adding days and months, and clamping to the end of a short month', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-10', -1), '2025-12-10');
  assert.equal(dayDiff('2026-01-10', '2026-01-20'), 10);
});

test('a pay cycle runs from payday to the day before the next payday', () => {
  const p = periodFor('2026-01-20', paydates);
  assert.deepEqual([p.start, p.end, p.next, p.missing], ['2026-01-10', '2026-02-08', '2026-02-09', false]);
  assert.deepEqual([p.totalDays, p.dayNumber, p.daysLeft], [30, 11, 19]);
  assert.equal(inPeriod('2026-02-08', p), true);
  assert.equal(inPeriod('2026-02-09', p), false);
});

test('when the next payday has not been entered, the cycle is a month long and flagged', () => {
  const p = periodFor('2026-02-20', paydates);
  assert.deepEqual([p.start, p.end, p.missing], ['2026-02-09', '2026-03-08', true]);
});

test('before the first entered payday the cycle is the month before it', () => {
  const p = periodFor('2026-01-05', paydates);
  assert.deepEqual([p.start, p.end], ['2025-12-10', '2026-01-09']);
});

const tx = (id, more) => ({ id, date: '2026-01-15', desc: 'Test Shop', amount: 10, direction: 'out', kind: 'spending', category: 'Groceries', account: 'Ulster Bank', source: 'csv', ...more });
const list = [
  tx('1', { desc: 'Test Mart', date: '2026-01-12', amount: 10 }),
  tx('2', { desc: 'Test Mart', date: '2026-01-20', amount: 12 }),
  tx('3', { desc: 'Test Cafe', date: '2026-01-21', category: 'Fun', account: 'Revolut', amount: 4, tag: 'Trip' }),
  tx('4', { desc: 'Test Employer', date: '2026-01-25', direction: 'in', kind: 'income', category: 'Salary', amount: 1000 }),
  tx('5', { desc: 'Own Move', date: '2026-01-26', kind: 'internal', amount: 50 }),
  tx('6', { desc: 'Mystery', date: '2026-02-12', kind: 'unsure', category: '', amount: 3 }),
  tx('7', { desc: 'Test Friend', date: '2026-01-27', direction: 'in', kind: 'payback', category: '', amount: 5 }),
  tx('8', { desc: 'Test Cafe', date: '2025-12-01', category: 'Fun', amount: 6 }),
];

test('favourite tiles: usual amount is the latest, most used come first, pinned beat everything, hidden are gone', () => {
  const tiles = quickTiles(list, {}, '2026-02-15');
  assert.equal(tiles[0].key, 'test'); // all "Test ..." shops share a key
  const byName = quickTiles([tx('a', { desc: 'Alpha', date: '2026-01-01', amount: 5 }), tx('b', { desc: 'Alpha', date: '2026-01-05', amount: 7 }), tx('c', { desc: 'Beta', date: '2026-01-03', amount: 9 })], {}, '2026-06-01');
  assert.deepEqual(byName.map((t) => [t.key, t.amount, t.n]), [['alpha', 7, 2], ['beta', 9, 1]]);
  assert.equal(quickTiles([tx('a', { desc: 'Alpha' }), tx('c', { desc: 'Beta' })], { pinned: ['beta'] }, '2026-06-01')[0].key, 'beta');
  assert.equal(quickTiles([tx('a', { desc: 'Alpha' }), tx('c', { desc: 'Beta' })], { hidden: ['alpha'] }, '2026-06-01').length, 1);
  assert.equal(quickTiles([tx('a', { desc: 'Alpha', category: 'Uncategorised' })], {}, '2026-06-01').length, 0);
  assert.equal(quickTiles([tx('a', { desc: 'Alpha', kind: 'internal' })], {}, '2026-06-01').length, 0);
});

test('list filters: search, category, account, kind, tag and dates all narrow the list', () => {
  const ctx = { today: '2026-01-22', paydates };
  const ids = (f) => filterTransactions(list, f, ctx).map((t) => t.id);
  assert.deepEqual(ids({}), ['6', '7', '5', '4', '3', '2', '1', '8']);
  assert.deepEqual(ids({ q: 'mart' }), ['2', '1']);
  assert.deepEqual(ids({ category: 'Fun' }), ['3', '8']);
  assert.deepEqual(ids({ account: 'Revolut' }), ['3']);
  assert.deepEqual(ids({ kind: 'unsure' }), ['6']);
  assert.deepEqual(ids({ tag: 'Trip' }), ['3']);
  assert.deepEqual(ids({ period: 'cycle' }), ['7', '5', '4', '3', '2', '1']);
  assert.deepEqual(ids({ period: 'custom', from: '2026-01-20', to: '2026-01-25' }), ['4', '3', '2']);
});

test('list filters: results are newest first', () => {
  const dates = filterTransactions(list, {}, { today: '2026-01-22', paydates }).map((t) => t.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('list totals leave out internal transfers and unsure lines', () => {
  const s = summarise(list);
  assert.deepEqual(s, { count: 8, spent: 32, paidBack: 5, income: 1000, invested: 0, internal: 1, unsure: 1 });
});

test('a pay cycle is named after the month it ends in, and cycles list newest first', async () => {
  const { cycleName, cycleList } = await import('../js/paycycle.js');
  const paydates = ['2026-09-24', '2026-10-26', '2026-11-24'];
  assert.equal(cycleName(periodFor('2026-11-10', paydates)), 'November'); // 26 Oct to 23 Nov
  const list = cycleList(paydates, '2026-10-26', '2026-11-24');
  assert.deepEqual(list.map((p) => p.name), ['December', 'November']);
});
