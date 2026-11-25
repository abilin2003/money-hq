// Tests for importing a simple list (Date, Description, Amount, Account, Category, Note). All lines are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBankCsv, detectBank, parseCSV } from '../js/csv.js';
import { buildImportPlan, commitImport } from '../js/importer.js';
import { guessDetail } from '../js/detail.js';
import { defaultSettings } from '../js/store.js';

const list = [
  'Date,Description,Amount,Account,Category,Note',
  '2026-03-05,Test energy drink,-1.75,revolut,Fun,',
  '2026-03-05,Test supermarket,-12.40,Revolut,Groceries,',
  '2026-03-04,Test gym,-29.95,Ulster Bank,Essentials,Subscription',
  '2026-03-04,Test gym duplicate,-29.95,Ulster Bank,Essentials,Duplicate entry - exclude from actual spending',
  '2026-03-03,Test fuel,-50.00,Credit Card,Essentials,Paid with the card; do not count the repayment',
  '2026-03-02,Test ISA contribution,-500.00,Ulster Bank,S&S ISA (InvestEngine),Investment transfer; NOT spending',
  '2026-03-02,Test one-off ticket,-35.00,Ulster Bank,Needs a category,One-off; category not assigned',
  '2026-03-01,Test refund,4.00,Revolut,Fun,',
  'not-a-date,Test broken line,-1.00,Revolut,Fun,',
].join('\n');

test('a list with Date, Description, Amount and Account columns is recognised as a list', () => {
  assert.equal(detectBank(parseCSV(list)[0]), 'list');
  assert.equal(detectBank(parseCSV('Date,Description,Type,Paid in (£),Paid out (£),Amount (£)\n')[0]), 'ulster', 'a bank file is still a bank file');
});

test('each line becomes a row with the right account, direction, note and finer category', () => {
  const p = parseBankCsv(list);
  assert.equal(p.bank, 'list');
  const by = (d) => p.rows.find((r) => r.desc === d);
  assert.equal(by('Test energy drink').account, 'Revolut', 'revolut becomes Revolut');
  assert.deepEqual([by('Test energy drink').amount, by('Test energy drink').direction], [1.75, 'out']);
  assert.equal(by('Test energy drink').detail, 'Energy drink');
  assert.equal(by('Test gym').note, 'Subscription');
  assert.equal(by('Test fuel').account, 'Credit Card');
  assert.equal(by('Test refund').direction, 'in');
  assert.equal(by('Test ISA contribution').detail, 'ISA deposit');
});

test('a line marked as a duplicate is left out, and unreadable dates are counted, not guessed', () => {
  const p = parseBankCsv(list);
  assert.equal(p.rows.some((r) => r.desc === 'Test gym duplicate'), false);
  assert.equal(p.skipped, 1);
  assert.equal(p.unreadable, 1);
  assert.equal(p.rows.length, 7);
});

test('your own category wins: budgets are spending, an ISA is invested, an unknown category is left for you to decide', () => {
  const settings = { ...defaultSettings(), payerRules: [{ match: 'TEST', label: 'internal', category: 'Own transfers' }] }; // a rule that would otherwise catch everything
  const plan = buildImportPlan([{ name: 'list.csv', text: list }], settings, []);
  const row = (d) => plan.rows.find((r) => r.desc === d);
  assert.deepEqual([row('Test supermarket').kind, row('Test supermarket').category, row('Test supermarket').status], ['spending', 'Groceries', 'auto']);
  assert.deepEqual([row('Test ISA contribution').kind, row('Test ISA contribution').category], ['invested', 'S&S ISA (InvestEngine)']);
  assert.deepEqual([row('Test one-off ticket').kind, row('Test one-off ticket').status], ['unsure', 'review']);
  assert.equal(row('Test refund').kind, 'payback', 'money in against a budget is a payback');
  assert.equal(plan.counts.check, 1, 'only the line without a category needs a look');
});

test('the note and finer category are kept when the lines are saved, and importing the same list again adds nothing', () => {
  const settings = defaultSettings();
  const plan = buildImportPlan([{ name: 'list.csv', text: list }], settings, []);
  const { transactions } = commitImport(plan, {}, settings);
  const gym = transactions.find((t) => t.desc === 'Test gym');
  assert.equal(gym.note, 'Subscription');
  assert.equal(gym.detail, 'Gym membership');
  assert.equal(gym.account, 'Ulster Bank');
  const again = buildImportPlan([{ name: 'list.csv', text: list }], settings, transactions);
  assert.equal(again.counts.toImport, 0, 'every line is spotted as a duplicate');
});

test('finer categories come from the words in a description, most specific first', () => {
  const cases = { 'Energy drink and bar': 'Energy drink', 'Protein shake': 'Gym supplements', 'Creatine order': 'Gym supplements', 'Lidl groceries': 'Groceries', 'Work lunch - Tesco': 'Work food',
    'Cinema snacks': 'Snacks & drinks', 'Cinema ticket': 'Entertainment', 'Padel racquet purchase': 'Sport & fitness', 'Spotify': 'Subscriptions', 'Fuel - not on credit card': 'Fuel',
    'Dentist appointment': 'Health', 'Amazon - hair products': 'Personal care', 'Gift for someone': 'Gifts', 'Something unusual': '' };
  for (const [text, expected] of Object.entries(cases)) assert.equal(guessDetail(text), expected, text);
});
