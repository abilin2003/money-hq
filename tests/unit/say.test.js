// "Say several": a card can only be saved when everything it needs is there. Made-up data.
import { describe, it, expect } from 'vitest';
import { missingFor, parseSplitsText, splitsText } from '../../src/views/say.js';

describe('say several', () => {
  const ok = { date: '2026-11-25', amount_pence: -1250, description: 'Tesco', account_id: 'rev', kind: 'spend', category_id: 'gro', splits: [] };
  it('a complete card is ready; anything not said stops it being saved', () => {
    expect(missingFor(ok)).toEqual([]);
    expect(missingFor({ ...ok, account_id: null, category_id: null, date: null })).toEqual(['date', 'account', 'category']);
    expect(missingFor({ ...ok, kind: 'repayment', amount_pence: 1838, category_id: null })).toEqual([]); // money back needs no category
    expect(missingFor({ ...ok, splits: [{ name: 'Ben', pence: null }] })).toEqual(['split amounts']);
  });
  it('who owes you, written as “Ben 20, Dad 12.50”, and back', () => {
    expect(parseSplitsText('Ben 20, Dad £12.50, Alton')).toEqual([{ name: 'Ben', pence: 2000 }, { name: 'Dad', pence: 1250 }, { name: 'Alton', pence: null }]);
    expect(splitsText([{ name: 'Ben', pence: 2000 }])).toBe('Ben 20.00');
  });
});
