// Recording IOU repayments (full and partial) and live balances that count each approved line once, with lines
// still in the inbox shown apart. Made-up data.
import { describe, it, expect } from 'vitest';
import { allocateRepayment, repaymentCandidates } from '../../src/lib/ious.js';
import { balanceNow, cashPosition, cardOwed } from '../../src/lib/position.js';
import { summarise } from '../../src/lib/summary.js';

describe('a friend paying you back', () => {
  const open = [{ id: 'a', amount_pence: 1750, date: '2026-10-30' }, { id: 'b', amount_pence: 1000, date: '2026-11-10' }];
  it('the full amount settles everything they owe', () => {
    expect(allocateRepayment(open, 2750)).toEqual({ settle: ['a', 'b'], partial: null, owedAfter: 0 });
  });
  it('a part payment settles the oldest first and splits the next, so nothing is lost', () => {
    expect(allocateRepayment(open, 2000)).toEqual({ settle: ['a'], partial: { id: 'b', paid: 250, rest: 750 }, owedAfter: 750 });
    expect(allocateRepayment(open, 1000)).toEqual({ settle: [], partial: { id: 'a', paid: 1000, rest: 750 }, owedAfter: 1750 });
  });
  it('more than they owe, or nothing, is refused', () => {
    expect(allocateRepayment(open, 3000).error).toMatch(/more than they owe \(£27\.50\)/);
    expect(allocateRepayment(open, 0).error).toBeTruthy();
  });
  it('a repayment is money paid back, never income', () => {
    const s = summarise([{ date: '2026-11-24', amount_pence: 1750, kind: 'repayment', status: 'reviewed' }], {}, new Set(['x']));
    expect(s.income).toBe(0);
  });
  it('matching money already in your records: only relevant money in, their name first', () => {
    const txs = [
      { id: 't1', date: '2026-11-20', amount_pence: 1750, kind: 'transfer', status: 'needs_review', raw_description: 'Payment from J JOSE' },
      { id: 't2', date: '2026-11-21', amount_pence: 1750, kind: 'repayment', status: 'reviewed', raw_description: 'Transfer from BEN' },
      { id: 't3', date: '2026-11-22', amount_pence: 150000, kind: 'income', status: 'reviewed', raw_description: 'Salary' },
      { id: 't4', date: '2026-11-22', amount_pence: -500, kind: 'spend', status: 'reviewed', raw_description: 'Ben' },
      { id: 't5', date: '2026-11-23', amount_pence: 1750, kind: 'repayment', status: 'reviewed', raw_description: 'Ben again' },
      { id: 't6', date: '2026-11-23', amount_pence: 1000, kind: 'invested', status: 'reviewed', raw_description: 'Trading 212' }, // an ISA withdrawal: never a payback
    ];
    const c = repaymentCandidates(txs, [{ settled_by_transaction_id: 't5' }], { name: 'Ben' }, 1750, '2026-11-27');
    expect(c.map((x) => x.id)).toEqual(['t2', 't1']);
  });
});

describe('live balances', () => {
  const ul = { id: 'ul', type: 'current' };
  const snaps = [{ account_id: 'ul', date: '2026-11-26', balance_pence: 15000 }];
  const txs = [
    { account_id: 'ul', date: '2026-11-26', amount_pence: -500, status: 'reviewed' }, // already in the typed balance
    { account_id: 'ul', date: '2026-11-27', amount_pence: 1750, kind: 'repayment', status: 'reviewed' }, // repayment received
    { account_id: 'ul', date: '2026-11-27', amount_pence: -1000, status: 'reviewed' }, // £10 spent
    { account_id: 'ul', date: '2026-11-27', amount_pence: -999, status: 'needs_review' }, // waiting in the inbox
  ];
  it('approved lines after the typed balance count once; inbox lines are shown apart', () => {
    expect(balanceNow(ul, snaps, txs, '2026-11-27')).toMatchObject({ status: 'estimated', pence: 15000 + 1750 - 1000, since: 2, pending: { count: 1, pence: -999 } });
    expect(cashPosition({ accounts: [ul], snapshots: snaps, txs, today: '2026-11-27' }).pending).toEqual({ count: 1, pence: -999 });
  });
  it('no typed balance: unknown, never invented', () => {
    expect(balanceNow({ id: 'rv', type: 'current' }, snaps, txs, '2026-11-27')).toMatchObject({ status: 'unknown', pence: null });
  });
  it('a card: purchases add to what you owe, a repayment from the bank takes it off, inbox lines wait', () => {
    const card = { id: 'cc', name: 'Capital One', institution: 'Capital One', type: 'credit_card' };
    const s = [{ account_id: 'cc', date: '2026-11-26', balance_pence: 0 }];
    const t = [
      { account_id: 'cc', date: '2026-11-27', amount_pence: -5000, kind: 'spend', status: 'reviewed', raw_description: 'Fuel' },
      { account_id: 'cc', date: '2026-11-27', amount_pence: -700, kind: 'spend', status: 'needs_review', raw_description: 'Pending' },
      { account_id: 'ul', date: '2026-11-28', amount_pence: -2000, kind: 'transfer', status: 'reviewed', raw_description: 'CAPITAL ONE payment' },
    ];
    expect(cardOwed(card, s, t, '2026-11-28').pence).toBe(3000);
    expect(balanceNow(card, s, t, '2026-11-28').pending).toEqual({ count: 1, pence: 700 });
  });
});
