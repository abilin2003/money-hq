// The budget engine (spec section 4, rules 3, 8, 9 and 11; section 11 bugs 1-3). All data here is made up.
import { describe, it, expect } from 'vitest';
import { billDates, billsInCycle, safeToSpend, effectiveBudgets, detectRecurring, planTotals, fundNeedPerCycle } from '../../src/lib/budget.js';
import { cycleFor } from '../../src/lib/cycles.js';

const paydays = ['2026-10-26', '2026-11-24', '2026-12-18'];
const dec = cycleFor('2026-11-25', paydays); // 24 Nov to 17 Dec, day 2 of 24
const bill = (name, amount_pence, day, match = name.toLowerCase()) => ({ name, amount_pence, cadence: 'monthly', next_date: `2026-12-${String(day).padStart(2, '0')}`, match, is_active: true });
const tx = (raw_description, amount_pence, date, more = {}) => ({ raw_description, amount_pence, date, kind: 'spend', status: 'reviewed', bucket: 'Essentials', ...more });

describe('bills', () => {
  it('finds each monthly bill date inside a cycle that crosses a month end', () => {
    expect(billDates(bill('Gym', 2995, 1), dec)).toEqual(['2026-12-01']);
    expect(billDates(bill('Phone', 1000, 22), dec)).toEqual([]); // 22 Nov is before the cycle, 22 Dec after it
    expect(billDates(bill('Claude', 1800, 25), dec)).toEqual(['2026-11-25']);
  });
  it('a bill on the 31st falls on the last day of shorter months', () => {
    const feb = { start: '2027-02-01', end: '2027-02-28' };
    expect(billDates({ ...bill('Rent', 100, 31), next_date: '2027-01-31' }, feb)).toEqual(['2027-02-28']);
  });
  it('marks a bill as paid when a matching payment is already in the cycle', () => {
    const list = billsInCycle([bill('Claude', 1800, 25, 'claude')], dec, [tx('Claude.ai Subscription', -1800, '2026-11-25')], '2026-11-26');
    expect(list[0]).toMatchObject({ date: '2026-11-25', paid: true });
  });
  it('a bill not seen yet is still due', () => {
    const list = billsInCycle([bill('Gym', 2995, 1, 'clubwise')], dec, [], '2026-11-25');
    expect(list[0]).toMatchObject({ date: '2026-12-01', paid: false });
  });
});

describe('safe to spend = money left in buckets − bills still due before payday − reserve', () => {
  const budgets = { Essentials: 8000, Groceries: 9000, Fun: 11500 };
  it('day 2 with nothing spent: the whole budget minus bills still due, with the working shown', () => {
    const s = safeToSpend({ cycle: dec, today: '2026-11-25', budgets, spentByBucket: {}, bills: [{ name: 'Gym', amount_pence: 2995, paid: false, date: '2026-12-01' }], reserve: 0 });
    expect(s.total).toBe(28500 - 2995);
    expect(s.lines.map((l) => l.label)).toEqual(['Left in your buckets', 'Bills still due before payday', 'Reserve']);
    expect(s.perDay).toBe(Math.floor((28500 - 2995) / 23)); // 23 days including today
  });
  it('overspending one bucket brings safe to spend down', () => {
    const s = safeToSpend({ cycle: dec, today: '2026-11-25', budgets, spentByBucket: { Fun: 14000 }, bills: [], reserve: 0 });
    expect(s.total).toBe(28500 - 14000);
  });
  it('never goes below zero, and says so instead of showing a negative amount', () => {
    const s = safeToSpend({ cycle: dec, today: '2026-11-25', budgets, spentByBucket: { Fun: 40000 }, bills: [], reserve: 0 });
    expect(s.total).toBe(0);
    expect(s.short).toBe(40000 - 28500);
  });
  it('an unbudgeted bucket (Fuel) is tracked but not counted', () => {
    const s = safeToSpend({ cycle: dec, today: '2026-11-25', budgets, spentByBucket: { Fuel: 9000 }, bills: [], reserve: 0 });
    expect(s.total).toBe(28500);
  });
  it('a paid bill is not held back twice (its payment is already in the bucket spending)', () => {
    const s = safeToSpend({ cycle: dec, today: '2026-11-25', budgets, spentByBucket: { Essentials: 1800 }, bills: [{ name: 'Claude', amount_pence: 1800, paid: true }], reserve: 0 });
    expect(s.total).toBe(28500 - 1800);
  });
  it('works in whole pence (the £100.01 bug cannot happen)', () => {
    const s = safeToSpend({ cycle: dec, today: '2026-11-25', budgets: { Groceries: 10000 }, spentByBucket: {}, bills: [], reserve: 0 });
    expect(Number.isInteger(s.total) && s.total === 10000).toBe(true);
  });
});

describe('leftovers on payday', () => {
  it('sweep starts each bucket fresh; rollover adds what was left last cycle', () => {
    const e = effectiveBudgets({ Fun: 11500, Groceries: 9000 }, { Fun: 11500, Groceries: 9000 }, { Fun: 10000, Groceries: 9500 }, { Fun: 'rollover', Groceries: 'rollover' });
    expect(e).toEqual({ Fun: { budget: 11500, carried: 1500, total: 13000 }, Groceries: { budget: 9000, carried: 0, total: 9000 } });
    expect(effectiveBudgets({ Fun: 11500 }, { Fun: 11500 }, { Fun: 10000 }, {}).Fun.carried).toBe(0);
  });
});

describe('payday plan', () => {
  it('pay minus everything assigned is what is left to assign, and can be negative', () => {
    const t = planTotals(200000, [{ amount_pence: 50000 }, { amount_pence: 30000 }], { Fun: 11500, Groceries: 9000 });
    expect(t).toMatchObject({ pay: 200000, items: 80000, buckets: 20500, unassigned: 200000 - 80000 - 20500 });
    expect(planTotals(1000, [{ amount_pence: 1724 }], {}).unassigned).toBe(-724);
  });
  it('a sinking fund needs (target − saved) spread over the cycles left before its date', () => {
    expect(fundNeedPerCycle({ target_pence: 50000, balance_pence: 20000, due_date: '2027-03-01' }, '2026-11-25')).toBe(10000); // £300 over 3 paydays
    expect(fundNeedPerCycle({ target_pence: 50000, balance_pence: 60000, due_date: '2027-03-01' }, '2026-11-25')).toBe(0);
    expect(fundNeedPerCycle({ target_pence: 50000, balance_pence: 0, due_date: null }, '2026-11-25')).toBeNull();
  });
});

describe('recurring detection', () => {
  it('suggests a shop paid in 3 different months for a similar amount, unless it is already a bill', () => {
    const txs = ['2026-08-03', '2026-09-03', '2026-10-03'].flatMap((d) => [tx('Netflix.com', -1099, d), tx('Tesco', -2000 - Number(d.slice(6, 7)) * 900, d)]);
    expect(detectRecurring(txs, []).map((r) => r.name)).toEqual(['Netflix.com']);
    expect(detectRecurring(txs, [{ name: 'Netflix', match: 'netflix' }])).toEqual([]);
  });
  it('a shop you visit several times a month is not a bill, even at a similar price', () => {
    const weekly = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-09-03', '2026-09-10', '2026-09-17', '2026-10-03', '2026-10-10'].map((d) => tx('Spar Shop', -175, d));
    expect(detectRecurring(weekly, [])).toEqual([]);
  });
});
