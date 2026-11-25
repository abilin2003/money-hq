// Tests for keeping an old dashboard's closed months as headline totals. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseOldHistory, mergeHistory } from '../js/oldbackup.js';
import { emptyData, migrate } from '../js/store.js';

const oldBackup = () => ({
  finS4: { cats: [{ n: 'Groceries' }, { n: 'Fun' }], paydates: ['2026-01-10', '2026-02-09', '2026-03-11'], income: 2000 },
  finTXS4: [],
  finPots4: [],
  finHist4: [
    { id: 'h1', label: 'February 2026 (a misleading name)', transactions: [
      { date: '15/01/2026', desc: 'Test shop', bucket: 'Groceries', amount: 10 },
      { date: '20/01/2026', desc: 'Test arcade', bucket: 'Fun', amount: 5.5 },
      { date: '21/01/2026', desc: 'Cash ISA', bucket: 'Cash ISA (Trading 212)', amount: 100 },
      { date: '22/01/2026', desc: 'Pot', bucket: 'Holiday Pot', amount: 20 },
      { date: '23/01/2026', desc: 'Back out', bucket: 'Cash ISA withdrawal', amount: 50 },
      { date: '24/01/2026', desc: 'Card', bucket: 'Credit Card Repayment', amount: 30 },
    ] },
    { id: 'h2', label: 'Empty', transactions: [] },
  ],
});

test('each closed month becomes one cycle with headline totals, and the real dates come from your paydays', () => {
  const out = summariseOldHistory(oldBackup());
  assert.equal(out.length, 1, 'a month with nothing in it is skipped');
  const c = out[0];
  assert.deepEqual([c.start, c.end], ['2026-01-10', '2026-02-08'], 'the label said February, the spending says the January 10 cycle');
  assert.deepEqual(c.spent, { Groceries: 10, Fun: 5.5 });
  assert.equal(c.spentTotal, 15.5);
  assert.equal(c.invested, 100);
  assert.equal(c.saved, 20);
  assert.equal(c.withdrawn, 50);
  assert.equal(c.plannedIncome, 2000);
  assert.equal(c.txCount, 6);
});

test('card repayments and transfers are not counted as spending, and no individual transactions are kept', () => {
  const c = summariseOldHistory(oldBackup())[0];
  assert.ok(!('transactions' in c));
  assert.ok(!JSON.stringify(c).includes('Test shop'), 'shop names are not kept');
  assert.equal(c.spentTotal + c.invested + c.saved + c.withdrawn, 185.5, 'the £30 card repayment is left out of everything');
});

test('adding history twice changes nothing the second time', () => {
  const d = emptyData();
  const entries = summariseOldHistory(oldBackup());
  assert.equal(mergeHistory(d, entries), 1);
  assert.equal(mergeHistory(d, entries), 0);
  assert.equal(d.history.length, 1);
  assert.doesNotThrow(() => migrate(d), 'saved history passes the data checks');
});

test('a file that is not an old dashboard backup is refused with a plain message', () => {
  assert.throws(() => summariseOldHistory({ hello: 'world' }), /old dashboard/);
  assert.throws(() => summariseOldHistory(null), /old dashboard/);
});
