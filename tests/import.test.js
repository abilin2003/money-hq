// Tests for duplicate detection, the import plan, and bringing across the old dashboard backup. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates } from '../js/dedupe.js';
import { buildImportPlan, commitImport, groupKey } from '../js/importer.js';
import { convertOldBackup, mergeOldBackup } from '../js/oldbackup.js';
import { defaultSettings, emptyData, migrate } from '../js/store.js';

const tx = (more = {}) => ({ id: 'x', date: '2026-03-02', desc: 'Test Cafe', amount: 4.5, direction: 'out', kind: 'spending', category: 'Fun', account: 'Ulster Bank', source: 'csv', ...more });

const ulster = (lines) => ['Date,Description,Type,Paid in (£),Paid out (£),Amount (£)', ...lines].join('\n');

test('the same purchase already saved is a duplicate, a different one is not', () => {
  const dup = findDuplicates([tx(), tx({ amount: 9 })], [tx()]);
  assert.deepEqual(dup, ['exact', false]);
});

test('two genuine identical purchases in one file are both kept', () => {
  assert.deepEqual(findDuplicates([tx(), tx()], []), [false, false]);
});

test('importing the same two identical purchases again marks both as already saved', () => {
  assert.deepEqual(findDuplicates([tx(), tx()], [tx(), tx()]).map(Boolean), [true, true]);
});

test('a Monzo transaction id matches exactly, even if the wording changed', () => {
  const dup = findDuplicates([tx({ account: 'Monzo', ref: 'tx_1', desc: 'Different Words' })], [tx({ account: 'Monzo', ref: 'tx_1' })]);
  assert.deepEqual(dup, ['exact']);
});

test('a hand-typed entry matches a bank line a day later, but a bank line never matches another bank line loosely', () => {
  const manual = tx({ source: 'manual', date: '2026-03-01', account: 'Revolut' });
  assert.deepEqual(findDuplicates([tx()], [manual]), ['loose']);
  assert.deepEqual(findDuplicates([tx()], [tx({ date: '2026-03-01' })]), [false]);
});

test('a hand-typed entry matches even if you typed a different account and your own wording', () => {
  const typed = tx({ source: 'manual', date: '2026-03-01', account: 'Revolut', desc: 'snacks', amount: 0.63 });
  const bankLine = tx({ date: '2026-03-02', account: 'Ulster Bank', desc: 'Eurospar Moira', amount: 0.63 });
  assert.deepEqual(findDuplicates([bankLine], [typed]), ['loose']);
  assert.deepEqual(findDuplicates([{ ...bankLine, date: '2026-03-09' }], [typed]), [false], 'too far apart');
  assert.deepEqual(findDuplicates([{ ...bankLine, amount: 0.64 }], [typed]), [false], 'different amount');
});

test('a move between your own accounts is never matched with a purchase you typed', () => {
  const typed = tx({ source: 'manual', desc: 'clothes', amount: 35 });
  assert.deepEqual(findDuplicates([tx({ desc: 'To Own Name', amount: 35, kind: 'internal' })], [typed]), [false]);
  assert.deepEqual(findDuplicates([tx({ desc: 'Some Shop', amount: 35, kind: 'spending' })], [typed]), ['loose']);
});

test('each typed entry is used up once, and the closest bank line wins', () => {
  const typed = tx({ source: 'manual', date: '2026-03-02', desc: 'Test Cafe', amount: 5 });
  const lines = [tx({ date: '2026-03-04', amount: 5, desc: 'Other Place' }), tx({ date: '2026-03-02', amount: 5, desc: 'Test Cafe', account: 'Revolut' })];
  assert.deepEqual(findDuplicates(lines, [typed]), [false, 'loose']);
});

test('the import plan sorts rows, spots duplicates and leaves transfers out', () => {
  const settings = { ...defaultSettings(), payerRules: [{ match: 'TEST EMPLOYER', label: 'income', category: 'Salary' }, { match: 'MY OWN NAME', label: 'internal', category: 'Own transfers' }] };
  const file = { name: 'ulster.csv', text: ulster(['2026-03-02,TEST CAFE 1234,Debit,,4.50,-4.50', '2026-03-01,TEST EMPLOYER LTD,Automated Credit,100.00,,100.00', '2026-03-01,TO MY OWN NAME,Mobile,,20.00,-20.00', '2026-03-03,ALREADY HERE,Debit,,1.00,-1.00']) };
  const plan = buildImportPlan([file], settings, [tx({ date: '2026-03-03', desc: 'Already Here', amount: 1 })]);
  assert.equal(plan.files[0].bank, 'Ulster Bank');
  assert.equal(plan.rows.length, 4);
  assert.deepEqual(plan.counts, { toImport: 3, auto: 2, check: 1, duplicates: 1, matchedByHand: 0, internal: 1 });
  const cafe = plan.rows.find((r) => r.desc === 'Test Cafe');
  assert.equal(cafe.status, 'review');
});

test('the same file twice in one batch only imports once', () => {
  const file = { name: 'a.csv', text: ulster(['2026-03-02,TEST CAFE,Debit,,4.50,-4.50']) };
  const plan = buildImportPlan([file, { ...file, name: 'b.csv' }], defaultSettings(), []);
  assert.deepEqual(plan.rows.map((r) => r.status), ['review', 'duplicate']);
});

test('a file that cannot be read is reported but does not stop the others', () => {
  const good = { name: 'good.csv', text: ulster(['2026-03-02,TEST CAFE,Debit,,4.50,-4.50']) };
  const plan = buildImportPlan([{ name: 'bad.csv', text: 'nonsense\n1' }, good], defaultSettings(), []);
  assert.match(plan.files[0].error, /couldn't tell which bank/);
  assert.equal(plan.rows.length, 1);
});

test('committing uses your choices, remembers them as rules, and leaves undecided rows as "unsure"', () => {
  const file = { name: 'u.csv', text: ulster(['2026-03-02,TEST CAFE,Debit,,4.50,-4.50', '2026-03-02,MYSTERY,Debit,,2.00,-2.00', '2026-03-03,TEST FRIEND,Credit,6.00,,6.00']) };
  const settings = defaultSettings();
  const plan = buildImportPlan([file], settings, []);
  const choices = { [groupKey({ direction: 'out', desc: 'Test Cafe' })]: { kind: 'spending', category: 'Fun' }, [groupKey({ direction: 'in', desc: 'Test Friend' })]: { kind: 'payback', category: '' } };
  const { transactions, merchantRules } = commitImport(plan, choices, settings, { tag: 'Trip' });
  assert.equal(transactions.length, 3);
  const byDesc = Object.fromEntries(transactions.map((t) => [t.desc, t]));
  assert.deepEqual([byDesc['Test Cafe'].kind, byDesc['Test Cafe'].category, byDesc['Test Cafe'].tag], ['spending', 'Fun', 'Trip']);
  assert.equal(byDesc.Mystery.kind, 'unsure');
  assert.equal(byDesc['Test Friend'].kind, 'payback');
  assert.deepEqual(merchantRules.test, { kind: 'spending', category: 'Fun' });
  assert.deepEqual(merchantRules['in:test'], { kind: 'payback', category: '' });
  assert.ok(transactions.every((t) => t.id && t.source === 'csv'));
  const saved = migrate({ ...emptyData(), transactions });
  assert.equal(saved.transactions.length, 3, 'imported transactions pass the data checks');
});

// ---- Old dashboard backup ----

const oldBackup = () => ({
  app: 'my-finance',
  version: 6,
  finS4: {
    cats: [{ n: 'Groceries', e: '🛒', c: '#4ade80' }, { n: 'Fun', e: '🎉', c: '#ffc94d' }],
    budgets: { Groceries: 100 },
    buffer: 50,
    paydates: ['2026-01-10', '2026-02-09'],
    rules: { tesco: { cat: 'Groceries' }, someone: { cat: '__skip' }, trading: { cat: 'Cash ISA (Trading 212)' } },
    recurring: [{ id: 1, name: 'Test sub', amount: 5, day: 3, freq: 'monthly', month: 0, cat: 'Fun', acct: 'Ulster Bank', match: 'testsub' }],
    quick: { pinned: ['tesco'], hidden: [] },
    pots: [{ name: 'Test pot', emoji: '💰', base: 0, target: 100, monthly: 10 }],
    isaBalance: 2,
  },
  finTXS4: [
    { date: '15/01/2026', desc: 'Test Mart', bucket: 'Groceries', amount: 10, bank: 'Ulster Bank' },
    { date: '16/01/2026', desc: 'Cash ISA', bucket: 'Cash ISA (Trading 212)', amount: 50, bank: 'Ulster Bank' },
    { date: '17/01/2026', desc: 'Card repay', bucket: 'Credit Card Repayment', amount: 20, bank: 'Ulster Bank' },
    { date: 'bad date', desc: 'Broken', bucket: 'Fun', amount: 1, bank: 'Revolut' },
  ],
  finHist4: [{ id: 'h1', label: 'January', start: '2026-01-10', end: '2026-02-08', transactions: [{ date: '20/01/2026', desc: 'Old Cafe', bucket: 'Fun', amount: 5, bank: 'Revolut', tag: 'Trip' }] }],
  finPots4: [{ pot: 'Test pot', type: 'in', amount: 10, date: '20/01/2026' }],
});

test('old backup: transactions become kinds and categories, bad rows are counted, nothing else is lost', () => {
  const c = convertOldBackup(oldBackup());
  assert.equal(c.transactions.length, 4);
  assert.equal(c.summary.skipped, 1);
  assert.equal(c.summary.current, 3);
  assert.equal(c.summary.closedTransactions, 1);
  const by = Object.fromEntries(c.transactions.map((t) => [t.desc, t]));
  assert.deepEqual([by['Test Mart'].kind, by['Test Mart'].category, by['Test Mart'].date, by['Test Mart'].direction], ['spending', 'Groceries', '2026-01-15', 'out']);
  assert.equal(by['Cash ISA'].kind, 'invested');
  assert.equal(by['Card repay'].kind, 'internal');
  assert.equal(by['Old Cafe'].tag, 'Trip');
  assert.ok(c.transactions.every((t) => t.source === 'old-backup'));
  assert.deepEqual(c.settings.paydates, ['2026-01-10', '2026-02-09']);
  assert.deepEqual(c.settings.merchantRules, { tesco: { kind: 'spending', category: 'Groceries' }, someone: { kind: 'internal', category: 'Transfer' }, trading: { kind: 'invested', category: 'Cash ISA (Trading 212)' } });
  assert.equal(c.settings.recurring[0].category, 'Fun');
  assert.equal(c.settings.potDefs[0].name, 'Test pot');
  assert.equal(c.settings.legacy.isaBalance, 2, 'settings not mapped yet are kept for later phases');
  assert.equal(c.closedMonths[0].label, 'January');
  assert.deepEqual(c.pots.map((p) => [p.pot, p.type, p.amount, p.date]), [['Test pot', 'in', 10, '2026-01-20']]);
});

test('old backup: merging adds everything once, and a second merge adds nothing', () => {
  const data = emptyData();
  const first = mergeOldBackup(data, convertOldBackup(oldBackup()));
  assert.deepEqual(first, { added: 4, duplicates: 0 });
  assert.equal(data.transactions.length, 4);
  assert.deepEqual(data.settings.paydates, ['2026-01-10', '2026-02-09']);
  assert.ok(data.settings.categories.some((c) => c.name === 'Groceries'));
  const second = mergeOldBackup(data, convertOldBackup(oldBackup()));
  assert.deepEqual(second, { added: 0, duplicates: 4 });
  assert.equal(data.transactions.length, 4);
  assert.equal(data.pots.length, 1);
  assert.equal(data.closedMonths.length, 1);
  assert.equal(migrate(data).transactions.length, 4, 'merged data passes the data checks');
});

test('old backup: merging never overwrites what you already have', () => {
  const data = emptyData();
  data.settings.budgets = { Groceries: 999 };
  data.settings.merchantRules = { tesco: { kind: 'spending', category: 'Fun' } };
  mergeOldBackup(data, convertOldBackup(oldBackup()));
  assert.equal(data.settings.budgets.Groceries, 999);
  assert.equal(data.settings.merchantRules.tesco.category, 'Fun');
});

test('old backup: a bank CSV line matching an old-dashboard entry is treated as already saved', () => {
  const data = emptyData();
  mergeOldBackup(data, convertOldBackup(oldBackup()));
  const file = { name: 'u.csv', text: ulster(['2026-01-15,TEST MART 9876,Debit,,10.00,-10.00']) };
  const plan = buildImportPlan([file], data.settings, data.transactions);
  assert.equal(plan.rows[0].status, 'duplicate');
});

test('old backup: files that are not old backups are refused', () => {
  assert.throws(() => convertOldBackup({ hello: 1 }), /old dashboard/);
  assert.throws(() => convertOldBackup(null), /old dashboard/);
});
