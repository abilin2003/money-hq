// Holiday spending paid on a card and covered by savings: real spending in the total, not in the everyday budget,
// and the card repayment is never counted as a second expense. Made-up amounts.
import { describe, it, expect } from 'vitest';
import { summarise } from '../../src/lib/summary.js';
import { spendLines, total } from '../../src/lib/explore.js';
import { readFund } from '../../src/ui/fund-picker.js';

const t = (id, pence, kind, more = {}) => ({ id, date: '2026-11-20', amount_pence: pence, kind, status: 'reviewed', bucket: null, category: null, raw_description: id, ...more });
const lines = [
  t('flight out', -10180, 'spend', { bucket: 'Holidays & Travel', category: 'Flights', from_savings: true, fund_id: 'ef', account_id: 'cc' }),
  t('flight back', -4200, 'spend', { bucket: 'Holidays & Travel', category: 'Flights', from_savings: true, fund_id: 'ef', account_id: 'cc' }),
  t('groceries', -3000, 'spend', { bucket: 'Groceries', category: 'Groceries', account_id: 'ul' }),
  t('card repayment', -17380, 'transfer', { account_id: 'ul' }), // paying the card off from Ulster Bank
  t('from the cash isa', 14380, 'transfer', { account_id: 'ul' }), // money taken out of savings to cover it
];

describe('holiday paid from savings', () => {
  const s = summarise(lines);
  it('counts in total spending, but not in the everyday (budget) spending', () => {
    expect(s.fromSavings).toBe(14380);
    expect(s.netSpent).toBe(3000);
    expect(s.totalSpent).toBe(3000 + 14380);
    expect(s.byBucket['Holidays & Travel'] || 0).toBe(0); // budgets never see it
  });
  it('the card repayment and the money out of savings are moves, not more spending', () => {
    expect(s.totalSpent).toBe(17380); // flights + groceries once, nothing for the repayment
    expect(s.income).toBe(0);
  });
  it('the analysis lines add up to the same total', () => {
    expect(total(spendLines(lines))).toBe(s.totalSpent);
  });
  it('the picker: budget, a named fund, or savings in general', () => {
    expect(readFund({ value: '' })).toEqual({ from_savings: false, fund_id: null });
    expect(readFund({ value: 'ef' })).toEqual({ from_savings: true, fund_id: 'ef' });
    expect(readFund({ value: 'savings' })).toEqual({ from_savings: true, fund_id: null });
    expect(readFund({ value: 'ef' }, false)).toEqual({ from_savings: false, fund_id: null }); // money in is never "paid from savings"
  });
});
