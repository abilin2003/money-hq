// Text helpers ported from the previous app: dates in any bank format, tidy shop names, matching keys.

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n) => String(n).padStart(2, '0');
function toIso(y, m, d) {
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

// "2026-11-02", "02/11/2026", "2 Nov 2026", "Nov 2, 2026" -> "2026-11-02". UK order (day first). null if unreadable.
export function parseDate(input) {
  const s = String(input ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return toIso(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return toIso(y, +m[2] - 1, +m[1]);
  }
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[A-Za-z]*[\s,-]+(\d{2,4})/))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    const month = MONTHS[m[2].toLowerCase()];
    return month == null ? null : toIso(y, month, +m[1]);
  }
  if ((m = s.match(/^([A-Za-z]{3,4})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/))) {
    const month = MONTHS[m[1].toLowerCase()];
    return month == null ? null : toIso(+m[3], month, +m[2]);
  }
  return null;
}

// Lower-case letters and single spaces only, so "TESCO STORES 4346" and "Tesco Stores" compare equal.
export const normKey = (s) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/['’`]/g, '').replace(/[^a-z]+/g, ' ').replace(/\s+/g, ' ').trim();

const NOISE = ['card', 'payment', 'pos', 'contactless', 'to', 'from', 'transfer', 'purchase', 'visa', 'debit', 'dd', 'so', 'the', 'mr', 'mrs', 'ms', 'miss'];

// The part of a description that identifies the shop or person, used to group rows and to learn rules.
export function merchantKey(desc) {
  const words = normKey(desc).split(' ').filter(Boolean);
  while (words.length > 1 && NOISE.includes(words[0])) words.shift();
  if (!words.length) return '';
  return words[0].length >= 3 ? words[0] : words.slice(0, 2).join(' ');
}

// "TESCO STORES 4346" -> "Tesco Stores". Long numbers (card and reference numbers) are removed.
export function cleanName(desc) {
  let s = String(desc ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b\d{4,}\b/g, '').replace(/\s+/g, ' ').trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, lead, c) => lead + c.toUpperCase());
  }
  return s;
}
