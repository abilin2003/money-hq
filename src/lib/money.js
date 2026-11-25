// Money is whole pence (integers) everywhere. Pounds only appear when something is shown on screen.
// Text is turned into pence by reading the digits, never by multiplying a float by 100,
// so "100.01" is always 10001 and never 10000.999...

// "£1,234.5" -> 123450, "-12" -> -1200, "(12.00)" -> -1200. Returns null when there is no amount to read.
export function parsePence(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    input = input.toFixed(6); // enough places to round correctly, without float noise like 0.30000000000000004
  }
  let s = String(input).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  s = s.replace(/[£,\s]/g, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const [whole = '', frac = ''] = s.split('.');
  const digits = (frac + '000').slice(0, 3); // pence plus one digit for rounding
  let pence = Number(whole || '0') * 100 + Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) pence += 1; // half away from zero (the sign is applied after)
  if (!Number.isSafeInteger(pence)) return null;
  return negative && pence !== 0 ? -pence : pence;
}

const assertPence = (p) => {
  if (!Number.isInteger(p)) throw new TypeError(`Expected whole pence, got ${p}`);
  return p;
};

// 123456 -> "£1,234.56". { pence: false } -> "£1,235" for headline numbers.
export function formatPence(p, { pence = true } = {}) {
  assertPence(p);
  const abs = Math.abs(p);
  const text = pence
    ? `£${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`
    : `£${Math.round(abs / 100).toLocaleString('en-GB')}`;
  return p < 0 ? `-${text}` : text;
}

export const sumPence = (list) => list.reduce((a, p) => a + assertPence(p), 0);

// "Per month" is worked out by days: total ÷ days × 30.44 (the average month length), rounded to a penny.
export const DAYS_PER_MONTH = 30.44;
export function perMonthPence(totalPence, days) {
  assertPence(totalPence);
  if (!(days > 0)) throw new RangeError('days must be more than 0');
  return Math.round((totalPence / days) * DAYS_PER_MONTH);
}
