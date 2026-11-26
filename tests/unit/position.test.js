// Planned vs actual vs verified money. All data here is made up.
import { describe, it, expect } from 'vitest';
import { balanceNow, cashPosition, cardOwed, fundStatus } from '../../src/lib/position.js';
import { planTotals } from '../../src/lib/budget.js';
import { summarise } from '../../src/lib/summary.js';
import { detectPaydays } from '../../src/lib/cycles.js';

const cur = { id: 'u', name: 'Ulster Bank', type: 'current', is_active: true };
const rev = { id: 'r', name: 'Revolut', type: 'current', is_active: true };
const card = { id: 'c', name: 'Capital One', type: 'credit_card', institution: 'Capital One', is_active: true };
const tx = (account_id, date, amount_pence, kind = 'spend', raw_description = 'Test', more = {}) => ({ account_id, date, amount_pence, kind, raw_description, status: 'reviewed', ...more });

describe('balances: verified vs estimated vs unknown', () => {
  it('no balance typed in means unknown, never a guess', () => {
    expect(balanceNow(cur, [], [], '2026-11-26')).toMatchObject({ status: 'unknown', pence: null });
  });
  it('a recent balance with nothing after it is verified', () => {
    expect(balanceNow(cur, [{ account_id: 'u', date: '2026-11-25', balance_pence: 50000 }], [], '2026-11-26')).toMatchObject({ status: 'verified', pence: 50000 });
  });
  it('later transactions move it on, and it becomes an estimate', () => {
    const b = balanceNow(cur, [{ account_id: 'u', date: '2026-11-20', balance_pence: 50000 }], [tx('u', '2026-11-21', -1500), tx('r', '2026-11-21', -999)], '2026-11-26');
    expect(b).toMatchObject({ status: 'estimated', pence: 48500, since: 1, verifiedPence: 50000, verifiedDate: '2026-11-20' });
  });
});

describe('cash you can verify vs budget left', () => {
  it('stays unknown until every spending account has a balance, and says which are missing', () => {
    const p = cashPosition({ accounts: [cur, rev, card], snapshots: [{ account_id: 'u', date: '2026-11-25', balance_pence: 50000 }], txs: [], today: '2026-11-26', billsDue: 2000, reserve: 0 });
    expect(p.status).toBe('unknown');
    expect(p.missing).toEqual(['Revolut']);
    expect(p.available).toBeNull();
  });
  it('with balances: cash in current accounts, minus bills still due and the reserve', () => {
    const snaps = [{ account_id: 'u', date: '2026-11-25', balance_pence: 50000 }, { account_id: 'r', date: '2026-11-25', balance_pence: 30000 }];
    const p = cashPosition({ accounts: [cur, rev, card], snapshots: snaps, txs: [], today: '2026-11-26', billsDue: 2000, reserve: 1000 });
    expect([p.status, p.total, p.available]).toEqual(['verified', 80000, 77000]);
  });
});

describe('credit card: spending once, repayment owed later (no double counting)', () => {
  const lines = [
    tx('c', '2026-10-20', -4000, 'spend', 'Fuel'),
    tx('u', '2026-10-26', -4000, 'transfer', 'CAPITAL ONE PAYMENT'),
    tx('c', '2026-10-30', -3375, 'spend', 'Fuel'),
    tx('c', '2026-11-06', -5861, 'spend', 'Fuel'),
  ];
  it('fuel on the card counts as spending when bought; the repayment is a transfer, not spending again', () => {
    const s = summarise(lines.map((t) => ({ ...t, bucket: t.kind === 'spend' ? 'Fuel' : null })));
    expect(s.spent).toBe(4000 + 3375 + 5861);
  });
  it('what you owe on the card = purchases since the last repayment (an estimate until you type the balance)', () => {
    expect(cardOwed(card, [], lines, '2026-11-26')).toMatchObject({ status: 'estimated', pence: 3375 + 5861, since: '2026-10-26' });
  });
  it('with a typed-in card balance, later purchases add and later repayments take off', () => {
    const o = cardOwed(card, [{ account_id: 'c', date: '2026-11-01', balance_pence: 3375 }], [...lines, tx('u', '2026-11-10', -2000, 'transfer', 'Capital One')], '2026-11-26');
    expect(o).toMatchObject({ status: 'estimated', pence: 3375 + 5861 - 2000 });
  });
});

describe('sinking funds: planned, expected and verified kept apart', () => {
  const plans = { '2026-10-26': { items: [{ name: 'Emergency fund', kind: 'saved', amount_pence: 5000 }] }, '2026-11-24': { items: [{ name: 'Emergency fund', kind: 'saved', amount_pence: 10000 }, { name: 'Bulgaria holiday spending', kind: 'saved', amount_pence: 18000 }] } };
  it('never typed in: not verified, and the expected figure is planned money only', () => {
    expect(fundStatus({ name: 'Emergency fund', balance_pence: 0, balance_date: null }, plans, '2026-11-26')).toMatchObject({ status: 'not verified', verified: null, planned: 15000, plannedThisPayday: 10000, expected: 15000 });
  });
  it('verified balance plus what was planned after that date', () => {
    expect(fundStatus({ name: 'Emergency fund', balance_pence: 20000, balance_date: '2026-11-01' }, plans, '2026-11-26')).toMatchObject({ status: 'verified', planned: 10000, expected: 30000 });
  });
  it('matches plan lines to funds by name, loosely ("Bulgaria holiday spending" goes to "Bulgaria holiday")', () => {
    expect(fundStatus({ name: 'Bulgaria holiday', balance_pence: 0, balance_date: null }, plans, '2026-11-26').plannedThisPayday).toBe(18000);
  });
});

describe('payday plan: over-assigned money is explained, not hidden', () => {
  it('without a source, more assigned than pay shows as over-assigned', () => {
    expect(planTotals(200000, [{ amount_pence: 150724 }], { Fun: 50000 }).unassigned).toBe(-724);
  });
  it('recording where the extra came from (e.g. money already in Ulster) reconciles it to £0', () => {
    const t = planTotals(200000, [{ amount_pence: 150724 }], { Fun: 50000 }, [{ name: 'Existing Ulster balance', amount_pence: 724 }]);
    expect([t.available, t.extra, t.unassigned]).toEqual([200724, 724, 0]);
  });
});

describe('pay cycles before the first payday you entered use your real salary dates', () => {
  const salary = (date, p = 200000) => ({ date, amount_pence: p, kind: 'income', status: 'reviewed' });
  it('adds salary dates from before the first entered payday, ignoring small income and near-duplicates', () => {
    const txs = [salary('2025-12-24'), salary('2026-01-23'), salary('2026-02-23'), { ...salary('2026-01-10', 9900) }];
    expect(detectPaydays(txs, ['2026-02-23', '2026-03-25'])).toEqual(['2025-12-24', '2026-01-23', '2026-02-23', '2026-03-25']);
  });
});
