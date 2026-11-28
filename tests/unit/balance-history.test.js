// Wealth → Balance history: every account's history ends on the same live balance the rest of the app shows
// (typed-in balances plus what's happened since), a card's history is what you owe, and nothing is invented.
// Synthetic data. Regression test for "Capital One balance history shows £0".
import { describe, it, expect } from 'vitest';
import { balanceHistory, accountBalance, trackedNetWorth, allBalances } from '../../src/lib/balances.js';

const bank = { id: 'bank', name: 'Test Bank', type: 'current' };
const card = { id: 'card', name: 'Test Card', institution: 'Test Card', type: 'credit_card' };
const snaps = [
  { account_id: 'bank', date: '2026-11-10', balance_pence: 100000 },
  { account_id: 'bank', date: '2026-11-26', balance_pence: 200000 },
  { account_id: 'card', date: '2026-11-26', balance_pence: 0 }, // typed in as "owe nothing"
];
const spend = (account_id, pence, date = '2026-11-27') => ({ id: `${account_id}${pence}`, account_id, date, amount_pence: -pence, kind: 'spend', status: 'reviewed', raw_description: 'x' });
const today = '2026-11-28';

describe('balance history ends on the live balance', () => {
  it('a card with a purchase since the typed-in £0: history ends on what you owe now, not £0', () => {
    const h = balanceHistory(card, snaps, [spend('card', 4720)], today);
    expect(h.isDebt).toBe(true);
    expect(h.points.map((p) => [p.date, p.pence, p.kind])).toEqual([['2026-11-26', 0, 'typed'], ['2026-11-28', 4720, 'now']]);
    expect(h.points.at(-1).pence).toBe(accountBalance(card, snaps, [spend('card', 4720)], today).pence);
    expect(h.points.at(-1).status).toBe('estimated');
  });

  it('a normal account: typed-in balances, then today’s live figure', () => {
    const h = balanceHistory(bank, snaps, [spend('bank', 2500)], today);
    expect(h.points.map((p) => [p.pence, p.kind])).toEqual([[100000, 'typed'], [200000, 'typed'], [197500, 'now']]);
  });

  it('nothing has happened since: no extra point, and it isn’t made up', () => {
    const h = balanceHistory(bank, snaps, [], '2026-11-26');
    expect(h.points).toHaveLength(2);
    expect(h.points.every((p) => p.kind === 'typed')).toBe(true);
  });

  it('no typed-in balance: no history at all (never invented)', () => {
    expect(balanceHistory({ id: 'x', name: 'New', type: 'current' }, snaps, [spend('x', 100)], today).points).toEqual([]);
  });

  it('lines waiting in the inbox are left out, like everywhere else', () => {
    const waiting = { ...spend('bank', 9999), status: 'needs_review' };
    expect(balanceHistory(bank, snaps, [waiting], today).points).toHaveLength(2);
  });

  it('history, account balance and net worth agree for every account', () => {
    const txs = [spend('card', 4720), spend('bank', 2500)];
    const rows = allBalances([bank, card], snaps, txs, today);
    for (const r of rows) expect(balanceHistory(r.account, snaps, txs, today).points.at(-1).pence).toBe(r.pence);
    // the card is a liability: net worth = bank − what you owe
    expect(trackedNetWorth(rows).total).toBe(197500 - 4720);
  });
});
