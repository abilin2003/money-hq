// Pay cycles: from the day salary lands to the day before the next salary lands.
// Known paydays come from settings. When the next one isn't known yet it is predicted (and marked as predicted).
import { addDays, dayDiff, weekday, daysInMonth, isIsoDate } from './dates.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

// The next payday after `fromIso`: the usual day of next month, moved back to Friday if it's a weekend.
export function predictPayday(fromIso, usualDay = 24) {
  let y = +fromIso.slice(0, 4);
  let m = +fromIso.slice(5, 7) + 1;
  if (m > 12) { m = 1; y += 1; }
  let d = `${y}-${pad(m)}-${pad(Math.min(usualDay, daysInMonth(y, m)))}`;
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
}

// The cycle holding `dateIso`. Returns { start, end, next, predicted, totalDays, dayNumber, daysLeft }.
export function cycleFor(dateIso, paydays = [], usualDay = 24) {
  const dates = [...new Set(paydays.filter(isIsoDate))].sort();
  let start = null;
  let next = null;
  for (const d of dates) {
    if (d <= dateIso) start = d;
    else { next = d; break; }
  }
  if (!start) {
    // Before the first known payday: step back from it by predictions until we cover the date.
    start = dates[0] || `${dateIso.slice(0, 7)}-01`;
    while (start > dateIso) { const prev = predictPrevious(start, usualDay); next = start; start = prev; }
  }
  const predicted = !next;
  if (!next) next = predictPayday(start, usualDay);
  const end = addDays(next, -1);
  const totalDays = dayDiff(start, end) + 1;
  const dayNumber = Math.min(totalDays, Math.max(1, dayDiff(start, dateIso) + 1));
  return { start, end, next, predicted, totalDays, dayNumber, daysLeft: totalDays - dayNumber };
}

function predictPrevious(iso, usualDay) {
  let y = +iso.slice(0, 4);
  let m = +iso.slice(5, 7) - 1;
  if (m < 1) { m = 12; y -= 1; }
  let d = `${y}-${pad(m)}-${pad(Math.min(usualDay, daysInMonth(y, m)))}`;
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
}

// A cycle is named after the month it ends in: 26 Oct to 23 Nov is the "November" cycle.
export const cycleName = (cycle) => MONTHS[+cycle.end.slice(5, 7) - 1];

// Every cycle from today's back to the one holding `firstDate`, newest first.
export function cycleList(paydays, firstDate, today, usualDay = 24) {
  const out = [];
  let d = today;
  for (let guard = 0; guard < 120; guard++) {
    const c = cycleFor(d, paydays, usualDay);
    out.push({ ...c, name: cycleName(c) });
    if (c.start <= firstDate) break;
    d = addDays(c.start, -1);
  }
  return out;
}

// Pace for one bucket. expected = budget × days elapsed ÷ cycle length, in whole pence.
// projected is null until something has been spent: no spending means no forecast, not "£0 by payday".
export function pace(budgetPence, spentPence, cycle) {
  const expected = Math.round((budgetPence * cycle.dayNumber) / cycle.totalDays);
  const projected = spentPence > 0 ? Math.round((spentPence / cycle.dayNumber) * cycle.totalDays) : null;
  return { budget: budgetPence, spent: spentPence, expected, onPace: spentPence <= expected, projected };
}
