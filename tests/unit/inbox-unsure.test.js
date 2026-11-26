// "Not sure" in the review inbox: the line leaves the inbox, marked, and counted honestly. Made-up data.
import { describe, it, expect } from 'vitest';
import { unsureChoice, UNSURE_NOTE } from '../../src/views/inbox.js';
import { summarise } from '../../src/lib/summary.js';

const cats = [{ id: 'eat', name: 'Eating out', is_active: true }, { id: 'misc', name: 'Miscellaneous', is_active: true }];

describe('not sure what a line is', () => {
  it('money out still counts as spending, in Miscellaneous, with a note to find it by', () => {
    expect(unsureChoice({ amount_pence: -1250, note: null }, cats)).toEqual({ kind: 'spend', category_id: 'misc', note: UNSURE_NOTE });
  });
  it('money in is not counted as income', () => {
    const c = unsureChoice({ amount_pence: 5000, note: null }, cats);
    expect(c.kind).toBe('transfer');
    const s = summarise([{ date: '2026-11-01', amount_pence: 5000, status: 'reviewed', ...c }]);
    expect(s.income).toBe(0);
  });
  it('keeps any note you already wrote, and never adds the mark twice', () => {
    expect(unsureChoice({ amount_pence: -100, note: 'cash at fair' }, cats).note).toBe(`${UNSURE_NOTE} · cash at fair`);
    expect(unsureChoice({ amount_pence: -100, note: UNSURE_NOTE }, cats).note).toBe(UNSURE_NOTE);
  });
  it('with no Miscellaneous category it is still spending, just without a category', () => {
    expect(unsureChoice({ amount_pence: -100 }, [cats[0]])).toMatchObject({ kind: 'spend', category_id: null });
  });
});
