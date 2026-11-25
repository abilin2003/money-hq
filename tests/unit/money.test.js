// Money is integer pence everywhere (spec section 4, rule 1). All values here are made up.
import { describe, it, expect } from 'vitest';
import { parsePence, formatPence, sumPence, perMonthPence } from '../../src/lib/money.js';

describe('parsePence: text or numbers to whole pence, with no float maths', () => {
  it.each([
    ['100.01', 10001], // the bug from section 11: must never become 100.00999...
    ['£1,234.5', 123450],
    ['-12', -1200],
    ['12', 1200],
    ['0.1', 10],
    ['£0.07', 7],
    [' 5 ', 500],
    ['(12.00)', -1200], // bank-statement style negative
    ['-£3.40', -340],
    ['£-3.40', -340],
    ['1,000,000', 100000000],
    ['.5', 50],
  ])('%s -> %i pence', (input, pence) => expect(parsePence(input)).toBe(pence));

  it('rounds a third decimal place to the nearest penny, half away from zero', () => {
    expect(parsePence('1.005')).toBe(101);
    expect(parsePence('-1.005')).toBe(-101);
    expect(parsePence('1.004')).toBe(100);
  });

  it('accepts numbers, including ones that floats store badly', () => {
    expect(parsePence(100.01)).toBe(10001);
    expect(parsePence(0.1 + 0.2)).toBe(30);
    expect(parsePence(-12)).toBe(-1200);
  });

  it.each(['', '   ', 'abc', '£', '1.2.3', null, undefined, NaN, '12abc'])('returns null for %s', (input) => {
    expect(parsePence(input)).toBeNull();
  });
});

describe('formatPence: only for display', () => {
  it('formats with £, thousands separators and two decimals', () => {
    expect(formatPence(123456)).toBe('£1,234.56');
    expect(formatPence(7)).toBe('£0.07');
    expect(formatPence(0)).toBe('£0.00');
    expect(formatPence(-1200)).toBe('-£12.00');
  });
  it('can drop the pence for headline numbers', () => {
    expect(formatPence(123456, { pence: false })).toBe('£1,235');
  });
  it('refuses anything that is not whole pence, so a float can never sneak in', () => {
    expect(() => formatPence(100.01)).toThrow();
  });
});

describe('sums and per-month figures', () => {
  it('adds pence exactly', () => {
    expect(sumPence([10001, 1, -2])).toBe(10000);
  });
  it('works out "per month" by days, never by calendar months touched (section 11, bug 1)', () => {
    // £163 of fuel in one 29-day cycle that touches two calendar months is about £171 a month, not £82.
    expect(perMonthPence(16300, 29)).toBe(17109);
    expect(perMonthPence(0, 29)).toBe(0);
    expect(() => perMonthPence(100, 0)).toThrow();
  });
});
