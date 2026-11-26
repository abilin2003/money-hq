// Planning maths: budget overview, plan lines matched to the bank, goal progress and wealth. Made-up data.
import { describe, it, expect } from 'vitest';
import { budgetOverview, matchPlanLines, goalProgress, wealthSeries, investmentReturn, alignToCycle } from '../../src/lib/planning.js';

describe('budget overview', () => {
  const eff = { Fun: { budget: 10000, carried: 2000, total: 12000 }, Groceries: { budget: 20000, carried: 0, total: 20000 }, Life: { budget: 5000, carried: 0, total: 5000 } };
  const rows = budgetOverview({ eff, spent: { Fun: 9000, Groceries: 5000, Life: 6000 }, prevBudgets: { Fun: 15000, Groceries: 20000 }, cycle: { dayNumber: 10, totalDays: 30 } });
  const fun = rows.find((r) => r.bucket === 'Fun');
  it('allocated, rollover, actual, remaining, pace and projection', () => {
    expect(fun).toMatchObject({ allocated: 10000, carried: 2000, total: 12000, actual: 9000, remaining: 3000, expected: 4000, projected: 27000 });
  });
  it('no projection or pace warning before there are 4 days to go on', () => {
    const early = budgetOverview({ eff, spent: { Fun: 9000, Groceries: 5000, Life: 1000 }, cycle: { dayNumber: 2, totalDays: 30 } });
    expect(early.map((r) => r.projected)).toEqual([null, null, null]);
    expect(early.find((r) => r.bucket === 'Fun').warnings).toEqual([]);
  });
  it('a cut budget is labelled as deliberate, and warned about only on pace', () => {
    expect(fun.reduced).toEqual({ from: 15000, to: 10000 });
    expect(fun.warnings.map((w) => w.level)).toEqual(['pace']);
    expect(rows.find((r) => r.bucket === 'Groceries')).toMatchObject({ reduced: null, warnings: [] });
    expect(rows.find((r) => r.bucket === 'Life').warnings[0].level).toBe('over');
  });
});

describe('payday plan lines', () => {
  const cycle = { start: '2026-11-24', end: '2026-12-17' };
  const txs = [
    { id: 'a', date: '2026-11-24', amount_pence: -50000, kind: 'invested', status: 'reviewed', raw_description: 'Trading 212' },
    { id: 'b', date: '2026-11-24', amount_pence: -15000, kind: 'transfer', status: 'reviewed', raw_description: 'Capital One' },
    { id: 'c', date: '2026-11-25', amount_pence: -15000, kind: 'transfer', status: 'reviewed', raw_description: 'To Monzo' },
  ];
  const items = [
    { name: 'S&S ISA', kind: 'invested', amount_pence: 50000 },
    { name: 'Monzo pot', kind: 'saved', amount_pence: 15000 },
    { name: 'Capital One', kind: 'transfer', amount_pence: 15000, verified: '2026-11-26' },
    { name: 'Holiday', kind: 'saved', amount_pence: 9900 },
    { name: 'Buffer', kind: 'kept', amount_pence: 2500 },
  ];
  const out = matchPlanLines(items, txs, cycle, '2026-11-26');
  it('matches each line to one bank payment, by name first, and keeps planned / completed / verified apart', () => {
    expect(out.map((x) => [x.state, x.tx?.id ?? null])).toEqual([['completed', 'a'], ['completed', 'c'], ['verified', 'b'], ['planned', null], ['stays', null]]);
  });
});

describe('goals', () => {
  it('percentage, per payday, expected date and status', () => {
    const g = goalProgress({ target: 100000, saved: 40000, date: '2027-11-30', monthly: 10000, today: '2026-11-27' });
    expect(g).toMatchObject({ pct: 40, left: 60000, perPayday: 5000, expected: '2027-05-27', status: 'on track' });
  });
  it('uses your recent pace when no monthly amount is planned, and says so', () => {
    const g = goalProgress({ target: 100000, saved: 40000, history: [{ date: '2026-08-27', pence: 10000 }, { date: '2026-11-27', pence: 40000 }], today: '2026-11-27' });
    expect(g.rateSource).toBe('recent pace');
    expect(g.pace).toBeGreaterThan(9000);
    expect(goalProgress({ target: 100000, saved: 40000, today: '2026-11-27' }).status).toBe('needs a plan');
  });
});

describe('wealth', () => {
  const accounts = [{ id: 'cur', type: 'current' }, { id: 'isa', type: 'isa' }, { id: 'cc', type: 'credit_card' }, { id: 'pen', type: 'pension' }];
  const snaps = [
    { account_id: 'cur', date: '2026-09-01', balance_pence: 100000 }, { account_id: 'isa', date: '2026-09-01', balance_pence: 500000 }, { account_id: 'cc', date: '2026-09-01', balance_pence: 20000 },
    { account_id: 'isa', date: '2026-11-01', balance_pence: 620000 }, { account_id: 'pen', date: '2026-11-01', balance_pence: 300000 },
  ];
  it('carries balances forward and splits assets from liabilities without double counting', () => {
    const s = wealthSeries(accounts, snaps);
    expect(s[0]).toMatchObject({ total: 580000, cash: 100000, investments: 500000, debt: -20000, assets: 600000, liabilities: 20000 });
    expect(s[1]).toMatchObject({ total: 1000000, investments: 620000, pension: 300000 });
    expect(s[1].assets - s[1].liabilities).toBe(s[1].total);
  });
  it('investment gains are value now minus value then minus money put in since', () => {
    const txs = [{ date: '2026-09-10', amount_pence: -100000, kind: 'invested', status: 'reviewed' }, { date: '2026-10-10', amount_pence: 20000, kind: 'invested', status: 'reviewed' }, { date: '2026-08-10', amount_pence: -50000, kind: 'invested', status: 'reviewed' }];
    expect(investmentReturn(accounts, snaps, txs)).toMatchObject({ known: true, start: 500000, now: 620000, contributed: 80000, gain: 40000, contributedAll: 130000 });
  });
});

describe('last cycle lined up with this one', () => {
  it('compares the same share of the way through cycles of different lengths, ending on the same total', () => {
    const prev = Array.from({ length: 32 }, (_, i) => (i + 1) * 100); // £1 a day for 32 days
    const a = alignToCycle(prev, 29);
    expect(a).toHaveLength(29);
    expect(a[28]).toBe(3200); // payday to payday: the whole of last cycle
    expect(a[13]).toBe(prev[Math.round((14 * 32) / 29) - 1]); // day 14 of 29 ~ day 15 of 32
    expect(alignToCycle(prev.slice(0, 10), 20)[0]).toBe(100); // never before last cycle's first day
    expect(alignToCycle([], 20)).toEqual([]);
  });
});
