// The core money scenarios (testing foundation, Phase 1), using the app's real calculation code:
// src/lib/balances.js (account balances, net worth), src/lib/summary.js (spending and income),
// src/lib/shares.js (purchases with IOUs), src/lib/ious.js (repayments), src/lib/money.js (reading amounts).
// Synthetic accounts and figures only.
import { describe, it, expect } from 'vitest';
import { accountBalance, allBalances, trackedNetWorth } from '../../src/lib/balances.js';
import { summarise } from '../../src/lib/summary.js';
import { planShares } from '../../src/lib/shares.js';
import { allocateRepayment } from '../../src/lib/ious.js';
import { parsePence } from '../../src/lib/money.js';

const day = '2026-11-27';
const bank = { id: 'bank', name: 'Test Bank', type: 'current' };
const isa = { id: 'isa', name: 'Test Cash ISA', type: 'isa' };
const card = { id: 'card', name: 'Test Card', institution: 'Test Card', type: 'credit_card' };
const snaps = [
  { account_id: 'bank', date: '2026-11-26', balance_pence: 200000 }, // £2,000
  { account_id: 'isa', date: '2026-11-26', balance_pence: 600000 }, // £6,000
  { account_id: 'card', date: '2026-11-26', balance_pence: 0 },
];
let n = 0;
const line = (account_id, pence, kind, more = {}) => ({ id: `t${n++}`, account_id, date: day, amount_pence: pence, kind, status: 'reviewed', raw_description: kind, ...more });
const bal = (a, txs) => accountBalance(a, snaps, txs, day).pence;
const worth = (txs, owed = 0) => trackedNetWorth(allBalances([bank, isa, card], snaps, txs, day), owed).total;
const START_WORTH = 800000;

describe('A: moving £1,000 from the Cash ISA to the bank', () => {
  const out = line('isa', -100000, 'transfer', { id: 'out', transfer_pair_id: 'in' });
  const inn = line('bank', 100000, 'transfer', { id: 'in', transfer_pair_id: 'out' });
  it('bank £3,000, ISA £5,000, net worth unchanged, no income, no spending', () => {
    expect(bal(bank, [out, inn])).toBe(300000);
    expect(bal(isa, [out, inn])).toBe(500000);
    expect(worth([out, inn])).toBe(START_WORTH);
    expect(summarise([out, inn])).toMatchObject({ income: 0, totalSpent: 0, netSpent: 0 });
  });
});

describe('B: a £25 ASOS purchase', () => {
  const asos = line('bank', -2500, 'spend', { raw_description: 'ASOS', bucket: 'Personal Upkeep', category: 'Clothes & shopping' });
  it('bank £1,975, one outgoing line, £25 spending in its budget bucket', () => {
    expect(bal(bank, [asos])).toBe(197500);
    const s = summarise([asos]);
    expect(s).toMatchObject({ netSpent: 2500, count: 1 });
    expect(s.byBucket['Personal Upkeep']).toBe(2500);
  });
});

describe('C: £150 headphones, Dad pays it all back', () => {
  const plan = planShares(15000, 'payback', { name: 'Dad' });
  const buy = line('bank', -15000, 'spend', { id: 'headphones', bucket: 'Fun', category: 'Gifts' });
  it('bank £1,850, one £150 IOU for Dad, £0 of it your spending, net worth unchanged', () => {
    expect(plan).toEqual({ myShare: 0, ious: [{ name: 'Dad', amount_pence: 15000, due_date: null, note: null }] });
    expect(bal(bank, [buy])).toBe(185000);
    const s = summarise([buy], { headphones: 15000 });
    expect(s.netSpent).toBe(0);
    expect(s.byBucket.Fun || 0).toBe(0);
    expect(worth([buy], 15000)).toBe(START_WORTH); // £150 moved from the bank to "owed to you"
  });
});

describe('D: a £100 meal, £40 mine, two friends £30 each', () => {
  const plan = planShares(10000, 'split', { myShare: 4000, people: [{ name: 'Friend A', pence: 3000 }, { name: 'Friend B', pence: 3000 }] });
  const meal = line('bank', -10000, 'spend', { id: 'meal', bucket: 'Fun', category: 'Eating out' });
  it('one £100 payment, £40 spending, two £30 IOUs, shares add up to £100', () => {
    expect(plan.ious.map((i) => i.amount_pence)).toEqual([3000, 3000]);
    expect(plan.myShare + plan.ious.reduce((a, i) => a + i.amount_pence, 0)).toBe(10000);
    expect(bal(bank, [meal])).toBe(190000);
    expect(summarise([meal], { meal: 6000 })).toMatchObject({ netSpent: 4000, count: 1 });
  });
});

describe('E: £100 of a £150 IOU paid back into the bank', () => {
  it('bank +£100, £50 still owed, not income, counted once', () => {
    const plan = allocateRepayment([{ id: 'iou', amount_pence: 15000, date: day }], 10000);
    expect(plan).toEqual({ settle: [], partial: { id: 'iou', paid: 10000, rest: 5000 }, owedAfter: 5000 });
    const back = line('bank', 10000, 'repayment', { id: 'back' });
    expect(bal(bank, [back])).toBe(210000);
    expect(summarise([back], {}, new Set(['back'])).income).toBe(0);
    expect(worth([back], 5000)).toBe(worth([], 15000)); // cash up £100, owed to you down £100
  });
});

describe('F: £47.20 of fuel on the credit card, then a repayment', () => {
  const fuel = line('card', -4720, 'spend', { raw_description: 'Fuel', bucket: 'Fuel', category: 'Fuel' });
  it('card debt +£47.20, fuel counted once, net worth reflects the debt', () => {
    expect(accountBalance(card, snaps, [fuel], day)).toMatchObject({ isDebt: true, pence: 4720 });
    expect(summarise([fuel]).byBucket.Fuel).toBe(4720);
    expect(worth([fuel])).toBe(START_WORTH - 4720);
  });
  it('repaying it from the bank lowers cash and the debt, with no second expense', () => {
    const pay = line('bank', -4720, 'transfer', { id: 'p', transfer_pair_id: 'q', raw_description: 'Test Card' });
    const got = line('card', 4720, 'transfer', { id: 'q', transfer_pair_id: 'p' });
    expect(bal(card, [fuel, pay, got])).toBe(0);
    expect(bal(bank, [fuel, pay, got])).toBe(200000 - 4720);
    expect(summarise([fuel, pay, got]).totalSpent).toBe(4720);
    expect(worth([fuel, pay, got])).toBe(START_WORTH - 4720);
  });
});

describe('G: invalid and unexpected inputs', () => {
  it('words, blanks and nonsense are not amounts', () => {
    for (const bad of ['lots', 'the full amount', '', '   ', '12..5', '£', '1.2.3']) expect(parsePence(bad)).toBe(null);
    expect(parsePence('25')).toBe(2500);
  });
  it('a purchase needs a positive amount; IOUs need a person and an amount; shares must add up', () => {
    expect(planShares(0, 'mine').error).toBeTruthy();
    expect(planShares(-500, 'mine').error).toBeTruthy();
    expect(planShares(15000, 'payback', { name: '' }).error).toMatch(/Who owes you/);
    expect(planShares(15000, 'payback', { name: 'Dad', owed: -100 }).error).toBeTruthy();
    expect(planShares(15000, 'payback', { name: 'Dad', owed: Number.NaN }).error).toBeTruthy();
    expect(planShares(10000, 'split', { myShare: 4000, people: [{ name: 'A', pence: 3000 }, { name: 'B', pence: 2000 }] }).error).toMatch(/isn’t assigned/);
  });
  it('a repayment of nothing, or more than owed, is refused', () => {
    expect(allocateRepayment([{ id: 'iou', amount_pence: 15000 }], 0).error).toBeTruthy();
    expect(allocateRepayment([{ id: 'iou', amount_pence: 15000 }], 20000).error).toMatch(/more than they owe/);
  });
  // KNOWN ISSUE #2 lives in the form (src/views/add-for.js), which turns unreadable text into "no amount given"
  // and so into the whole amount: covered by the browser test "words typed as the amount owed are refused".
  // Here: an expected-by date that isn't a date isn't checked before saving (the database refuses it, and
  // nothing is saved; the date picker normally prevents it). Recorded as a difference, not changed.
  it.fails('KNOWN DIFFERENCE: an invalid expected-by date is caught before saving', () => {
    expect(planShares(15000, 'payback', { name: 'Dad', due: 'not-a-date' }).error).toBeTruthy();
  });
});
