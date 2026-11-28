// "Who is this purchase for?": your own spending, a purchase someone pays you back for, and a shared purchase.
// The full amount leaves your account once; only your share is spending; the rest are IOUs. Made-up figures.
import { describe, it, expect } from 'vitest';
import { planShares, equalSplit, checkSplitChange } from '../../src/lib/shares.js';
import { summarise } from '../../src/lib/summary.js';
import { accountBalance, allBalances, trackedNetWorth } from '../../src/lib/balances.js';
import { allocateRepayment } from '../../src/lib/ious.js';

const ul = { id: 'ul', name: 'Bank', type: 'current' };
const snaps = [{ account_id: 'ul', date: '2026-11-26', balance_pence: 50000 }];
const buy = (pence, more = {}) => ({ id: 'b', account_id: 'ul', date: '2026-11-27', amount_pence: -pence, kind: 'spend', status: 'reviewed', bucket: 'Personal Upkeep', category: 'Clothes', ...more });
const splitsMap = (ious) => ({ b: ious.reduce((a, s) => a + s.amount_pence, 0) });

describe('my own spending (the default)', () => {
  it('no IOUs; all of it is yours', () => {
    expect(planShares(1250, 'mine')).toEqual({ myShare: 1250, ious: [] });
  });
});

describe('someone else is paying me back', () => {
  it('£70 of clothes for Dad: all £70 leaves the bank, Dad owes £70, none of it is your spending', () => {
    const p = planShares(7000, 'payback', { name: 'Dad', due: '2026-12-10', reason: 'Christmas present for my brother' });
    expect(p).toEqual({ myShare: 0, ious: [{ name: 'Dad', amount_pence: 7000, due_date: '2026-12-10', note: 'Christmas present for my brother' }] });
    const s = summarise([buy(7000)], splitsMap(p.ious));
    expect(s.netSpent).toBe(0);
    expect(s.byBucket['Personal Upkeep'] || 0).toBe(0);
    expect(accountBalance(ul, snaps, [buy(7000)], '2026-11-27').pence).toBe(43000); // the full £70 left
  });
  it('part of it: they owe what you say, you keep the rest as your spending', () => {
    const p = planShares(7000, 'payback', { name: 'Dad', owed: 5000 });
    expect(p.myShare).toBe(2000);
    expect(summarise([buy(7000)], splitsMap(p.ious)).netSpent).toBe(2000);
  });
  it('nobody named, nothing owed, or more than the purchase: refused', () => {
    expect(planShares(7000, 'payback', {}).error).toMatch(/Who owes you/);
    expect(planShares(7000, 'payback', { name: 'Dad', owed: 0 }).error).toBeTruthy();
    expect(planShares(7000, 'payback', { name: 'Dad', owed: 9000 }).error).toMatch(/more than the purchase \(£70\.00\)/);
  });
  it('Dad paying back in cash: the IOU clears, the cash goes up, and it’s never income', () => {
    expect(allocateRepayment([{ id: 's', amount_pence: 7000, date: '2026-11-27' }], 7000)).toMatchObject({ settle: ['s'], owedAfter: 0 });
    const cash = { id: 'cash', name: 'Cash', type: 'cash' };
    const back = { id: 'r', account_id: 'cash', date: '2026-12-01', amount_pence: 7000, kind: 'repayment', status: 'reviewed' };
    expect(accountBalance(cash, [{ account_id: 'cash', date: '2026-11-30', balance_pence: 0 }], [back], '2026-12-01').pence).toBe(7000);
    expect(summarise([back], {}, new Set(['r'])).income).toBe(0);
  });
});

describe('split between me and others', () => {
  it('£100 meal: £40 mine, two friends £30 each; one purchase, £40 of spending, £60 owed', () => {
    const p = planShares(10000, 'split', { myShare: 4000, people: [{ name: 'Sam', pence: 3000 }, { name: 'Ben', pence: 3000 }] });
    expect(p.ious.map((x) => [x.name, x.amount_pence])).toEqual([['Sam', 3000], ['Ben', 3000]]);
    const meal = buy(10000, { bucket: 'Fun', category: 'Eating out' });
    const s = summarise([meal], splitsMap(p.ious));
    expect(s.netSpent).toBe(4000);
    expect(s.byBucket.Fun).toBe(4000);
    expect(accountBalance(ul, snaps, [meal], '2026-11-27').pence).toBe(40000); // £100 left the bank once
  });
  it('the shares must add up to what was paid', () => {
    expect(planShares(10000, 'split', { myShare: 4000, people: [{ name: 'Sam', pence: 3000 }] }).error).toMatch(/£30\.00 of the £100\.00 isn’t assigned/);
    expect(planShares(10000, 'split', { myShare: 5000, people: [{ name: 'Sam', pence: 3000 }, { name: 'Ben', pence: 3000 }] }).error).toMatch(/come to £110\.00, £10\.00 more/);
    expect(planShares(10000, 'split', { myShare: 4000, people: [{ name: 'Sam', pence: 3000 }, { name: 'sam', pence: 3000 }] }).error).toMatch(/twice/);
    expect(planShares(10000, 'split', { myShare: 4000, people: [{ name: '', pence: 6000 }] }).error).toMatch(/name/);
  });
  it('an equal split shares it evenly; odd pennies are yours', () => {
    expect(equalSplit(10000, 2)).toEqual({ mine: 3334, each: [3333, 3333] });
    expect(equalSplit(6000, 2)).toEqual({ mine: 2000, each: [2000, 2000] });
  });
});

describe('net worth with money owed to you', () => {
  it('paying £70 for Dad moves money from your bank to “owed to you”; his repayment moves it back; net worth is steady', () => {
    const before = trackedNetWorth(allBalances([ul], snaps, [], '2026-11-27'), 0).total;
    const after = trackedNetWorth(allBalances([ul], snaps, [buy(7000)], '2026-11-27'), 7000).total;
    const back = { id: 'r', account_id: 'ul', date: '2026-11-28', amount_pence: 7000, kind: 'repayment', status: 'reviewed' };
    const repaid = trackedNetWorth(allBalances([ul], snaps, [buy(7000), back], '2026-11-28'), 0).total;
    expect([after, repaid]).toEqual([before, before]);
  });
});

describe('changing a purchase that has IOUs', () => {
  const splits = [{ id: 'a', amount_pence: 3000 }, { id: 'b', amount_pence: 3000, settled_by_transaction_id: 'r' }];
  it('an open IOU can be changed or removed; your share follows', () => {
    expect(checkSplitChange(splits, 10000, { setAmount: { id: 'a', pence: 2000 } })).toEqual({ ok: true, myShare: 5000 });
    expect(checkSplitChange(splits, 10000, { remove: 'a' })).toEqual({ ok: true, myShare: 7000 });
  });
  it('a paid-back IOU is never silently changed or erased, and IOUs can’t exceed the purchase', () => {
    expect(checkSplitChange(splits, 10000, { remove: 'b' }).error).toMatch(/paid back/);
    expect(checkSplitChange(splits, 10000, { setAmount: { id: 'b', pence: 1000 } }).error).toMatch(/paid back/);
    expect(checkSplitChange(splits, 10000, { total: 5000 }).error).toMatch(/more than the purchase \(£50\.00\)/);
  });
});
