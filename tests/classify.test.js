// Tests for deciding what each bank line is. All names are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRow, matchPayerRule, findMerchantRule } from '../js/classify.js';
import { defaultSettings } from '../js/store.js';

const settings = (extra = {}) => ({
  ...defaultSettings(),
  payerRules: [
    { match: 'TEST EMPLOYER', label: 'income', category: 'Salary' },
    { match: 'TEST ISA', label: 'internal', category: 'ISA withdrawal', direction: 'in' },
    { match: 'TEST CARD CO', label: 'unsure', category: 'Credit card' },
    { match: 'TEST FRIEND', label: 'payback', category: 'Friends' },
    { match: 'TEST DAD', label: 'payback', category: 'Family', confirm: true },
    { match: 'MY OWN NAME', label: 'internal', category: 'Own transfers' },
  ],
  merchantRules: { test: { kind: 'spending', category: 'Groceries' }, 'in:test refund': { kind: 'payback', category: 'Groceries' } },
  ...extra,
});
const row = (desc, direction = 'out', more = {}) => ({ desc, direction, amount: 10, date: '2026-03-01', account: 'Ulster Bank', ...more });

test('a payer rule marks salary as income', () => {
  const c = classifyRow(row('Test Employer Ltd', 'in'), settings());
  assert.deepEqual([c.kind, c.category, c.status], ['income', 'Salary', 'auto']);
});

test('income and payback rules do not apply to money going out', () => {
  assert.equal(matchPayerRule(row('Test Friend', 'out'), settings().payerRules), null);
  assert.equal(matchPayerRule(row('Test Friend', 'in'), settings().payerRules).label, 'payback');
});

test('a rule with a direction only applies that way round', () => {
  assert.equal(classifyRow(row('Test ISA UK Ltd', 'in'), settings()).kind, 'internal');
  assert.notEqual(classifyRow(row('Test ISA UK Ltd', 'out'), settings()).kind, 'internal');
});

test('"unsure" rules always go to review, and "confirm" rules are only suggestions', () => {
  const unsure = classifyRow(row('Test Card Co', 'in'), settings());
  assert.deepEqual([unsure.kind, unsure.status], ['unsure', 'review']);
  const dad = classifyRow(row('Test Dad', 'in'), settings());
  assert.deepEqual([dad.kind, dad.category, dad.status], ['payback', 'Family', 'suggested']);
});

test('moves to your own name are internal in either direction', () => {
  assert.equal(classifyRow(row('To My Own Name', 'out'), settings()).kind, 'internal');
  assert.equal(classifyRow(row('Payment from MY OWN NAME', 'in'), settings()).kind, 'internal');
});

test('bank transfer flags and pocket wording are internal without any rule', () => {
  assert.equal(classifyRow(row('Test Pot', 'out', { internalHint: 'Pot transfer' }), settings()).kind, 'internal');
  assert.equal(classifyRow(row('Pocket Withdrawal', 'in'), settings()).kind, 'internal');
  assert.equal(classifyRow(row('Exchanged to EUR', 'out'), settings()).kind, 'internal');
});

test('a learned shop rule sorts spending automatically', () => {
  const c = classifyRow(row('Test Store 42'), settings());
  assert.deepEqual([c.kind, c.category, c.status], ['spending', 'Groceries', 'auto']);
});

test('a shop rule on money coming in suggests a refund, and a direction-specific rule wins', () => {
  const refund = classifyRow(row('Test Store', 'in'), settings({ merchantRules: { test: { kind: 'spending', category: 'Groceries' } } }));
  assert.deepEqual([refund.kind, refund.status], ['payback', 'suggested']);
  const found = findMerchantRule('Test Refund', settings().merchantRules, 'in');
  assert.equal(found.directional, true);
});

test('money out to an investment account is invested, not spending', () => {
  const c = classifyRow(row('Trading 212 Top Up'), settings());
  assert.deepEqual([c.kind, c.category], ['invested', 'Cash ISA (Trading 212)']);
});

test("the bank's own category gives a suggestion, but only for categories you have", () => {
  const c = classifyRow(row('Unknown Place', 'out', { bankCategory: 'Eating out' }), settings({ merchantRules: {} }));
  assert.deepEqual([c.kind, c.category, c.status], ['spending', 'Fun', 'suggested']);
  const none = classifyRow(row('Unknown Place', 'out', { bankCategory: 'Eating out' }), settings({ merchantRules: {}, categories: [] }));
  assert.equal(none.status, 'review');
});

test('anything else needs a decision and is not counted until you make one', () => {
  const c = classifyRow(row('Mystery Payment'), settings({ merchantRules: {} }));
  assert.deepEqual([c.kind, c.status], ['unsure', 'review']);
});
