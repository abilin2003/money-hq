// Tests for reading bank files. All names and amounts are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBankCsv, detectBank, parseCSV } from '../js/csv.js';
import { parseDate, parseAmount, cleanName, merchantKey } from '../js/money.js';

const ulster = [
  'Date,Description,Type,Paid in (£),Paid out (£),Amount (£)',
  '2026-03-02,TEST CAFE 1234,Debit Card Transaction,,4.50,-4.50',
  '2026-03-01,TEST EMPLOYER LTD,Automated Credit,"1,000.00",,"1,000.00"',
  '2026-03-01,,Direct Debit,,,',
].join('\n');

const monzoHeader = ['Transaction ID', 'Date', 'Time', 'Type', 'Name', 'Emoji', 'Category', 'Amount', 'Currency', 'Local amount', 'Local currency', 'Notes and #tags', 'Address', 'Receipt', 'Description', 'Category split', 'Money Out', 'Money In'];
const monzoRow = (id, date, type, name, category, amount) =>
  [id, date, '10:00:00', type, name, '', category, amount, 'GBP', amount, 'GBP', '', '', '', '', '', amount < 0 ? -amount : '', amount > 0 ? amount : ''].join(',');
const monzo = [
  monzoHeader.join(','),
  monzoRow('tx_1', '02/03/2026', 'Card payment', 'Test Shop', 'Groceries', -12.34),
  monzoRow('tx_2', '03/03/2026', 'Pot transfer', 'Test Pot', 'Savings', -20),
  monzoRow('tx_3', '04/03/2026', 'Faster payment', 'Test Friend', 'General', 7.5),
].join('\n');

const revolutHeader = 'Date,Description,Money out (GBP),Money in (GBP),Balance (GBP),Details,Section,Institution,PDF page';
const revolut = [
  revolutHeader,
  '2026-03-02,Test Diner,10.41,,100.00,"Fee: £0.10   £10.31 | To: Test Diner, Dublin | Card: 1234",Account,Test Bank Ltd,1',
  '2026-03-03,Pocket Withdrawal,,25.00,125.00,,Account,Test Bank Ltd,1',
  '2026-03-04,To pocket GBP Fun,30.00,,95.00,,Personal and Group Pockets,Test Bank Ltd,2',
  '2026-03-05,Test Salary,,500.00,595.00,Reference: Pay,Account,Test Bank Ltd,2',
].join('\n');

test('parseDate reads UK, ISO and word dates, and rejects nonsense', () => {
  assert.equal(parseDate('20/11/2025'), '2025-11-20');
  assert.equal(parseDate('2026-03-02'), '2026-03-02');
  assert.equal(parseDate('2 Mar 2026'), '2026-03-02');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('hello'), null);
});

test('parseAmount copes with pounds signs, commas and brackets', () => {
  assert.equal(parseAmount('£1,234.50'), 1234.5);
  assert.equal(parseAmount('-5'), -5);
  assert.equal(parseAmount('(12.00)'), -12);
  assert.ok(Number.isNaN(parseAmount('')));
});

test('cleanName and merchantKey tidy bank wording', () => {
  assert.equal(cleanName('TEST CAFE 1234'), 'Test Cafe');
  assert.equal(cleanName("MCDONALD'S"), "Mcdonald's");
  assert.equal(merchantKey('Transfer to Test Person'), 'test');
});

test('parseCSV handles quotes, commas inside quotes and Windows line endings', () => {
  const rows = parseCSV('﻿a,b\r\n"x, y",2\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', '2']]);
});

test('Ulster Bank: detects the bank, reads money out and money in, skips empty lines', () => {
  assert.equal(detectBank(ulster.split('\n')[0].split(',')), 'ulster');
  const r = parseBankCsv(ulster);
  assert.equal(r.account, 'Ulster Bank');
  assert.equal(r.rows.length, 2);
  assert.equal(r.skipped, 1);
  assert.deepEqual(
    r.rows.map((x) => [x.date, x.desc, x.amount, x.direction]),
    [['2026-03-02', 'Test Cafe', 4.5, 'out'], ['2026-03-01', 'Test Employer Ltd', 1000, 'in']],
  );
  assert.equal(r.rows[1].type, 'Automated Credit');
});

test('Monzo: reads money in and out, keeps the transaction id, flags pot transfers', () => {
  const r = parseBankCsv(monzo);
  assert.equal(r.account, 'Monzo');
  assert.equal(r.rows.length, 3);
  const [shop, pot, friend] = r.rows;
  assert.deepEqual([shop.date, shop.amount, shop.direction, shop.ref, shop.bankCategory], ['2026-03-02', 12.34, 'out', 'tx_1', 'Groceries']);
  assert.equal(pot.internalHint, 'Pot transfer');
  assert.deepEqual([friend.amount, friend.direction], [7.5, 'in']);
});

test('Revolut statement: does not add the fee again, flags pocket moves', () => {
  const r = parseBankCsv(revolut);
  assert.equal(r.account, 'Revolut');
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[0].amount, 10.41, 'the Money out figure already includes the fee');
  assert.equal(r.rows[0].direction, 'out');
  assert.equal(r.rows[1].direction, 'in');
  assert.equal(r.rows[2].internalHint, 'Pocket move');
  assert.equal(r.rows[3].amount, 500);
  assert.equal(JSON.stringify(r.rows).includes('1234'), false, 'card numbers from the Details column are never kept');
});

test('older Revolut export: adds the separate fee and skips declined payments', () => {
  const classic = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'CARD_PAYMENT,Current,2026-03-02 10:00:00,2026-03-02 10:00:05,Test Diner,-10.00,0.10,GBP,COMPLETED,50',
    'CARD_PAYMENT,Current,2026-03-03 10:00:00,2026-03-03 10:00:05,Test Declined,-5.00,0.00,GBP,DECLINED,50',
  ].join('\n');
  const r = parseBankCsv(classic);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].amount, 10.1);
});

test('a file from an unknown bank is refused with a clear message', () => {
  assert.throws(() => parseBankCsv('foo,bar\n1,2'), /couldn't tell which bank/);
  assert.throws(() => parseBankCsv('only a header'), /no transactions/);
});

test('lines with an unreadable date are counted, not guessed', () => {
  const bad = ['Date,Description,Type,Paid in (£),Paid out (£),Amount (£)', 'not a date,Test,Debit,,1.00,-1.00'].join('\n');
  const r = parseBankCsv(bad);
  assert.equal(r.rows.length, 0);
  assert.equal(r.unreadable, 1);
});
