// Dates are plain calendar dates ("2026-11-25") in Europe/London. Maths on them is done at noon UTC,
// so clocks changing can never shift a day.

const LONDON = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

// Today's date in London (en-CA formats as YYYY-MM-DD).
export const todayLondon = (now = new Date()) => LONDON.format(now);

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDate(s).toISOString().slice(0, 10) === s;

const toDate = (iso) => new Date(`${iso}T12:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);

export const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
export const dayDiff = (from, to) => Math.round((toDate(to) - toDate(from)) / 86400000);
export const weekday = (iso) => toDate(iso).getUTCDay(); // 0 Sunday .. 6 Saturday
export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1..12
