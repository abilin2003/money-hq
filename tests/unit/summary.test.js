// Adding up a period. All data here is made up.
import { describe, it, expect } from 'vitest';
import { summarise, ranked, monthName } from '../../src/lib/summary.js';

const t = (amount_pence, kind, more = {}) => ({ amount_pence, kind, status: 'reviewed', bucket: 'Fun', category: 'Going out', ...more });

describe('summarise', () => {
  const s = summarise([
    t(-4000, 'spend'),
    t(-1000, 'spend', { bucket: 'Groceries', category: 'Groceries' }),
    t(1000, 'refund', { bucket: 'Groceries', category: 'Groceries' }),
    t(200000, 'income', { bucket: null, category: null }),
    t(2000, 'repayment', { bucket: null, category: null }),
    t(-30000, 'transfer', { bucket: null, category: null }),
    t(-50000, 'invested', { bucket: null, category: null }),
    t(-3500, 'spend', { status: 'needs_review' }),
  ]);
  it('counts spending as a positive number, and refunds and paybacks bring it down', () => {
    expect([s.spent, s.refunds, s.paidBack, s.netSpent]).toEqual([5000, 1000, 2000, 2000]);
    expect(s.byBucket).toEqual({ Fun: 4000, Groceries: 0 });
  });
  it('transfers are never spending or income, and paybacks are never income', () => {
    expect(s.income).toBe(200000);
    expect(s.paidBack).toBe(2000);
    expect(s.invested).toBe(50000);
  });
  it('lines waiting in the inbox are not counted yet', () => {
    expect(s.waiting).toBe(1);
  });
  it('ranks biggest first and leaves out empty ones', () => {
    expect(ranked(s.byBucket)).toEqual([['Fun', 4000]]);
  });
  it('friends paying you back come off spending, in the bucket they were for', () => {
    const r = summarise([t(-4000, 'spend'), t(2000, 'repayment')]);
    expect([r.spent, r.paidBack, r.netSpent, r.byBucket.Fun]).toEqual([4000, 2000, 2000, 2000]);
  });
  it('a payback with no bucket still comes off the total', () => {
    const r = summarise([t(-4000, 'spend'), t(1500, 'repayment', { bucket: null, category: null })]);
    expect([r.netSpent, r.byBucket.Fun]).toEqual([2500, 4000]);
  });
  it('a payback that clears a split IOU is not taken off twice (the split already left only your share)', () => {
    const r = summarise([t(-4000, 'spend', { id: 'd' }), t(2000, 'repayment', { id: 'r' })], { d: 2000 }, new Set(['r']));
    expect([r.spent, r.netSpent, r.owedToYou]).toEqual([2000, 2000, 2000]);
  });
  it('a big buy paid from savings is shown separately, not as that cycle’s spending', () => {
    const r = summarise([t(-4000, 'spend'), t(-120000, 'spend', { from_savings: true })]);
    expect([r.spent, r.fromSavings, r.netSpent, r.byBucket.Fun]).toEqual([4000, 120000, 4000, 4000]);
  });
  it('names months', () => {
    expect(monthName('2026-07')).toBe('July 2026');
  });
});
