// Small shared helpers for amounts, dates and names. Pure functions: they work in Node and in the browser.

export const r2 = (n) => Math.round(Number(n) * 100) / 100;

// "£1,234.56", "(12.00)" and "-5" all work. Returns NaN when there is nothing to read.
export function parseAmount(input) {
  const s = String(input ?? '').trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[£$€\s]/g, ''));
  const value = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? (negative ? -value : value) : NaN;
}

// ---- Dates are kept as plain "YYYY-MM-DD" text, so time zones can never shift them. ----

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n) => String(n).padStart(2, '0');

function toIso(y, m, d) {
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

// UK-style day-first dates, ISO dates, and "18 Nov 2026" style dates. Returns null if unreadable.
export function parseDate(input) {
  const s = String(input ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return toIso(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return toIso(y, +m[2] - 1, +m[1]);
  }
  if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,4})[A-Za-z]*[\s\-,]+(\d{2,4})/))) {
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

export function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) === s;
}

const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const dayDiff = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 864e5);

export function addDays(iso, n) {
  const d = new Date(dayMs(iso) + n * 864e5);
  return toIso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function addMonths(iso, n) {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1;
  const d = +iso.slice(8, 10);
  const total = m + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return toIso(ny, nm, Math.min(d, daysInMonth));
}

export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---- Names ----

// Lower-case letters and single spaces only, so "TESCO STORES 4346" and "Tesco Stores" compare equal.
export const normKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NOISE = ['card', 'payment', 'pos', 'contactless', 'to', 'from', 'transfer', 'purchase', 'visa', 'debit', 'dd', 'so', 'the', 'mr', 'mrs', 'ms', 'miss'];

// The part of a description that identifies the shop or person, used to group and to learn rules.
export function merchantKey(desc) {
  const words = normKey(desc).split(' ').filter(Boolean);
  while (words.length > 1 && NOISE.includes(words[0])) words.shift();
  if (!words.length) return '';
  return words[0].length >= 3 ? words[0] : words.slice(0, 2).join(' ');
}

// Tidies a bank description for display: strips long numbers, and fixes SHOUTING.
export function cleanName(desc) {
  let s = String(desc ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b\d{4,}\b/g, '').replace(/\s+/g, ' ').trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, lead, c) => lead + c.toUpperCase());
  }
  return s;
}

export function makeId(prefix = 'tx') {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random}`;
}
