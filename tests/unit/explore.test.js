// Analytics must reconcile: every breakdown adds back up to the same totals the rest of the app shows, and the
// periods resolve to the right dates. All data here is made up.
import { describe, it, expect } from 'vitest';
import { summarise } from '../../src/lib/summary.js';
import { spendLines, total, fromPay, group, byDay, applyFilter, compare, frequency, flows, weekStart, isRecurring, NO_BUCKET_PAYBACK } from '../../src/lib/explore.js';
import { resolvePeriod, stepPeriod, previousPeriod, encodePeriod, decodePeriod } from '../../src/lib/period.js';

const t = (id, date, amount_pence, kind = 'spend', more = {}) => ({ id, date, amount_pence, kind, status: 'reviewed', bucket: 'Fun', category: 'Going out', raw_description: 'Test Shop', ...more });
const rows = [
  t('a', '2026-10-27', -4000),
  t('b', '2026-10-28', 1500, 'repayment'),
  t('c', '2026-10-29', -2500, 'spend', { bucket: 'Fuel', category: 'Fuel', raw_description: 'Esso' }),
  t('d', '2026-10-30', 800, 'refund'),
  t('e', '2026-11-02', -90000, 'spend', { from_savings: true, bucket: 'Essentials', category: 'Car', raw_description: 'Garage' }),
  t('f', '2026-11-03', -3000, 'spend', { raw_description: 'Pizza Place' }),
  t('g', '2026-11-04', -700, 'spend', { status: 'needs_review' }),
  t('h', '2026-11-05', -50000, 'transfer', { bucket: null, category: null }),
  t('i', '2026-11-06', -10000, 'invested', { bucket: null, category: null }),
  t('j', '2026-11-07', 1000, 'repayment'),
  t('k', '2026-11-08', 600, 'repayment', { bucket: null, category: null }),
  t('l', '2026-11-09', -450, 'spend', { bucket: 'Groceries', category: 'Snacks', raw_description: 'Spar' }),
  t('m', '2026-11-10', 200000, 'income', { bucket: null, category: null, raw_description: 'Employer Ltd' }),
];
const splits = { f: 1000 };
const settled = new Set(['j']);

describe('analytics reconcile with the rest of the app', () => {
  const s = summarise(rows, splits, settled);
  const lines = spendLines(rows, splits, settled);
  it('spending lines add up to the same totals as summarise', () => {
    expect(total(fromPay(lines))).toBe(s.netSpent);
    expect(total(lines)).toBe(s.totalSpent);
  });
  it('every breakdown adds back up to the total', () => {
    for (const key of ['bucket', 'category', 'merchant', 'date']) expect(group(lines, (l) => l[key]).reduce((a, g) => a + g.pence, 0)).toBe(total(lines));
    expect(byDay(lines, '2026-10-26', '2026-11-23').reduce((a, d) => a + d.pence, 0)).toBe(total(lines));
  });
  it('bucket totals from pay match summarise, and a payback with no bucket has its own row', () => {
    const buckets = group(fromPay(lines), (l) => l.bucket);
    for (const g of buckets) if (g.key !== NO_BUCKET_PAYBACK) expect(g.pence).toBe(s.byBucket[g.key]);
    expect(buckets.find((g) => g.key === NO_BUCKET_PAYBACK).pence).toBe(-600);
  });
  it('filters pick exactly the lines behind a number', () => {
    const fun = applyFilter(lines, { bucket: 'Fun' });
    expect(total(fun)).toBe(group(lines, (l) => l.bucket).find((g) => g.key === 'Fun').pence);
    expect(total(applyFilter(lines, { bucket: 'Fun', category: 'Going out' }))).toBe(total(fun));
    const ess = new Set(['Essentials', 'Fuel', 'Groceries']);
    expect(total(applyFilter(lines, { essential: true }, { essential: ess })) + total(applyFilter(lines, { essential: false }, { essential: ess }))).toBe(total(lines));
    expect(applyFilter(lines, { small: 1000 }).map((l) => l.id)).toEqual(['l']);
    expect(applyFilter(lines, { week: weekStart('2026-11-04') }).map((l) => l.id).sort()).toEqual(['e', 'f', 'k']); // Mon 2 to Sun 8 Nov; 9 Nov starts the next week;
  });
  it('recurring and one-off split the total between them', () => {
    const ctx = { bills: [{ name: 'Esso', match: 'esso', is_active: true }] };
    expect(isRecurring(lines.find((l) => l.id === 'c'), ctx)).toBe(true);
    expect(total(applyFilter(lines, { recurring: true }, ctx)) + total(applyFilter(lines, { recurring: false }, ctx))).toBe(total(lines));
  });
  it('comparing two periods: the rows explain the whole difference', () => {
    const a = lines.filter((l) => l.date < '2026-11-01');
    const b = lines.filter((l) => l.date >= '2026-11-01');
    const rowsBy = compare(a, b, (l) => l.category);
    expect(rowsBy.reduce((x, r) => x + r.diff, 0)).toBe(total(b) - total(a));
    expect(rowsBy[0].key).toBe('Car'); // the biggest change comes first
  });
  it('frequency and money flows', () => {
    const f = frequency(lines, '2026-10-26', '2026-11-23');
    expect([f.payments, f.spendDays, f.days]).toEqual([5, 5, 29]);
    const fl = flows(rows);
    expect([fl.income, fl.invested, fl.incomeBy[0].key]).toEqual([200000, 10000, 'employer']);
  });
});

describe('periods', () => {
  const info = { paydays: ['2026-08-25', '2026-09-24', '2026-10-26', '2026-11-24'], today: '2026-11-26', usualDay: 24, firstDate: '2026-08-01' };
  it('the current cycle and a chosen one', () => {
    expect(resolvePeriod({ kind: 'current' }, info)).toMatchObject({ from: '2026-11-24', current: true });
    expect(resolvePeriod({ kind: 'cycle', start: '2026-10-26' }, info)).toMatchObject({ from: '2026-10-26', to: '2026-11-23', current: false });
  });
  it('the last 3 finished cycles leave out the one you are in', () => {
    const p = resolvePeriod({ kind: 'last', n: 3 }, info);
    expect([p.from, p.to, p.cycles.length]).toEqual(['2026-08-25', '2026-11-23', 3]);
  });
  it('months and custom dates', () => {
    expect(resolvePeriod({ kind: 'month', ym: '2026-02' }, info)).toMatchObject({ from: '2026-02-01', to: '2026-02-28', days: 28 });
    expect(resolvePeriod({ kind: 'range', from: '2026-11-01', to: '2026-11-10' }, info)).toMatchObject({ days: 10 });
  });
  it('steps to the next and previous cycle or month', () => {
    const oct = resolvePeriod({ kind: 'cycle', start: '2026-10-26' }, info);
    expect(stepPeriod(oct, -1, info)).toEqual({ kind: 'cycle', start: '2026-09-24' });
    expect(stepPeriod(oct, 1, info)).toEqual({ kind: 'current' });
    expect(stepPeriod(resolvePeriod({ kind: 'current' }, info), 1, info)).toBe(null);
    expect(stepPeriod(resolvePeriod({ kind: 'month', ym: '2026-11' }, info), 1, info)).toBe(null);
    expect(previousPeriod(resolvePeriod({ kind: 'month', ym: '2026-03' }, info), info)).toMatchObject({ from: '2026-02-01' });
  });
  it('goes in the address and comes back the same, and old links still work', () => {
    for (const sel of [{ kind: 'current' }, { kind: 'cycle', start: '2026-10-26' }, { kind: 'last', n: 6 }, { kind: 'month', ym: '2026-11' }, { kind: 'range', from: '2026-11-01', to: '2026-11-10' }]) expect(decodePeriod(encodePeriod(sel))).toEqual(sel);
    expect(decodePeriod('2026-10-26')).toEqual({ kind: 'cycle', start: '2026-10-26' });
    expect(decodePeriod('nonsense')).toEqual({ kind: 'current' });
  });
});
