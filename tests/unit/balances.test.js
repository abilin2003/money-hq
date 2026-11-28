// Live account balances: one calculation, the examples from the brief, and allocations kept apart from balances.
// Made-up figures.
import { describe, it, expect } from 'vitest';
import { accountBalance, allBalances, trackedNetWorth, allocationsIn, liveGroups } from '../../src/lib/balances.js';
import { summarise } from '../../src/lib/summary.js';

const ul = { id: 'ul', name: 'Bank', type: 'current' };
const rv = { id: 'rv', name: 'Spending', type: 'current' };
const isa = { id: 'isa', name: 'Cash ISA', type: 'isa' };
const cc = { id: 'cc', name: 'Card Co', institution: 'Card Co', type: 'credit_card' };
const pen = { id: 'pen', name: 'Pension', type: 'pension' };
const snaps = [
  { account_id: 'ul', date: '2026-11-26', balance_pence: 20000 },
  { account_id: 'rv', date: '2026-11-26', balance_pence: 30000 },
  { account_id: 'isa', date: '2026-11-26', balance_pence: 600000 },
  { account_id: 'cc', date: '2026-11-26', balance_pence: 0 },
];
const line = (account_id, pence, kind, more = {}) => ({ id: `${account_id}${pence}${kind}`, account_id, date: '2026-11-27', amount_pence: pence, kind, status: 'reviewed', raw_description: kind, ...more });
const worth = (txs) => trackedNetWorth(allBalances([ul, rv, isa, cc], snaps, txs, '2026-11-27')).total;
const before = worth([]);

describe('A: moving money between your accounts', () => {
  const out = line('isa', -100000, 'transfer', { id: 'o', transfer_pair_id: 'i' });
  const inn = line('ul', 100000, 'transfer', { id: 'i', transfer_pair_id: 'o' });
  it('takes it off one account and adds it to the other; net worth, spending and income stay the same', () => {
    expect(accountBalance(isa, snaps, [out, inn], '2026-11-27').pence).toBe(500000);
    expect(accountBalance(ul, snaps, [out, inn], '2026-11-27').pence).toBe(120000);
    expect(worth([out, inn])).toBe(before);
    expect(summarise([out, inn])).toMatchObject({ totalSpent: 0, income: 0 });
  });
  it('a move recorded on one side only shows up as a drop in net worth (why both halves are needed)', () => {
    expect(worth([out])).toBe(before - 100000);
  });
});

describe('B: everyday spending', () => {
  it('£10 at a shop on the spending account comes off that balance once', () => {
    expect(accountBalance(rv, snaps, [line('rv', -1000, 'spend')], '2026-11-27').pence).toBe(29000);
  });
});

describe('C: an IOU repayment', () => {
  it('adds to the account it went into, and is never income', () => {
    const back = line('ul', 1750, 'repayment');
    expect(accountBalance(ul, snaps, [back], '2026-11-27').pence).toBe(21750);
    expect(summarise([back], {}, new Set([back.id])).income).toBe(0);
  });
});

describe('D: the credit card', () => {
  const fuel = line('cc', -5000, 'spend', { raw_description: 'Fuel' });
  it('a card purchase is debt: the card shows what you owe and net worth falls by it', () => {
    const b = accountBalance(cc, snaps, [fuel], '2026-11-27');
    expect(b).toMatchObject({ isDebt: true, pence: 5000, value: -5000 });
    expect(worth([fuel])).toBe(before - 5000);
  });
  it('repaying it from the bank (both halves recorded) clears the debt once and isn’t more spending', () => {
    const pay = line('ul', -5000, 'transfer', { id: 'p', transfer_pair_id: 'q', raw_description: 'Card Co' });
    const got = line('cc', 5000, 'transfer', { id: 'q', transfer_pair_id: 'p' });
    expect(accountBalance(cc, snaps, [fuel, pay, got], '2026-11-27').pence).toBe(0);
    expect(accountBalance(ul, snaps, [fuel, pay, got], '2026-11-27').pence).toBe(15000);
    expect(worth([fuel, pay, got])).toBe(before - 5000);
    expect(summarise([fuel, pay, got]).totalSpent).toBe(5000);
  });
  it('an older-style repayment recorded only on the bank side still clears the card', () => {
    const pay = line('ul', -5000, 'transfer', { raw_description: 'CARD CO PAYMENT' });
    expect(accountBalance(cc, snaps, [fuel, pay], '2026-11-27').pence).toBe(0);
  });
});

describe('E: editing and deleting', () => {
  it('balances are worked out from the lines each time, so a change or a deletion is reflected straight away', () => {
    const t = line('rv', -1000, 'spend');
    expect(accountBalance(rv, snaps, [{ ...t, amount_pence: -2500 }], '2026-11-27').pence).toBe(27500);
    expect(accountBalance(rv, snaps, [{ ...t, account_id: 'ul' }], '2026-11-27').pence).toBe(30000);
    expect(accountBalance(rv, snaps, [], '2026-11-27').pence).toBe(30000);
  });
});

describe('net worth and missing balances', () => {
  it('an account with no balance is unknown, named, and never guessed', () => {
    const rows = allBalances([ul, pen], snaps, [], '2026-11-27');
    expect(rows.find((r) => r.account.id === 'pen')).toMatchObject({ status: 'unknown', value: null });
    expect(trackedNetWorth(rows)).toMatchObject({ total: 20000, unknown: ['Pension'] });
  });
  it('verified only while nothing has happened since the typed-in balances', () => {
    expect(trackedNetWorth(allBalances([ul], snaps, [], '2026-11-27')).status).toBe('verified');
    expect(trackedNetWorth(allBalances([ul], snaps, [line('ul', -100, 'spend')], '2026-11-27')).status).toBe('estimated');
  });
});

describe('what the money in an account is for', () => {
  it('funds kept in an account, and what isn’t allocated', () => {
    const funds = [{ id: 'ef', account_id: 'isa', balance_pence: 500000 }, { id: 'x', account_id: 'other', balance_pence: 1 }];
    expect(allocationsIn(isa, funds, 500000)).toMatchObject({ allocated: 500000, unallocated: 0 });
    expect(allocationsIn(isa, funds, 600000).unallocated).toBe(100000);
    expect(allocationsIn(isa, funds, null).unallocated).toBe(null);
  });
});

describe('Wealth’s live groups', () => {
  it('cash, investments, pension and debt from the same live balances; assets minus liabilities is net worth', () => {
    const fuel = line('cc', -5000, 'spend', { raw_description: 'Fuel' });
    const spend = line('rv', -1000, 'spend');
    const rows = allBalances([ul, rv, isa, cc, pen], snaps, [fuel, spend], '2026-11-27');
    const g = liveGroups(rows);
    expect(g.cash).toMatchObject({ pence: 20000 + 29000, status: 'estimated' });
    expect(g.investments).toMatchObject({ pence: 600000, status: 'verified' });
    expect(g.pension).toMatchObject({ pence: 0, status: 'unknown' });
    expect(g.debt).toMatchObject({ pence: 5000, status: 'estimated' });
    expect(g.assets - g.liabilities).toBe(trackedNetWorth(rows).total);
  });
});
