// The card repayment worked out from the card, and a fund that is an account. Made-up data.
import { describe, it, expect } from 'vitest';
import { cardSpendIn, isCardLine, withCardAmounts, mirroredFund } from '../../src/lib/position.js';

const card = { id: 'cc', name: 'Capital One', institution: 'Capital One', type: 'credit_card' };
const t = (date, pence, kind = 'spend', more = {}) => ({ date, amount_pence: pence, kind, account_id: 'cc', status: 'reviewed', raw_description: 'Shell', ...more });
const txs = [
  t('2026-10-20', -9999), // the cycle before
  t('2026-10-24', -4500), t('2026-11-02', -3000, 'spend', { status: 'needs_review' }), t('2026-11-10', 1000, 'refund'), t('2026-11-23', -2000),
  t('2026-11-15', 30000, 'transfer'), // a repayment into the card: not spending
  t('2026-11-24', -700), // the new cycle
  { date: '2026-11-05', amount_pence: -5000, kind: 'spend', account_id: 'ulster', status: 'reviewed', raw_description: 'Tesco' },
];

describe('card repayment from what you spent on the card', () => {
  it('adds up purchases in the cycle before payday, less refunds, counting lines still to review', () => {
    expect(cardSpendIn(card, txs, '2026-10-24', '2026-11-23')).toMatchObject({ pence: 8500, count: 3, complete: true, lastImported: '2026-11-24' });
  });
  it('says when the card’s lines stop before the cycle ends (a statement not imported yet)', () => {
    expect(cardSpendIn(card, txs.filter((x) => x.date < '2026-11-20'), '2026-10-24', '2026-11-23')).toMatchObject({ complete: false, lastImported: '2026-11-15' });
    expect(cardSpendIn(card, [], '2026-10-24', '2026-11-23')).toMatchObject({ pence: 0, complete: false, lastImported: null });
  });
  it('a transfer naming the card is its repayment line; other lines are not', () => {
    expect(isCardLine({ kind: 'transfer', name: 'Capital One credit-card repayment' }, card)).toBe(true);
    expect(isCardLine({ kind: 'saved', name: 'Capital One' }, card)).toBe(false);
    expect(isCardLine({ kind: 'transfer', name: 'To Monzo' }, card)).toBe(false);
  });
  it('follows the card unless you typed your own amount or already confirmed it', () => {
    const items = [
      { kind: 'transfer', name: 'Capital One repayment', amount_pence: 42400 },
      { kind: 'saved', name: 'Holiday Pot', amount_pence: 20000 },
    ];
    const spend = { pence: 8500 };
    expect(withCardAmounts(items, card, spend).map((x) => x.amount_pence)).toEqual([8500, 20000]);
    expect(withCardAmounts([{ ...items[0], auto: false }], card, spend)[0].amount_pence).toBe(42400);
    expect(withCardAmounts([{ ...items[0], verified: '2026-11-25' }], card, spend)[0].amount_pence).toBe(42400);
    expect(withCardAmounts(items, null, null)).toBe(items);
  });
});

describe('a fund that is an account', () => {
  const isa = { id: 'isa', name: 'Cash ISA', type: 'isa' };
  const fund = { id: 'ef', name: 'Emergency fund', balance_pence: 0, balance_date: '2026-11-01' };
  it('shows the account’s latest typed-in balance', () => {
    const snaps = [{ account_id: 'isa', date: '2026-10-01', balance_pence: 100000 }, { account_id: 'isa', date: '2026-11-20', balance_pence: 120000 }, { account_id: 'cur', date: '2026-11-25', balance_pence: 5 }];
    expect(mirroredFund(fund, isa, snaps)).toMatchObject({ balance_pence: 120000, balance_date: '2026-11-20', mirrors: isa });
  });
  it('with no balance typed in for the account, the fund has none either (never a guess)', () => {
    expect(mirroredFund(fund, isa, [])).toMatchObject({ balance_pence: null, balance_date: null });
  });
});
