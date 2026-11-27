// The Review inbox's rules: which filter a line is in, warnings when you approve something different from the
// bank's record, and saving only what you changed (manual context is never overwritten by accident). Made-up data.
import { describe, it, expect } from 'vitest';
import { reviewGroup, bankWarnings, buildPatch } from '../../src/views/review-edit.js';

describe('inbox filters', () => {
  it('imports say which filter they belong to', () => {
    expect(reviewGroup({ review: { group: 'match' }, kind: 'spend', category_id: 'c' })).toBe('match');
    expect(reviewGroup({ review: { group: 'ready' }, kind: 'spend', category_id: 'c' })).toBe('ready');
  });
  it('older lines: a complete suggestion is ready; anything else needs information', () => {
    expect(reviewGroup({ kind: 'spend', category_id: 'c' })).toBe('ready');
    expect(reviewGroup({ kind: 'spend', category_id: null })).toBe('info');
    expect(reviewGroup({ kind: 'transfer' })).toBe('ready');
    expect(reviewGroup({ kind: 'spend', category_id: 'c', note: 'Question: which?' })).toBe('info');
  });
});

describe('approving something different from the bank', () => {
  const bank = { amount_pence: -4800, account: 'Ulster Bank', date: '2026-11-14' };
  it('says so for amount, account and a far-off date; nothing when it matches', () => {
    expect(bankWarnings(bank, { amount_pence: -4800, accountName: 'Ulster Bank', date: '2026-11-15' })).toEqual([]);
    const w = bankWarnings(bank, { amount_pence: -4875, accountName: 'Revolut', date: '2026-11-30' });
    expect(w).toHaveLength(3);
    expect(w[0]).toMatch(/statement says £48\.00; you’re approving £48\.75/);
    expect(w[1]).toMatch(/Ulster Bank statement; you’re putting it on Revolut/);
    expect(bankWarnings(null, { amount_pence: 1 })).toEqual([]);
  });
});

describe('saving a reviewed line', () => {
  const t = { amount_pence: -1250, raw_description: 'Tesco', date: '2026-11-25', account_id: 'rev', note: 'for the week' };
  const v = { kind: 'spend', category_id: 'gro', from_savings: false, fund_id: null, tag: '', description: 'Tesco', pence: 1250, date: '2026-11-25', account_id: 'rev', cycle_date: '', note: 'for the week', splits: [] };
  it('writes the classification and approval, and only the details you changed', () => {
    expect(buildPatch(t, v)).toEqual({ kind: 'spend', category_id: 'gro', from_savings: false, fund_id: null, tag: null, cycle_date: null, status: 'reviewed' });
    expect(buildPatch(t, { ...v, pence: 1300, description: 'Tesco Extra', cycle_date: '2026-10-26' })).toMatchObject({ amount_pence: -1300, raw_description: 'Tesco Extra', cycle_date: '2026-10-26' });
  });
  it('a move or a payback has no category, and only spending can be paid from savings', () => {
    expect(buildPatch(t, { ...v, kind: 'transfer', from_savings: true, fund_id: 'f' })).toMatchObject({ category_id: null, from_savings: false, fund_id: null });
    expect(buildPatch(t, { ...v, from_savings: true, fund_id: 'f' })).toMatchObject({ from_savings: true, fund_id: 'f' });
  });
  it('money in keeps its sign', () => {
    expect(buildPatch({ ...t, amount_pence: 1750 }, { ...v, kind: 'repayment', pence: 2000 }).amount_pence).toBe(2000);
  });
});
