// Statement imports reconcile with what you recorded yourself: a clear match is linked (nothing added, your
// details kept), anything uncertain or new waits in the Review inbox, and nothing is ever approved or counted
// twice on its own. Made-up data.
import { describe, it, expect } from 'vitest';
import { buildImportPlan, NOT_ON_STATEMENT, bankRecord } from '../../src/lib/import/plan.js';
import { cardSpendIn } from '../../src/lib/position.js';
import { prepareRules } from '../../src/lib/import/classify.js';

const rules = prepareRules([]);
const ulster = (...lines) => ['Date,Description,Type,Paid in (£),Paid out (£),Amount (£)', ...lines].join('\n');
const out = (d, desc, p) => `${d},${desc},POS,,${p},-${p}`;
const typed = (id, date, pence, more = {}) => ({ id, account: 'Ulster Bank', date, amount_pence: pence, raw_description: 'typed', fingerprint: `manual|${id}`, source: 'manual', archived: false, status: 'reviewed', note: null, bank: null, ...more });
const plan = (text, existing) => buildImportPlan([{ name: 'ulster.csv', text }], rules, existing);

describe('a clear match is linked to your entry', () => {
  const gift = typed('gift', '2026-11-02', -3500, { raw_description: 'Birthday gift for my girlfriend', note: 'Life Fund', category_id: 'partner', tag: 'Birthday' });
  const p = plan(ulster(out('04/11/2026', 'AMAZON MKTPLACE', '35.00')), [gift]);
  it('nothing new is added, and the bank line is kept separately', () => {
    expect(p.counts).toMatchObject({ new: 0, linked: 1 });
    expect(p.links[0].id).toBe('gift');
    expect(bankRecord(p.links[0].row, 'ulster.csv', 'T')).toMatchObject({ description: 'AMAZON MKTPLACE', date: '2026-11-04', amount_pence: -3500, account: 'Ulster Bank', file: 'ulster.csv' });
  });
  it('your description, category, notes and tag are never part of what changes', () => {
    // The import only attaches the bank record: the link carries no other fields to write.
    expect(Object.keys(p.links[0])).toEqual(['id', 'row', 'why']);
    expect(gift.linked).toBeUndefined(); // the entry passed in isn't altered either
  });
  it('a payment reaches the statement up to 4 days later, never long before', () => {
    expect(plan(ulster(out('06/11/2026', 'SHOP', '35.00')), [gift]).counts.linked).toBe(1);
    expect(plan(ulster(out('07/11/2026', 'SHOP', '35.00')), [gift]).counts.linked).toBe(0);
    expect(plan(ulster(out('31/10/2026', 'SHOP', '35.00')), [gift]).counts.linked).toBe(0);
  });
  it('importing the same statement again adds nothing: the linked line is remembered', () => {
    const linked = { ...gift, bank: bankRecord(p.links[0].row, 'ulster.csv') };
    const again = plan(ulster(out('04/11/2026', 'AMAZON MKTPLACE', '35.00')), [linked]);
    expect(again.counts).toMatchObject({ new: 0, linked: 0, duplicates: 1 });
  });
});

describe('anything uncertain waits in the inbox as a possible match', () => {
  it('two identical same-day purchases: never guessed', () => {
    const p = plan(ulster(out('02/11/2026', 'SPAR', '1.75'), out('02/11/2026', 'SPAR', '1.75')), [typed('a', '2026-11-02', -175), typed('b', '2026-11-02', -175)]);
    expect(p.counts).toMatchObject({ linked: 0, new: 2, possibleMatch: 2 });
    expect(p.rows.every((r) => r.status === 'needs_review' && r.review.match_ids.length === 2)).toBe(true);
  });
  it('one entry but two statement lines that could be it', () => {
    const p = plan(ulster(out('02/11/2026', 'SPAR', '1.75'), out('03/11/2026', 'SPAR', '1.75')), [typed('a', '2026-11-02', -175)]);
    expect(p.counts).toMatchObject({ linked: 0, possibleMatch: 2 });
  });
  it('a slightly different amount is asked about, never merged', () => {
    const p = plan(ulster(out('14/11/2026', 'EUROSPAR', '48.00')), [typed('fuel', '2026-11-14', -4875)]);
    expect(p.counts).toMatchObject({ linked: 0, new: 1, possibleMatch: 1 });
    expect(p.rows[0].review.reason).toMatch(/You recorded £48\.75 .* statement says £48\.00/);
  });
});

describe('new lines are never approved on their own', () => {
  const taught = prepareRules([{ created_from: 'learned', match: { description_contains: 'tesco' }, set: { kind: 'spend', category: 'Groceries' }, priority: 100 }]);
  const p = buildImportPlan([{ name: 'ulster.csv', text: ulster(out('02/11/2026', 'TESCO STORES 4346', '12.50'), out('03/11/2026', 'ZXQ LTD', '9.99')) }], taught, []);
  it('a confident suggestion is ready to approve; an unknown one needs information; both are pending', () => {
    expect(p.rows.map((r) => [r.status, r.review.group])).toEqual([['needs_review', 'ready'], ['needs_review', 'info']]);
    expect(p.rows[0]).toMatchObject({ kind: 'spend', category: 'Groceries' }); // the suggestion is kept
  });
});

describe('duplicates', () => {
  it('a bank reference seen before, and the same line from another kind of export, are skipped', () => {
    const before = [{ id: 'r', account: 'Revolut', date: '2026-11-07', amount_pence: -1000, raw_description: 'Test Pub', fingerprint: 'other', source: 'import:revolut-app', archived: false, status: 'reviewed', bank: { ref: 'TX123' } }];
    const app = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance,Transaction ID\nCARD_PAYMENT,Current,2026-11-07 21:10:00,2026-11-08 09:00:00,Test Pub,-10.00,0,GBP,COMPLETED,90,TX123\n';
    const statement = 'Date,Description,Money out (GBP),Money in (GBP),Balance (GBP),Details,Section,Institution,PDF page\n2026-11-08,Test Pub,10.00,,90.00,,Account transactions,,1\n';
    const p = buildImportPlan([{ name: 'app.csv', text: app }, { name: 'statement.csv', text: statement }], rules, before);
    expect(p.counts.new).toBe(0);
    expect(p.counts.duplicates).toBe(2);
  });
});

describe('your entries the statement doesn’t have', () => {
  const text = ulster(out('02/11/2026', 'TESCO', '12.50'), out('20/11/2026', 'CAFE', '4.00'));
  it('are asked about, only for that account and the dates it covers; your note is left alone', () => {
    const p = plan(text, [typed('gone', '2026-11-10', -800, { note: 'mine' }), typed('late', '2026-11-19', -999), typed('other', '2026-11-10', -800, { account: 'Revolut' })]);
    expect(p.checks).toEqual([{ id: 'gone', kind: 'missing', review: { group: 'info', reason: NOT_ON_STATEMENT } }]);
  });
  it('a list you made yourself checks nothing', () => {
    const list = 'Date,Description,Amount,Account,Category,Note\n2026-11-02,Tesco,-12.50,Ulster Bank,Groceries,\n2026-11-20,Cafe,-4.00,Ulster Bank,Eating out,\n';
    expect(buildImportPlan([{ name: 'list.csv', text: list }], rules, [typed('gone', '2026-11-10', -800)]).checks).toEqual([]);
  });
});

describe('the card repayment', () => {
  it('is lowered by money a friend paid straight onto the card, but not by your own repayment', () => {
    const card = { id: 'cc' };
    const t = (date, pence, kind) => ({ date, amount_pence: pence, kind, account_id: 'cc' });
    const s = cardSpendIn(card, [t('2026-11-01', -30000, 'spend'), t('2026-11-03', 15000, 'repayment'), t('2026-11-10', 20000, 'transfer')], '2026-10-26', '2026-11-23');
    expect(s.pence).toBe(15000);
  });
});
