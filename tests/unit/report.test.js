// The end-of-cycle report: its figures reconcile with the rest of the app, every sentence comes from the data,
// suggestions are measurable, and a late import is spotted. Made-up data.
import { describe, it, expect } from 'vitest';
import { summarise } from '../../src/lib/summary.js';
import { buildReport, suggestBudgets, needsRefresh, fingerprint, measure } from '../../src/lib/report.js';
import { spendLines, total, merchantResolver } from '../../src/lib/explore.js';

let n = 0;
const t = (date, pence, kind = 'spend', more = {}) => ({ id: `r${n++}`, date, amount_pence: pence, kind, status: 'reviewed', bucket: 'Fun', category: 'Eating out', raw_description: 'Cafe', ...more });
const prevTxs = [
  t('2026-09-25', 300000, 'income', { bucket: null, category: null, raw_description: 'Employer' }),
  t('2026-09-26', -4000), t('2026-10-01', -3000), t('2026-10-05', -2000, 'spend', { bucket: 'Groceries', category: 'Food shop', raw_description: 'Tesco' }),
  t('2026-10-10', -50000, 'invested', { bucket: null, category: null }),
];
const txs = [
  t('2026-10-26', 300000, 'income', { bucket: null, category: null, raw_description: 'Employer' }),
  ...Array.from({ length: 10 }, (_, i) => t(`2026-10-${String(27 + (i % 4)).padStart(2, '0')}`, -900, 'spend', { category: 'Snacks', raw_description: 'Spar' })),
  t('2026-10-28', -6000), t('2026-11-02', -5000), t('2026-11-08', -12000, 'spend', { raw_description: 'Concert' }),
  t('2026-11-03', -4500, 'spend', { bucket: 'Groceries', category: 'Food shop', raw_description: 'Tesco' }),
  t('2026-11-04', -100000, 'invested', { bucket: null, category: null }),
  t('2026-11-05', -20000, 'saved', { bucket: null, category: null, accountType: 'current' }),
];
const cycle = { start: '2026-10-26', end: '2026-11-23', name: 'November', totalDays: 29 };
const eff = { Fun: { budget: 15000, carried: 0, total: 15000 }, Groceries: { budget: 10000, carried: 0, total: 10000 } };
const report = buildReport({
  cycle, txs, prev: { txs: prevTxs, name: 'October' }, usual: [spendLines(prevTxs)], eff, fctx: { essential: new Set(['Groceries']) },
  previousImprovements: [{ text: 'Keep Eating out under £100', metric: { type: 'category', key: 'Eating out', target: 10000 } }],
});

describe('end-of-cycle report', () => {
  const s = summarise(txs);
  it('the summary matches the rest of the app and adds up', () => {
    expect(report.summary).toMatchObject({ income: 300000, spent: s.totalSpent, saved: 20000, invested: 100000 });
    expect(report.summary.net).toBe(300000 - s.totalSpent - 120000);
    expect(report.summary.savingsRate).toBe(40);
    expect(report.summary.prev).toMatchObject({ name: 'October', spent: 9000, savingsRate: 17 });
  });
  it('the breakdowns add back up to the total', () => {
    expect(report.spending.buckets.reduce((a, b) => a + b.pence, 0)).toBe(report.summary.spent);
    for (const b of report.spending.buckets) expect(b.cats.reduce((a, c) => a + c.pence, 0)).toBe(b.pence);
    expect(report.spending.essential.yes + report.spending.essential.no).toBe(report.summary.spent);
    expect(report.spending.payments).toBe(14);
  });
  it('budget performance: over and under, unused money, the day the budget ran out, and why', () => {
    expect(report.budget.over).toEqual(['Fun']);
    expect(report.budget.under).toEqual(['Groceries']);
    expect(report.budget.unused).toBe(5500);
    expect(report.budget.crossedOn).toBe('2026-11-08');
    expect(report.budget.reasons.Fun[0]).toMatch(/^Eating out: £230 in 3 payments \(the October cycle: £70\)/);
  });
  it('habits: small payments and changes from last cycle, split into how many and how big', () => {
    expect(report.habits.small).toMatchObject({ count: 10, pence: 9000 });
    const eat = report.habits.changes.find((c) => c.key === 'Eating out');
    expect(eat).toMatchObject({ a: 7000, b: 23000, countA: 2, countB: 3 });
    expect(eat.freq + eat.size).toBe(eat.diff);
  });
  it('every sentence is built from the figures, and suggestions can be measured', () => {
    const text = Object.values(report.narrative).flat().map((x) => (typeof x === 'string' ? x : x.text)).join(' ');
    expect(text).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(report.narrative.better[0]) // £230 eating out + £90 snacks = £320 against £150
      .toMatch(/^Fun went £170 over its £150 budget; the biggest part was Eating out \(£230, 3 payments\)/);
    expect(report.narrative.wentWell.some((x) => /40% of your income/.test(x))).toBe(true);
    for (const sg of report.narrative.suggestions) expect(sg.metric.target).toBeGreaterThan(0);
    expect(report.narrative.suggestions.map((x) => x.id)).toContain('small');
  });
  it('checks last cycle’s chosen improvements against this cycle', () => {
    expect(report.improvementsReview[0]).toMatchObject({ actual: 23000, met: false, actualText: '£230' });
    expect(measure({ type: 'small', limit: 1000, target: 5 }, spendLines(txs))).toBe(10);
  });
  it('spots a late import, so the saved report can be refreshed', () => {
    const fp = fingerprint(txs);
    expect(needsRefresh(fp, txs)).toBe(false);
    expect(needsRefresh(fp, [...txs, t('2026-11-20', -1500)])).toBe(true);
  });
  it('with no earlier cycle it makes no comparisons', () => {
    const alone = buildReport({ cycle, txs, eff });
    expect(alone.summary.prev).toBe(null);
    expect([...alone.narrative.wentWell, ...alone.narrative.better].join(' ')).not.toMatch(/cycle \(£/);
    expect(alone.habits.changes).toEqual([]);
  });
  it('total spending in the report is the same as the explorer’s lines', () => {
    expect(total(spendLines(txs))).toBe(report.summary.spent);
  });
});

describe('budget suggestions', () => {
  it('only where the last cycles clearly say so', () => {
    const out = suggestBudgets({ Fun: 14000, Groceries: 9000, Life: 7500 }, [{ Fun: 30000, Groceries: 8000, Life: 2000 }, { Fun: 25000, Groceries: 9500, Life: 3000 }, { Fun: 12000, Groceries: 8500, Life: 1000 }]);
    expect(out.map((x) => [x.bucket, x.to])).toEqual([['Fun', 22500], ['Life', 3000]]);
  });
});

describe('most expensive days', () => {
  it('name a day by its biggest payment: the shop for a bank line, your description for a typed one', () => {
    const rows = [
      { id: 'x1', date: '2026-11-03', amount_pence: -4000, kind: 'spend', status: 'reviewed', bucket: 'Fun', category: 'Gifts', raw_description: 'Gift for newborn', source: 'csv', archived: false },
      { id: 'x2', date: '2026-11-04', amount_pence: -3000, kind: 'spend', status: 'reviewed', bucket: 'Fun', category: 'Eating out', raw_description: 'MCDONALDS 123', source: 'import:revolut' },
    ];
    const r = buildReport({ cycle, txs: rows, eff, merchants: merchantResolver(rows) });
    expect(r.habits.topDays.map((d) => d.top)).toEqual(['Gift for newborn', 'Mcdonalds 123']);
  });
});
