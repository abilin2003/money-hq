// End-to-end workflows for live tracking: typing purchases as you go, importing statements later, approving in
// the inbox, IOUs, the credit card, transfers, pay-cycle attribution, balances and backups. Each test follows the
// same steps the app takes, with made-up data, and checks every payment is counted exactly once.
import { describe, it, expect } from 'vitest';
import { buildImportPlan, bankRecord } from '../../src/lib/import/plan.js';
import { prepareRules } from '../../src/lib/import/classify.js';
import { summarise } from '../../src/lib/summary.js';
import { balanceNow, cardOwed } from '../../src/lib/position.js';
import { allocateRepayment } from '../../src/lib/ious.js';
import { buildPatch, reviewGroup } from '../../src/views/review-edit.js';
import { inCycle } from '../../src/ui/parts.js';
import { BACKUP_TABLES } from '../../src/lib/data.js';

const rules = prepareRules([{ created_from: 'learned', match: { description_contains: 'tesco' }, set: { kind: 'spend', category: 'Groceries' }, priority: 100 }]);
const ACC = { 'Ulster Bank': 'ul', Revolut: 'rv', 'Capital One': 'cc' };
const ulster = (...lines) => ({ name: 'ulster.csv', text: ['Date,Description,Type,Paid in (£),Paid out (£),Amount (£)', ...lines].join('\n') });
const out = (d, desc, p) => `${d},${desc},POS,,${p},-${p}`;
const inn = (d, desc, p) => `${d},${desc},BAC,${p},,${p}`;
let n = 0;
const typed = (date, pence, more = {}) => ({ id: `m${n++}`, account: 'Ulster Bank', account_id: 'ul', date, amount_pence: pence, raw_description: 'typed', kind: 'spend', category: 'Groceries', bucket: 'Groceries', status: 'reviewed', source: 'manual', fingerprint: `manual|${n}`, archived: false, bank: null, ...more });

// What the app does after you press Import: links attach the bank record; new lines are saved as pending.
function applyImport(existing, files) {
  const plan = buildImportPlan(files, rules, existing);
  const now = '2026-11-27T10:00:00Z';
  const linked = existing.map((t) => { const l = plan.links.find((x) => x.id === t.id); return l ? { ...t, bank: bankRecord(l.row, l.row.file, now) } : t; });
  const added = plan.rows.filter((r) => !r.duplicate).map((r, i) => ({ id: `i${n++}${i}`, account: r.account, account_id: ACC[r.account], date: r.date, amount_pence: r.amount_pence, raw_description: r.raw_description, kind: r.kind, category: r.category, bucket: r.category, status: r.status, review: r.review, source: 'import:ulster', fingerprint: r.fingerprint, archived: false, bank: bankRecord(r, r.file, now) }));
  return { plan, all: [...linked, ...added] };
}
const approve = (all, id, patch = {}) => all.map((t) => (t.id === id ? { ...t, ...patch, status: 'reviewed' } : t));
const spent = (all) => summarise(all).totalSpent;

describe('typing as you go, then importing the statement', () => {
  it('a purchase you typed is matched, verified and counted once; your details are kept', () => {
    const gift = typed('2026-11-24', -3500, { raw_description: 'Birthday gift for my girlfriend', category: 'Partner', bucket: 'Life Fund', note: 'Life Fund' });
    expect(spent([gift])).toBe(3500); // counts straight away, before any import
    const { plan, all } = applyImport([gift], [ulster(out('25/11/2026', 'AMAZON MKTPLACE', '35.00'))]);
    expect(plan.counts).toMatchObject({ linked: 1, new: 0 });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ raw_description: 'Birthday gift for my girlfriend', category: 'Partner', note: 'Life Fund', bank: { description: 'AMAZON MKTPLACE' } });
    expect(spent(all)).toBe(3500);
  });
  it('two identical same-day purchases are never guessed: both wait as possible matches', () => {
    const a = typed('2026-11-25', -175); const b = typed('2026-11-25', -175);
    const { plan, all } = applyImport([a, b], [ulster(out('25/11/2026', 'SPAR', '1.75'), out('25/11/2026', 'SPAR', '1.75'))]);
    expect(plan.counts).toMatchObject({ linked: 0, possibleMatch: 2 });
    expect(spent(all)).toBe(350); // your two, not four: the imported copies wait unapproved
  });
  it('an uncertain match (different amount) waits; confirming it keeps one payment', () => {
    const fuel = typed('2026-11-14', -4875, { category: 'Fuel', bucket: 'Fuel' });
    const { plan, all } = applyImport([fuel], [ulster(out('14/11/2026', 'EUROSPAR', '48.00'))]);
    expect(plan.counts.possibleMatch).toBe(1);
    expect(spent(all)).toBe(4875);
    // "Same, use statement's £48.00": your entry gets the bank amount, the pending copy is removed.
    const pending = all.find((t) => t.status === 'needs_review');
    const after = all.filter((t) => t.id !== pending.id).map((t) => (t.id === fuel.id ? { ...t, amount_pence: pending.amount_pence, bank: pending.bank } : t));
    expect(spent(after)).toBe(4800);
  });
});

describe('new statement lines', () => {
  const { all } = applyImport([], [ulster(out('26/11/2026', 'TESCO STORES 4346', '12.50'), out('26/11/2026', 'ZXQ LTD', '9.99'))]);
  it('are never counted until you approve them', () => {
    expect(all.map((t) => [t.status, reviewGroup(t)])).toEqual([['needs_review', 'ready'], ['needs_review', 'info']]);
    expect(spent(all)).toBe(0);
    expect(summarise(all).waiting).toBe(2);
  });
  it('one tap approves the suggestion; a corrected category is used instead', () => {
    const a = approve(all, all[0].id);
    expect(spent(a)).toBe(1250);
    const patch = buildPatch(all[1], { kind: 'spend', category_id: 'misc', from_savings: false, fund_id: null, tag: '', description: all[1].raw_description, pence: 999, date: all[1].date, account_id: all[1].account_id, cycle_date: '', note: '', splits: [] });
    expect(patch).toMatchObject({ category_id: 'misc', status: 'reviewed' });
    expect(patch.amount_pence).toBeUndefined(); // nothing else about the line changes
  });
  it('bulk approval of several lines counts each once', () => {
    const b = all.reduce((acc, t) => approve(acc, t.id, { category: 'Groceries', bucket: 'Groceries' }), all);
    expect(spent(b)).toBe(1250 + 999);
  });
});

describe('importing again', () => {
  it('the same statement twice, or an overlapping one, adds nothing', () => {
    const file = ulster(out('20/11/2026', 'TESCO STORES 4346', '12.50'), out('21/11/2026', 'CAFE', '3.00'));
    const first = applyImport([], [file]).all;
    const again = buildImportPlan([file], rules, first);
    expect(again.counts).toMatchObject({ new: 0, duplicates: 2 });
    const overlap = buildImportPlan([ulster(out('21/11/2026', 'CAFE', '3.00'), out('22/11/2026', 'BAKERY', '2.40'))], rules, first);
    expect(overlap.counts).toMatchObject({ new: 1, duplicates: 1 });
  });
});

describe('IOUs', () => {
  it('a meal paid for a group counts only your share; repayments are paybacks, never income', () => {
    const meal = typed('2026-10-30', -6000, { category: 'Eating out', bucket: 'Fun' });
    const s = summarise([meal], { [meal.id]: 4000 });
    expect(s.netSpent).toBe(2000);
    const plan = allocateRepayment([{ id: 's1', amount_pence: 2000, date: '2026-10-30' }, { id: 's2', amount_pence: 2000, date: '2026-10-30' }], 3000);
    expect(plan).toMatchObject({ settle: ['s1'], partial: { id: 's2', paid: 1000, rest: 1000 }, owedAfter: 1000 });
    const repaid = typed('2026-11-24', 3000, { kind: 'repayment', category: null, bucket: null });
    expect(summarise([meal, repaid], { [meal.id]: 4000 }, new Set([repaid.id])).income).toBe(0);
  });
  it('a repayment you recorded is matched when the statement arrives, not counted again', () => {
    const repaid = typed('2026-11-26', 1750, { kind: 'repayment', category: null, bucket: null });
    const { plan, all } = applyImport([repaid], [ulster(inn('27/11/2026', 'J JOSE', '17.50'))]);
    expect(plan.counts).toMatchObject({ linked: 1, new: 0 });
    expect(all).toHaveLength(1);
  });
});

describe('the credit card and moves between your accounts', () => {
  const card = { id: 'cc', name: 'Capital One', institution: 'Capital One', type: 'credit_card' };
  it('£50 of fuel on the card is spending and debt; the repayment from Ulster is neither more spending nor income', () => {
    const fuel = { id: 'f', account_id: 'cc', date: '2026-11-27', amount_pence: -5000, kind: 'spend', category: 'Fuel', bucket: 'Fuel', status: 'reviewed', raw_description: 'Fuel' };
    const repay = { id: 'r', account_id: 'ul', date: '2026-11-28', amount_pence: -5000, kind: 'transfer', status: 'reviewed', raw_description: 'CAPITAL ONE' };
    const snaps = [{ account_id: 'cc', date: '2026-11-26', balance_pence: 0 }, { account_id: 'ul', date: '2026-11-26', balance_pence: 20000 }];
    expect(cardOwed(card, snaps, [fuel], '2026-11-27').pence).toBe(5000);
    expect(cardOwed(card, snaps, [fuel, repay], '2026-11-28').pence).toBe(0);
    expect(balanceNow({ id: 'ul', type: 'current' }, snaps, [fuel, repay], '2026-11-28').pence).toBe(15000);
    const s = summarise([fuel, repay]);
    expect(s.totalSpent).toBe(5000);
    expect(s.income).toBe(0);
  });
  it('a move between your own accounts is neither spending nor income on either side', () => {
    const lines = [
      { id: 'a', account_id: 'ul', date: '2026-11-24', amount_pence: -27000, kind: 'transfer', status: 'reviewed' },
      { id: 'b', account_id: 'rv', date: '2026-11-24', amount_pence: 27000, kind: 'transfer', status: 'reviewed' },
    ];
    expect(summarise(lines)).toMatchObject({ totalSpent: 0, income: 0 });
  });
});

describe('pay cycles and live balances', () => {
  it('a payment counts in the cycle you choose while keeping its real bank date', () => {
    const prime = typed('2026-11-24', -899, { cycle_date: '2026-11-23', category: 'Bills', bucket: 'Essentials' });
    expect(inCycle(prime, { start: '2026-10-26', end: '2026-11-23' })).toBe(true);
    expect(inCycle(prime, { start: '2026-11-24', end: '2026-12-17' })).toBe(false);
    expect(prime.date).toBe('2026-11-24');
  });
  it('£10 spent on Revolut moves its balance once; inbox lines don’t until approved', () => {
    const rv = { id: 'rv', type: 'current' };
    const snaps = [{ account_id: 'rv', date: '2026-11-26', balance_pence: 30000 }];
    const lines = [{ account_id: 'rv', date: '2026-11-27', amount_pence: -1000, status: 'reviewed' }, { account_id: 'rv', date: '2026-11-27', amount_pence: -400, status: 'needs_review' }];
    expect(balanceNow(rv, snaps, lines, '2026-11-27')).toMatchObject({ pence: 29000, pending: { count: 1, pence: -400 } });
  });
});

describe('backups', () => {
  it('restore adds every table after the tables it points to', () => {
    const links = [['buckets', 'categories'], ['categories', 'merchants'], ['accounts', 'import_batches'], ['cycles', 'budgets'], ['buckets', 'budgets'],
      ['accounts', 'transactions'], ['categories', 'transactions'], ['merchants', 'transactions'], ['import_batches', 'transactions'], ['sinking_funds', 'transactions'],
      ['transactions', 'splits'], ['people', 'splits'], ['accounts', 'recurring'], ['categories', 'recurring'], ['accounts', 'sinking_funds'],
      ['accounts', 'balance_snapshots'], ['accounts', 'goals'], ['sinking_funds', 'goals']];
    for (const [first, then] of links) expect(BACKUP_TABLES.indexOf(first), `${first} before ${then}`).toBeLessThan(BACKUP_TABLES.indexOf(then));
  });
});
