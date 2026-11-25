// Importing bank files. All data here is made up.
import { describe, it, expect } from 'vitest';
import { parseBankFile, detectBank } from '../../src/lib/import/parse.js';
import { classify, prepareRules } from '../../src/lib/import/classify.js';
import { buildImportPlan, pairTransfers } from '../../src/lib/import/plan.js';
import { mapCategory, CATEGORIES } from '../../src/lib/categories.js';
import { addFingerprints } from '../../src/lib/fingerprint.js';

const ULSTER = 'Date,Description,Type,Paid in (£),Paid out (£),Amount (£)\n02/11/2026,TESCO STORES 4346,POS,,12.50,-12.50\n03/11/2026,TEST EMPLOYER LTD,BAC,2000.00,,2000.00\n04/11/2026,TO REVOLUT,TFR,,300.00,-300.00\n';
const REVOLUT = 'Date,Description,Money out (GBP),Money in (GBP),Balance (GBP),Details,Section,Institution,PDF page\n2026-11-04,Top-up by *1234,,300.00,300.00,,Account transactions,,1\n2026-11-05,To pocket GBP Holiday,50.00,,250.00,,Pockets,,2\n2026-11-06,TEST CAFE,3.50,,246.50,,Account transactions,,2\n';
const REVOLUT_APP = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nCARD_PAYMENT,Current,2026-11-07 21:10:00,2026-11-09 09:00:00,Test Pub,-10.00,0.50,GBP,COMPLETED,90\nCARD_PAYMENT,Current,2026-11-08 10:00:00,,Test Shop,-5.00,0,GBP,REVERTED,90\n';
const MONZO = 'Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In\ntx_1,08/11/2026,10:00,Card payment,Test Grocer,,groceries,-4.20,GBP,-4.20,GBP,,,,,,-4.20,\ntx_2,09/11/2026,10:00,Pot transfer,Savings pot,,transfers,-20.00,GBP,-20.00,GBP,,,,,,-20.00,\n';
const rules = prepareRules([
  { created_from: 'imported', match: { description_contains: 'Test Employer' }, set: { legacy: { match: 'Test Employer', label: 'income', category: 'Salary' } }, priority: 200 },
  { created_from: 'imported', match: { description_contains: 'tesco' }, set: { legacy: { kind: 'spending', category: 'Groceries' } }, priority: 300 },
]);

describe('reading bank files by their header row', () => {
  it('knows each bank', () => {
    expect(detectBank(ULSTER.split('\n')[0].split(','))).toBe('ulster');
    expect(detectBank(REVOLUT.split('\n')[0].split(','))).toBe('revolut');
    expect(detectBank(REVOLUT_APP.split('\n')[0].split(','))).toBe('revolut-app');
    expect(detectBank(MONZO.split('\n')[0].split(','))).toBe('monzo');
    expect(() => parseBankFile('Foo,Bar\n1,2')).toThrow(/Capital One comes once/);
  });
  it('Ulster: pence, money out negative, tidy names', () => {
    const { rows } = parseBankFile(ULSTER);
    expect(rows.map((r) => [r.date, r.amount_pence, r.raw_description, r.account])).toEqual([
      ['2026-11-02', -1250, 'Tesco Stores', 'Ulster Bank'],
      ['2026-11-03', 200000, 'Test Employer Ltd', 'Ulster Bank'],
      ['2026-11-04', -30000, 'To Revolut', 'Ulster Bank'],
    ]);
  });
  it('Revolut app export: Started Date, completed only, fee added to money out', () => {
    const { rows, skipped } = parseBankFile(REVOLUT_APP);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-11-07', amount_pence: -1050 });
    expect(skipped).toBe(1);
  });
  it('flags Revolut pocket and Monzo pot moves', () => {
    expect(parseBankFile(REVOLUT).rows[1].internalHint).toBe('Pocket move');
    expect(parseBankFile(MONZO).rows[1].internalHint).toBe('Pot transfer');
  });
});

describe('classifying', () => {
  const row = (raw_description, amount_pence, more) => ({ raw_description, amount_pence, account: 'Ulster Bank', date: '2026-11-02', ...more });
  it('salary from your payer rule is income', () => {
    expect(classify(row('Test Employer Ltd', 200000), rules)).toMatchObject({ kind: 'income', status: 'reviewed' });
  });
  it('a known shop is spending in the right category', () => {
    expect(classify(row('Tesco Stores', -1250), rules)).toMatchObject({ kind: 'spend', category: 'Groceries', status: 'reviewed' });
  });
  it('pocket moves are transfers, never spending', () => {
    expect(classify(row('To pocket GBP Holiday', -5000, { internalHint: 'Pocket move' }), rules)).toMatchObject({ kind: 'transfer', status: 'reviewed' });
  });
  it('anything unknown goes to the review inbox', () => {
    expect(classify(row('Mystery Ltd', -999), rules)).toMatchObject({ status: 'needs_review' });
  });
  it('money in from a shop is a possible refund, not income', () => {
    expect(classify(row('Tesco Stores', 500), rules)).toMatchObject({ kind: 'refund', status: 'needs_review' });
  });
  it('a rule you taught wins over the old rules', () => {
    const taught = prepareRules([{ created_from: 'learned', match: { description_contains: 'tesco' }, set: { kind: 'spend', category: 'Household' }, priority: 100 }]);
    expect(classify(row('Tesco Stores', -1250), taught)).toMatchObject({ category: 'Household', status: 'reviewed' });
  });
});

describe('import plan', () => {
  const files = [{ name: 'ulster.csv', text: ULSTER }, { name: 'revolut.csv', text: REVOLUT }];
  it('the payday transfer from Ulster to Revolut shows once each side, as a transfer, in neither spending nor income', () => {
    const plan = buildImportPlan(files, rules, []);
    const pair = plan.rows.filter((r) => Math.abs(r.amount_pence) === 30000);
    expect(pair.map((r) => r.kind)).toEqual(['transfer', 'transfer']);
    expect(pair[0].pairWith).toBe(pair[1]);
  });
  it('importing the same files twice adds nothing', () => {
    const first = buildImportPlan(files, rules, []);
    const saved = first.rows.filter((r) => !r.duplicate).map((r, i) => ({ ...r, id: String(i), source: 'import:test', archived: false }));
    const again = buildImportPlan(files, rules, saved);
    expect(again.counts.new).toBe(0);
    expect(again.counts.duplicates).toBe(first.rows.length);
  });
  it('a bank line matching an entry from your own list (same account and amount, within 3 days) is not added twice', () => {
    const existing = [{ id: 'a', account: 'Ulster Bank', date: '2026-11-01', amount_pence: -1250, fingerprint: 'x', source: 'csv', archived: false }];
    const plan = buildImportPlan([{ name: 'ulster.csv', text: ULSTER }], rules, existing);
    expect(plan.rows.find((r) => r.amount_pence === -1250).duplicate).toMatch(/already have/);
  });
  it('every imported row is either sorted or in the inbox', () => {
    const plan = buildImportPlan(files, rules, []);
    expect(plan.rows.every((r) => ['reviewed', 'needs_review'].includes(r.status))).toBe(true);
  });
  it('never pairs confident spending with an equal payback', () => {
    const rows = [
      { account: 'Revolut', date: '2026-11-02', amount_pence: -2000, kind: 'spend', status: 'reviewed' },
      { account: 'Ulster Bank', date: '2026-11-03', amount_pence: 2000, kind: 'repayment', status: 'reviewed' },
    ];
    pairTransfers(rows);
    expect(rows.map((r) => r.kind)).toEqual(['spend', 'repayment']);
  });
  it('the old habit (pay on Ulster, then move the same amount from a Revolut pocket to Ulster) is one purchase and one transfer', () => {
    const rows = addFingerprints([
      { account: 'Ulster Bank', date: '2026-11-02', amount_pence: -1500, raw_description: 'Test Shop' },
      { account: 'Revolut', date: '2026-11-02', amount_pence: -1500, raw_description: 'Pocket withdrawal to Ulster', internalHint: 'Pocket move' },
      { account: 'Ulster Bank', date: '2026-11-02', amount_pence: 1500, raw_description: 'From Revolut' },
    ]).map((r) => ({ ...r, ...classify(r, rules) }));
    pairTransfers(rows);
    expect(rows.map((r) => r.kind)).toEqual(['spend', 'transfer', 'transfer']);
  });
});

describe('the 16 categories', () => {
  it('has 16 categories in 6 buckets', () => {
    expect(CATEGORIES).toHaveLength(16);
    expect(new Set(CATEGORIES.map((c) => c.bucket)).size).toBe(6);
  });
  it.each([
    ['Takeaway & eating out', 'Fun', 'Eating out & takeaway'],
    ['Takeaway & eating out', 'Life Fund', 'Treats & plans'],
    ['Partner', 'Life Fund', 'Partner'],
    ['Snacks & drinks', 'Groceries', 'Groceries'],
    ['Fuel', 'Essentials', 'Fuel'],
    ['Home Bargains', 'Groceries', 'Household'],
    ['Pubs & bars', 'Fun', 'Going out'],
    ['', 'Fun', 'Going out'],
    ['Uncategorised', '', null],
  ])('%s in %s -> %s', (detail, bucket, expected) => expect(mapCategory(detail, bucket)).toBe(expected));
});
