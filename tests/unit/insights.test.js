// Insights must be true to the data: each one's number is exactly what its "see the payments" link adds up to,
// the frequency/size split adds up to the change, and nothing appears without the data to back it. Made-up data.
import { describe, it, expect } from 'vitest';
import { spendLines, total, applyFilter } from '../../src/lib/explore.js';
import { buildInsights, decompose } from '../../src/lib/insights.js';
import { addDays } from '../../src/lib/dates.js';

let n = 0;
const t = (date, pounds, category, bucket, raw_description, more = {}) => ({ id: `t${n++}`, date, amount_pence: -Math.round(pounds * 100), kind: 'spend', status: 'reviewed', category, bucket, raw_description, ...more });
// A 28-day period starting on a Monday, with `snacks` small buys, a gym bill and a usual Tesco shop.
function period(start, snacks, extra = []) {
  const rows = [t(addDays(start, 1), 30, 'Gym', 'Essentials', 'Gym Group'), t(addDays(start, 3), 20, 'Groceries', 'Groceries', 'Tesco'), t(addDays(start, 10), 20, 'Groceries', 'Groceries', 'Tesco'),
    t(addDays(start, 2), 40, 'Going out', 'Fun', 'Pub')];
  for (let i = 0; i < snacks; i++) rows.push(t(addDays(start, (i * 2) % 26), 3, 'Snacks', 'Fun', 'Spar'));
  return [...rows, ...extra];
}
const starts = ['2026-07-27', '2026-08-24', '2026-09-21', '2026-10-19']; // Mondays, 28 days apart (oldest first)
const b3 = period(starts[0], 4); const b2 = period(starts[1], 6); const b1 = period(starts[2], 8);
const nowRows = period(starts[3], 14, [
  t('2026-10-24', 60, 'Going out', 'Fun', 'Club'), t('2026-10-25', 55, 'Going out', 'Fun', 'Club'), // a big weekend
  t('2026-10-31', 70, 'Going out', 'Fun', 'Club'), t('2026-11-01', 45, 'Going out', 'Fun', 'Club'),
  t('2026-11-03', 80, 'Groceries', 'Groceries', 'Tesco'), // 4× the usual Tesco shop
  t('2026-11-07', 400, 'Car', 'Essentials', 'Corner Garage'), // a one-off, on a Saturday
]);
const L = (rows) => spendLines(rows);
const lines = L(nowRows);
const fctx = { bills: [{ name: 'Gym', match: 'gym group', is_active: true }], recurringKeys: new Set(), essential: new Set(['Essentials', 'Groceries']) };
const input = {
  lines, from: starts[3], to: addDays(starts[3], 27), days: 28, periodName: 'this cycle', fctx,
  base: [{ lines: L(b1), days: 28, label: 'Sep' }, { lines: L(b2), days: 28, label: 'Aug' }, { lines: L(b3), days: 28, label: 'Jul' }],
  history: L([...b3, ...b2, ...b1]),
  budgets: [{ label: 'Nov', budget: { Fun: 10000 }, actual: { Fun: 40000 } }, { label: 'Oct', budget: { Fun: 10000 }, actual: { Fun: 12000 } }, { label: 'Sep', budget: { Fun: 10000 }, actual: { Fun: 9000 } }],
};
const out = buildInsights(input);
const ids = out.map((i) => i.id);

describe('insights', () => {
  it('finds the behaviour in the data', () => {
    for (const id of ['small', 'rising-Snacks', 'weekends', 'often-spar', 'one-offs', 'recurring', 'budget-Fun', 'opportunity']) expect(ids).toContain(id);
    expect(ids.some((id) => id.startsWith('unusual-'))).toBe(true);
    expect(out.find((i) => i.id === 'small').body).toMatch(/14 small|Snacks \(14\)/);
  });
  it('every number is exactly what its linked payments add up to', () => {
    for (const i of out) {
      expect(i.pence).toBe(total(applyFilter(lines, i.filter, fctx)));
      expect(`${i.title} ${i.body} ${i.how}`).not.toMatch(/NaN|undefined|Infinity|\[object/);
      expect(i.how.length).toBeGreaterThan(20);
    }
  });
  it('a rising habit explains how many payments and the trend', () => {
    const r = out.find((i) => i.id === 'rising-Snacks');
    expect(r.body).toContain('£18 → £24 → £42'); // £3 snacks: 6, 8, then 14 of them
    expect(r.body).toMatch(/more payments/);
  });
  it('the unusual Tesco shop is compared with your usual there', () => {
    expect(out.find((i) => i.id.startsWith('unusual-') && /Tesco/.test(i.title)).body).toMatch(/4\.0× your usual £20\.00/);
  });
  it('splits a change into more payments and bigger payments, exactly', () => {
    const d = decompose(applyFilter(lines, { category: 'Snacks' }), input.base.map((b) => ({ lines: applyFilter(b.lines, { category: 'Snacks' }), scale: 1 })));
    expect(d.freq + d.size).toBe(d.t1 - d.t0);
    expect([d.n1, d.n0]).toEqual([14, 6]);
  });
  it('says nothing without data, and nothing comparative without earlier periods', () => {
    expect(buildInsights({ ...input, lines: [] })).toEqual([]);
    const alone = buildInsights({ ...input, base: [], budgets: [] }).map((i) => i.id);
    for (const id of ['convenience', 'opportunity', 'one-offs', 'rising-Snacks', 'budget-Fun']) expect(alone).not.toContain(id);
  });
});

describe('insights stay fair', () => {
  it('a category that was £0 before is not called a rising habit', () => {
    const fuelNow = L(period(starts[3], 0, [t('2026-10-20', 60, 'Fuel', 'Fuel', 'Fuel'), t('2026-10-27', 60, 'Fuel', 'Fuel', 'Fuel')]));
    const fuelB1 = L(period(starts[2], 0, [t('2026-09-22', 30, 'Fuel', 'Fuel', 'Fuel')]));
    const res = buildInsights({ ...input, lines: fuelNow, base: [{ lines: fuelB1, days: 28, label: 'Sep' }, { lines: L(b2), days: 28, label: 'Aug' }, { lines: L(b3), days: 28, label: 'Jul' }] });
    expect(res.map((i) => i.id)).not.toContain('rising-Fuel');
  });
  it('a normal-sized payment at a new shop is not unusual', () => {
    const hist = L([...b3, ...b2, t('2026-09-01', 55, 'Fuel', 'Fuel', 'Esso'), t('2026-09-10', 50, 'Fuel', 'Fuel', 'Esso'), t('2026-09-20', 60, 'Fuel', 'Fuel', 'Shell')]);
    const res = buildInsights({ ...input, lines: L([...period(starts[3], 2), t('2026-10-22', 58, 'Fuel', 'Fuel', 'Fuel')]), history: hist });
    expect(res.some((i) => i.id.startsWith('unusual-') && /Fuel/.test(i.title))).toBe(false);
  });
});
