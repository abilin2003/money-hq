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
  it('counts spending as a positive number, and refunds bring it down', () => {
    expect([s.spent, s.refunds, s.netSpent]).toEqual([5000, 1000, 4000]);
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
  it('names months', () => {
    expect(monthName('2026-07')).toBe('July 2026');
  });
});
