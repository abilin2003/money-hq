// Charts, IOUs, goals and net worth (insights have their own tests). All data here is made up.
import { describe, it, expect } from 'vitest';
import { dailySpend, cumulative, categoryChanges, bridgeSteps, splitTotals, equalShares, peopleBalances, suggestIouMatches, projectGoal, neededMonthly, netWorth, netWorthSeries } from '../../src/lib/analytics.js';
import { summarise } from '../../src/lib/summary.js';

const tx = (id, date, amount_pence, more = {}) => ({ id, date, amount_pence, kind: 'spend', status: 'reviewed', bucket: 'Fun', category: 'Going out', raw_description: 'Test', ...more });
const cycle = { start: '2026-11-01', end: '2026-11-05' };

describe('splits and IOUs (spec Phase 3 check)', () => {
  it('a £40 dinner split with one friend is £20 spent in Fun and £20 owed', () => {
    const dinner = tx('d', '2026-11-02', -4000);
    const splits = splitTotals([{ transaction_id: 'd', person_id: 'k', amount_pence: 2000 }]);
    const s = summarise([dinner], splits);
    expect([s.spent, s.byBucket.Fun, s.owedToYou]).toEqual([2000, 2000, 2000]);
  });
  it('their £20 repayment clears it and does not count as income', () => {
    const s = summarise([tx('d', '2026-11-02', -4000), tx('r', '2026-11-03', 2000, { kind: 'repayment' })], { d: 2000 });
    expect(s.income).toBe(0);
    expect(s.paidBack).toBe(2000);
  });
  it('a three-way split leaves you the rounding', () => {
    expect(equalShares(-1000, 2)).toEqual([333, 333]);
  });
  it('balances per person, oldest first, and a partial repayment leaves the rest open', () => {
    const people = [{ id: 'k', name: 'Kevin Test' }, { id: 'j', name: 'Jo Test' }];
    const txById = { a: { date: '2026-10-01' }, b: { date: '2026-09-01' } };
    const splits = [{ id: 1, transaction_id: 'a', person_id: 'k', amount_pence: 2000 }, { id: 2, transaction_id: 'b', person_id: 'j', amount_pence: 1500 }, { id: 3, transaction_id: 'a', person_id: 'j', amount_pence: 500, settled_by_transaction_id: 'x' }];
    expect(peopleBalances(splits, people, txById).map((p) => [p.name, p.owed])).toEqual([['Jo Test', 1500], ['Kevin Test', 2000]]);
  });
  it('money in from a person suggests their open IOU (same name, within £1, last 60 days), even when two are open', () => {
    const people = [{ id: 'k', name: 'Kevin Test' }];
    const txById = { a: { date: '2026-10-20' }, b: { date: '2026-06-01' } };
    const open = [{ id: 1, transaction_id: 'a', person_id: 'k', amount_pence: 2000 }, { id: 2, transaction_id: 'b', person_id: 'k', amount_pence: 2000 }];
    const m = suggestIouMatches({ amount_pence: 2050, date: '2026-11-01', raw_description: 'From KEVIN TEST' }, open, people, txById);
    expect(m.map((s) => s.id)).toEqual([1]);
  });
});

describe('charts', () => {
  const rows = [tx('1', '2026-11-01', -500), tx('2', '2026-11-03', -1500), tx('3', '2026-11-03', -100, { status: 'needs_review' }), tx('4', '2026-11-04', -9999, { kind: 'transfer' })];
  it('daily spending covers every day of the cycle and leaves out transfers and undecided lines', () => {
    const days = dailySpend(rows, cycle);
    expect(days.map((d) => d.pence)).toEqual([500, 0, 1500, 0, 0]);
    expect(cumulative(days, 3)).toEqual([500, 500, 2000]);
  });
  it('daily spending takes paybacks off the day they came in, and leaves out buys paid from savings', () => {
    const days = dailySpend([tx('a', '2026-11-01', -4000), tx('b', '2026-11-02', 1000, { kind: 'repayment' }), tx('c', '2026-11-03', -90000, { from_savings: true })], cycle);
    expect(days.map((d) => d.pence)).toEqual([4000, -1000, 0, 0, 0]);
  });
  it('category changes and the bridge between two periods', () => {
    const before = summarise([tx('a', '2026-10-01', -3000), tx('b', '2026-10-02', -1000, { bucket: 'Groceries', category: 'Groceries' })]);
    const now = summarise([tx('c', '2026-11-01', -5000)]);
    expect(categoryChanges(now, before)).toEqual([{ name: 'Going out', now: 5000, before: 3000, change: 2000 }, { name: 'Groceries', now: 0, before: 1000, change: -1000 }]);
    expect(bridgeSteps(before, now)).toEqual([{ name: 'Fun', delta: 2000 }, { name: 'Groceries', delta: -1000 }]);
  });
  it('projects when a goal is reached, and growth is an assumption that shortens it', () => {
    expect(projectGoal({ target: 100000, saved: 40000, monthly: 10000 }, '2026-11-25')).toMatchObject({ months: 6, date: '2027-05-25' });
    expect(projectGoal({ target: 100000, saved: 0, monthly: 0 }, '2026-11-25').months).toBeNull();
    expect(projectGoal({ target: 1000000, saved: 0, monthly: 20000, growthPct: 7 }, '2026-11-25').months).toBeLessThan(50);
  });
  it('monthly amount needed by a date', () => {
    expect(neededMonthly(100000, 40000, '2026-11-25', '2027-05-01')).toBe(10000);
  });
  it('net worth uses each account\'s latest balance, a card balance counts against you, stale after 35 days', () => {
    const accounts = [{ id: 'c', name: 'Current', type: 'current' }, { id: 'k', name: 'Card', type: 'credit_card' }, { id: 'p', name: 'Pension', type: 'pension' }];
    const snaps = [{ account_id: 'c', date: '2026-09-01', balance_pence: 50000 }, { account_id: 'c', date: '2026-11-20', balance_pence: 80000 }, { account_id: 'k', date: '2026-11-20', balance_pence: 30000 }];
    const nw = netWorth(accounts, snaps, '2026-11-25');
    expect(nw.total).toBe(50000);
    expect(nw.rows.find((r) => r.id === 'p').stale).toBe(true);
    expect(netWorthSeries(accounts, snaps).map((p) => p.total)).toEqual([50000, 50000]);
  });
});
