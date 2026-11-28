// Real-database tests: saving purchases and IOUs through the real add_purchase_with_ious function, with Row Level
// Security on, in the separate TEST Supabase project (made-up data only). Skipped until .env.test.local exists.
// Every row a test creates is removed again at the end.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { configured, notConfiguredReason, signedIn, assertOnlyTestData } from './test-db.js';
import { accountBalance } from '../../src/lib/balances.js';
import { summarise } from '../../src/lib/summary.js';

const run = `run-${Date.now()}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const yesterday = (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

if (!configured) console.warn(notConfiguredReason);

describe.skipIf(!configured)('real database: purchases with IOUs', () => {
  let A; let B; let bank;
  const made = { transactions: [], people: [] };

  beforeAll(async () => {
    A = await signedIn('A');
    B = await signedIn('B');
    await assertOnlyTestData(A.client);
    await assertOnlyTestData(B.client);
    const acc = await A.client.from('accounts').insert({ name: `TEST Bank ${run}`, type: 'current' }).select('id, name, type').single();
    if (acc.error) throw acc.error;
    bank = acc.data;
    const snap = await A.client.from('balance_snapshots').insert({ account_id: bank.id, date: yesterday, balance_pence: 200000 });
    if (snap.error) throw snap.error;
  });

  afterAll(async () => {
    if (!A) return;
    if (made.transactions.length) await A.client.from('transactions').delete().in('id', made.transactions); // IOUs go with them
    if (bank) await A.client.from('accounts').delete().eq('id', bank.id); // its balance goes with it
    for (const name of made.people) await A.client.from('people').delete().eq('name', name);
  });

  const save = async (tx, ious) => {
    const res = await A.client.rpc('add_purchase_with_ious', { tx: { account_id: bank.id, date: today, ...tx }, ious });
    if (!res.error) made.transactions.push(res.data);
    for (const i of ious) if (!made.people.includes(i.name)) made.people.push(i.name);
    return res;
  };
  const load = async () => {
    const [t, s, snaps] = await Promise.all([
      A.client.from('transactions').select('id, account_id, date, amount_pence, kind, status, raw_description').eq('account_id', bank.id),
      A.client.from('splits').select('id, transaction_id, person_id, amount_pence, settled_by_transaction_id'),
      A.client.from('balance_snapshots').select('account_id, date, balance_pence').eq('account_id', bank.id),
    ]);
    return { txs: t.data, splits: s.data, snaps: snaps.data };
  };

  it('A: £150 headphones, someone repays it all: purchase and £150 IOU saved, bank £1,850, £0 your spending', async () => {
    const dad = `TEST Dad ${run}`;
    const res = await save({ amount_pence: -15000, raw_description: `TEST Headphones ${run}` }, [{ name: dad, amount_pence: 15000 }]);
    expect(res.error).toBeNull();
    const { txs, splits, snaps } = await load();
    const buy = txs.find((t) => t.id === res.data);
    expect(buy).toMatchObject({ amount_pence: -15000, kind: 'spend', status: 'reviewed' });
    const mine = splits.filter((s) => s.transaction_id === buy.id);
    expect(mine.map((s) => s.amount_pence)).toEqual([15000]);
    expect(accountBalance(bank, snaps, txs, today).pence).toBe(185000);
    expect(summarise([buy], { [buy.id]: 15000 }).netSpent).toBe(0);
  });

  it('B: £100 paid, £60 owed by someone else: bank down £100, £40 your spending, one £60 IOU', async () => {
    const res = await save({ amount_pence: -10000, raw_description: `TEST Partial ${run}` }, [{ name: `TEST Friend ${run}`, amount_pence: 6000 }]);
    expect(res.error).toBeNull();
    const { txs, splits } = await load();
    const buy = txs.find((t) => t.id === res.data);
    const owed = splits.filter((s) => s.transaction_id === buy.id);
    expect(owed.map((s) => s.amount_pence)).toEqual([6000]);
    expect(summarise([buy], { [buy.id]: 6000 }).netSpent).toBe(4000);
  });

  it('C: invalid amounts are refused by the database too, and nothing is saved', async () => {
    const before = (await load()).txs.length;
    for (const [tx, ious] of [
      [{ amount_pence: -10000, raw_description: `TEST Bad1 ${run}` }, [{ name: 'X', amount_pence: 20000 }]], // owes more than paid
      [{ amount_pence: -10000, raw_description: `TEST Bad2 ${run}` }, [{ name: 'X', amount_pence: 0 }]], // owes nothing
      [{ amount_pence: 10000, raw_description: `TEST Bad3 ${run}` }, []], // money in isn't a purchase
    ]) {
      const res = await A.client.rpc('add_purchase_with_ious', { tx: { account_id: bank.id, date: today, ...tx }, ious });
      expect(res.error).not.toBeNull();
    }
    expect((await load()).txs.length).toBe(before);
  });

  it('D: if any IOU fails, nothing is saved: no purchase, no IOU, no new person', async () => {
    const before = await load();
    const ghost = `TEST Ghost ${run}`;
    const res = await A.client.rpc('add_purchase_with_ious', { tx: { account_id: bank.id, date: today, amount_pence: -5000, raw_description: `TEST Atomic ${run}` }, ious: [{ name: ghost, amount_pence: 1000 }, { name: 'TEST Other', amount_pence: 1000, due_date: 'not-a-date' }] });
    expect(res.error).not.toBeNull();
    const after = await load();
    expect(after.txs.length).toBe(before.txs.length);
    expect(after.splits.length).toBe(before.splits.length);
    const p = await A.client.from('people').select('id').eq('name', ghost);
    expect(p.data).toEqual([]);
  });

  it('E: after signing in again, everything is still there and still correct', async () => {
    const fresh = await signedIn('A');
    const { data } = await fresh.client.from('transactions').select('id, amount_pence').eq('account_id', bank.id);
    expect(data.map((t) => t.amount_pence).sort()).toEqual([-15000, -10000].sort());
  });

  it('Row Level Security: another user can’t see or change these purchases and IOUs', async () => {
    const seenT = await B.client.from('transactions').select('id').in('id', made.transactions);
    expect(seenT.data).toEqual([]);
    const seenS = await B.client.from('splits').select('id').in('transaction_id', made.transactions);
    expect(seenS.data).toEqual([]);
    const upd = await B.client.from('transactions').update({ amount_pence: -1 }).in('id', made.transactions).select('id');
    expect(upd.data).toEqual([]);
    const { data } = await A.client.from('transactions').select('amount_pence').in('id', made.transactions);
    expect(data.map((t) => t.amount_pence).sort()).toEqual([-15000, -10000].sort());
  });
});
