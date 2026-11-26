// Every page counts a transaction the same way. Overview, Trends and History all add up with summarise(), and
// the daily chart must agree with it to the penny. All data here is made up.
import { describe, it, expect } from 'vitest';
import { summarise } from '../../src/lib/summary.js';
import { dailySpend, cumulative, perCycle, projectGoal } from '../../src/lib/analytics.js';
import { periods } from '../../src/views/history.js';
import { cycleFor } from '../../src/lib/cycles.js';
import { classify, prepareRules } from '../../src/lib/import/classify.js';

const t = (id, date, amount_pence, kind = 'spend', more = {}) => ({ id, date, amount_pence, kind, status: 'reviewed', bucket: 'Fun', category: 'Going out', raw_description: 'Test', ...more });
const paydays = ['2026-09-24', '2026-10-26', '2026-11-24'];
const cycle = cycleFor('2026-11-01', paydays);
const rows = [
  t('a', '2026-10-27', -4000),
  t('b', '2026-10-28', 1500, 'repayment'),
  t('c', '2026-10-29', -2500, 'spend', { bucket: 'Fuel', category: 'Fuel' }),
  t('d', '2026-10-30', 800, 'refund'),
  t('e', '2026-11-02', -90000, 'spend', { from_savings: true }),
  t('f', '2026-11-03', -3000, 'spend', { id: 'f' }),
  t('g', '2026-11-04', -700, 'spend', { status: 'needs_review' }),
  t('h', '2026-11-05', -50000, 'transfer', { bucket: null, category: null }),
  t('i', '2026-11-06', -10000, 'invested', { bucket: null, category: null }),
  t('j', '2026-11-07', 1000, 'repayment', { id: 'j' }),
];
const splits = { f: 1000 }; // a friend owes £10 of payment f
const settled = new Set(['j']); // and paid it back with j

describe('one set of rules everywhere', () => {
  const s = summarise(rows, splits, settled);
  it('the daily chart adds up to exactly the spending total', () => {
    const days = dailySpend(rows, cycle, splits, settled);
    expect(cumulative(days, days.length).pop()).toBe(s.netSpent);
  });
  it('the budgeted-bucket chart adds up to those buckets in the bucket table', () => {
    const fun = dailySpend(rows, cycle, splits, settled, new Set(['Fun']));
    expect(cumulative(fun, fun.length).pop()).toBe(s.byBucket.Fun);
  });
  it('History and Trends give the same cycle total as the Overview', () => {
    const hist = periods(rows, 'cycle', { paydays }, '2026-11-30', paydays).find((p) => p.key === cycle.start);
    const trend = perCycle(rows, [cycle], splits, settled)[0].s;
    expect(summarise(hist.txs, splits, settled).netSpent).toBe(s.netSpent);
    expect(trend.netSpent).toBe(s.netSpent);
  });
  it('the sums are what you would work out by hand', () => {
    // 40 + 25 + 20 (30 minus the friend's 10) − 15 paid back − 8 refund = 62; the £900 from savings, the transfer,
    // the investment, the undecided line and the IOU-cleared payback are all left out.
    expect([s.netSpent, s.fromSavings, s.invested, s.waiting]).toEqual([6200, 90000, 10000, 1]);
  });
});

describe('credit card repayments are transfers when imported', () => {
  const rules = prepareRules([]);
  it.each(['CAPITAL ONE', 'Credit card payment', 'Card repayment'])('"%s" out of Ulster is a transfer', (raw_description) => {
    expect(classify({ raw_description, amount_pence: -42400, account: 'Ulster Bank', date: '2026-11-24' }, rules)).toMatchObject({ kind: 'transfer', status: 'reviewed' });
  });
  it('a line merely mentioning a card is not mistaken for a repayment', () => {
    expect(classify({ raw_description: 'Fuel - not on credit card', amount_pence: -1733, account: 'Revolut', date: '2026-11-03' }, rules).kind).not.toBe('transfer');
  });
});

describe('whole pence', () => {
  it('goal projections with growth stay in whole pence every month', () => {
    expect(projectGoal({ target: 1000000, saved: 0, monthly: 20000, growthPct: 7 }, '2026-11-25').series.every(Number.isInteger)).toBe(true);
  });
});
