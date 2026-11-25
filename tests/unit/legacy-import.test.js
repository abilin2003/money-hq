// Moving data from the previous app. All data here is made up.
import { describe, it, expect } from 'vitest';
import { convertTransactions, planCategories, convertHistory, convertCycles, convertSettings, newKind, totals, accountFor } from '../../src/lib/legacy-import.js';
import { addFingerprints } from '../../src/lib/fingerprint.js';

const tx = (id, more) => ({ id, date: '2026-11-02', desc: 'Test Shop', amount: 10, direction: 'out', kind: 'spending', category: 'Fun', account: 'Revolut', source: 'csv', detail: 'Snacks', note: null, ...more });

describe('kinds', () => {
  it.each([
    [{ kind: 'spending', direction: 'out' }, 'spend', 'reviewed'],
    [{ kind: 'income', direction: 'in' }, 'income', 'reviewed'],
    [{ kind: 'payback', direction: 'in' }, 'repayment', 'reviewed'], // friends paying back is never income
    [{ kind: 'internal', direction: 'out' }, 'transfer', 'reviewed'],
    [{ kind: 'invested', direction: 'out' }, 'invested', 'reviewed'],
    [{ kind: 'fund', direction: 'in' }, 'saved', 'reviewed'],
    [{ kind: 'unsure', direction: 'out' }, 'spend', 'needs_review'], // undecided lines go to the review inbox
  ])('%o -> %s', (t, kind, status) => expect(newKind(t)).toEqual({ kind, status }));
});

describe('transactions', () => {
  const list = [
    tx('1', { amount: 21.5 }),
    tx('2', { amount: 100.01, direction: 'in', kind: 'income', category: '', detail: 'Salary', account: 'Ulster Bank' }),
    tx('3', { amount: 58.61, category: 'Essentials', detail: 'Fuel', account: 'Credit Card' }),
    tx('4', { amount: 5, category: 'Life Fund', detail: 'Snacks' }),
    tx('5', { amount: 3, kind: 'internal', category: 'Own transfers', detail: '' }),
  ];
  const cats = planCategories(list);
  const rows = convertTransactions(list, { archived: false, nameFor: cats.nameFor });

  it('stores signed whole pence: money out is negative', () => {
    expect(rows.map((r) => r.amount_pence)).toEqual([-2150, 10001, -5861, -500, -300]);
  });
  it('maps old account names to the new accounts', () => {
    expect(rows.map((r) => r.account)).toEqual(['Revolut', 'Ulster Bank', 'Capital One', 'Revolut', 'Revolut']);
    expect(accountFor('Nowhere')).toBeNull();
  });
  it('fuel moves to its own bucket; a category used in two buckets is split so nothing changes bucket silently', () => {
    expect(rows.map((r) => r.category)).toEqual(['Snacks', null, 'Fuel', 'Snacks (Life Fund)', null]);
    expect(cats.categories.get('Fuel')).toBe('Fuel');
    expect(cats.categories.get('Snacks')).toBe('Fun');
    expect(cats.categories.get('Snacks (Life Fund)')).toBe('Life Fund');
  });
  it('keeps the original record, so nothing is lost', () => {
    expect(rows[2].legacy).toEqual({ id: '3', kind: 'spending', direction: 'out', bucket: 'Essentials', detail: 'Fuel', account: 'Credit Card' });
  });
  it('refuses an unreadable amount instead of guessing', () => {
    expect(() => convertTransactions([tx('x', { amount: 'abc' })], { archived: false, nameFor: () => null })).toThrow(/unreadable/);
  });
  it('totals match the rows exactly', () => {
    const t = totals(rows);
    expect(t['live | Revolut | spend']).toEqual({ count: 2, pence: -2650 });
    expect(t['live | Revolut | transfer']).toEqual({ count: 1, pence: -300 });
  });
});

describe('fingerprints', () => {
  const row = { account: 'Revolut', date: '2026-11-02', amount_pence: -350, raw_description: 'COSTA  Coffee #12' };
  it('the same row twice in one file gets a counter, so genuine duplicates both survive', () => {
    const [a, b] = addFingerprints([row, row]);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
  it('the same file imported twice gives the same fingerprints', () => {
    expect(addFingerprints([row])[0].fingerprint).toBe(addFingerprints([{ ...row, raw_description: 'costa coffee 12' }])[0].fingerprint);
  });
});

describe('history, cycles and settings', () => {
  it('names old cycles from their dates and keeps the old label', () => {
    const [h] = convertHistory([{ label: 'November 2026 (26 Oct to 24 Nov)', start: '2026-09-24', end: '2026-10-25', spent: { Fun: 321.17, Essentials: 208.34 }, spentTotal: 529.51, invested: 1190, saved: 0, plannedIncome: 2200, txCount: 80 }]);
    expect(h.label).toBe('October 2026 cycle');
    expect(h.old_label).toBe('November 2026 (26 Oct to 24 Nov)');
    expect(h.spent_by_bucket).toEqual({ Fun: 32117, Essentials: 20834 });
    expect([h.spent_pence, h.invested_pence, h.income_pence]).toEqual([52951, 119000, 220000]);
  });
  it('turns paydays into cycles that end the day before the next payday', () => {
    expect(convertCycles(['2026-11-24', '2026-10-26', '2026-12-18'])).toEqual([
      { start_date: '2026-10-26', end_date: '2026-11-23', predicted_next_payday: null },
      { start_date: '2026-11-24', end_date: '2026-12-17', predicted_next_payday: null },
    ]);
  });
  it('fixes the £100.01 budget from the float bug and says so', () => {
    const s = convertSettings({ budgets: { Groceries: 100.01, Fun: 140 }, buffer: 250, paydates: ['2026-11-24'], recurring: [], potDefs: [], merchantRules: {}, payerRules: [] }, [], '2026-11-25');
    expect(s.budgets).toEqual({ Groceries: 10000, Fun: 14000 });
    expect(s.notes[0]).toMatch(/Groceries/);
    expect(s.settings.reserve_pence).toBe(25000);
  });
  it('keeps every setting it has no column for', () => {
    const s = convertSettings({ budgets: {}, paydates: [], quick: [{ shop: 'Test' }], widgets: { a: 1 } }, [{ pot: 'Holiday' }], '2026-11-25');
    expect(s.settings.extra.legacy.settings.quick).toEqual([{ shop: 'Test' }]);
    expect(s.settings.extra.legacy.pots).toEqual([{ pot: 'Holiday' }]);
  });
  it('bills get their next date from today', () => {
    const s = convertSettings({ budgets: {}, recurring: [{ name: 'Phone', amount: 10, day: 22, freq: 'monthly', account: 'Ulster Bank' }] }, [], '2026-11-25');
    expect(s.recurring[0]).toMatchObject({ amount_pence: 1000, next_date: '2026-12-22', cadence: 'monthly', account: 'Ulster Bank' });
  });
});
