// Pay cycles. Pay is monthly but the dates vary, so you enter them. A cycle runs from payday
// to the day before the next payday. "This month" always means the current pay cycle.
import { isIsoDate, addDays, addMonths, dayDiff } from './money.js';

// paydates: list of "YYYY-MM-DD". Returns { start, end, next, missing, totalDays, dayNumber, daysLeft }.
// "missing" is true when the next payday has not been entered, so the end is a best guess (a month on).
export function periodFor(dateIso, paydates = []) {
  const dates = paydates.filter(isIsoDate).sort();
  let start = null;
  let next = null;
  for (const d of dates) {
    if (d <= dateIso) start = d;
    else { next = d; break; }
  }
  if (!start) start = next ? addMonths(next, -1) : `${dateIso.slice(0, 7)}-01`;
  const missing = !next;
  if (!next) next = addMonths(start, 1);
  const end = addDays(next, -1);
  const totalDays = Math.max(1, dayDiff(start, end) + 1);
  const dayNumber = Math.min(totalDays, Math.max(1, dayDiff(start, dateIso) + 1));
  return { start, end, next, missing, totalDays, dayNumber, daysLeft: totalDays - dayNumber };
}

export const inPeriod = (dateIso, period) => dateIso >= period.start && dateIso <= period.end;
