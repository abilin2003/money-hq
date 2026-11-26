// A statement checks what you typed in by hand: same payment typed slightly differently is corrected (and shown
// to you in the inbox), and typed entries the statement doesn't have are asked about. Made-up data.
import { describe, it, expect } from 'vitest';
import { buildImportPlan, CHECK_NOT_ON } from '../../src/lib/import/plan.js';
import { cardSpendIn } from '../../src/lib/position.js';
import { prepareRules } from '../../src/lib/import/classify.js';

const rules = prepareRules([]);

const ULSTER = [
  'Date,Description,Type,Paid in (£),Paid out (£),Amount (£)',
  '02/11/2026,TESCO STORES 4346,POS,,12.50,-12.50',
  '05/11/2026,SHELL MOIRA,POS,,53.00,-53.00',
  '06/11/2026,SHELL MOIRA,POS,,50.00,-50.00',
  '20/11/2026,TEST CAFE,POS,,4.00,-4.00',
].join('\n');
const typed = (id, date, pence, more = {}) => ({ id, account: 'Ulster Bank', date, amount_pence: pence, fingerprint: `manual|${id}`, source: 'manual', archived: false, status: 'reviewed', note: null, ...more });

describe('a statement checks what you typed', () => {
  const existing = [
    typed('tesco', '2026-11-02', -1250), // exact: skipped, nothing to ask
    typed('fuel', '2026-11-05', -5361, { note: 'fuel' }), // typed £53.61, statement £53.00
    typed('fuel2', '2026-11-06', -5000), // exact match for the £50.00, even though £53.61 is closer to it than to nothing
    typed('gone', '2026-11-10', -800), // not on the statement
    typed('late', '2026-11-19', -999), // in the last 3 days of the statement: may not have gone through yet
    typed('other', '2026-11-10', -800, { account: 'Revolut' }), // another account: this file says nothing about it
    typed('asked', '2026-11-11', -100, { status: 'needs_review' }), // already in the inbox
  ];
  const plan = buildImportPlan([{ name: 'ulster.csv', text: ULSTER }], rules, existing);
  it('exact matches are skipped; a close one corrects the typed entry instead of adding it twice', () => {
    expect(plan.counts.new).toBe(1); // only the cafe
    expect(plan.rows.find((r) => r.amount_pence === -5300).duplicate).toMatch(/corrects/);
    const c = plan.checks.find((x) => x.id === 'fuel');
    expect(c.patch).toMatchObject({ amount_pence: -5300, date: '2026-11-05', status: 'needs_review' });
    expect(c.patch.note).toMatch(/^You typed £53\.61 .* statement says £53\.00 .*\(fuel\)$/);
  });
  it('asks about typed entries the statement doesn’t have, only for its account and dates', () => {
    expect(plan.checks.filter((x) => x.kind === 'missing').map((x) => x.id)).toEqual(['gone']);
    expect(plan.checks.find((x) => x.id === 'gone').patch).toEqual({ status: 'needs_review', note: CHECK_NOT_ON });
    expect(plan.counts).toMatchObject({ corrected: 1, notOnStatement: 1 });
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
