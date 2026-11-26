// The period you're looking at in Analytics: a pay cycle, the last few cycles, a calendar month or any dates.
// Pure, so it can be tested. A selection is a small object, and it goes in the page address as a short code
// so Back, refresh and links keep it:
//   { kind: 'current' }                      'cur'
//   { kind: 'cycle', start: '2026-10-26' }   'c.2026-10-26'
//   { kind: 'last', n: 3 }                   'l.3'          the last n finished cycles
//   { kind: 'month', ym: '2026-11' }         'm.2026-11'
//   { kind: 'range', from, to }              'r.2026-10-01.2026-11-15'
import { cycleList, cycleName } from './cycles.js';
import { addDays, dayDiff, daysInMonth, isIsoDate } from './dates.js';
import { monthName } from './summary.js';

const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthEnd = (ym) => `${ym}-${String(daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7))).padStart(2, '0')}`;
const shiftMonth = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export function encodePeriod(sel) {
  if (!sel || sel.kind === 'current') return 'cur';
  if (sel.kind === 'cycle') return `c.${sel.start}`;
  if (sel.kind === 'last') return `l.${sel.n}`;
  if (sel.kind === 'month') return `m.${sel.ym}`;
  return `r.${sel.from}.${sel.to}`;
}
export function decodePeriod(code) {
  const [k, a, b] = String(code || '').split('.');
  if (k === 'c' && isIsoDate(a)) return { kind: 'cycle', start: a };
  if (k === 'l' && [3, 6, 12].includes(+a)) return { kind: 'last', n: +a };
  if (k === 'm' && /^\d{4}-\d{2}$/.test(a || '')) return { kind: 'month', ym: a };
  if (k === 'r' && isIsoDate(a) && isIsoDate(b)) return { kind: 'range', from: a <= b ? a : b, to: a <= b ? b : a };
  if (isIsoDate(k)) return { kind: 'cycle', start: k }; // old links: #spending/2026-10-26
  return { kind: 'current' };
}

// info: { paydays, today, usualDay, firstDate } -> { sel, kind, from, to, days, label, cycle (one cycle or null),
// cycles (the pay cycles it covers, newest first) }
export function resolvePeriod(sel, { paydays, today, usualDay = 24, firstDate }) {
  const all = cycleList(paydays, firstDate || today, today, usualDay); // newest first
  const cur = all[0];
  const one = (c, extra = '') => ({ sel, kind: 'cycle', from: c.start, to: c.end, cycle: c, cycles: [c], label: `${cycleName(c)} ${c.end.slice(0, 4)} cycle${extra}`, sub: `${short(c.start)} to ${short(c.end)}` });
  const overlapping = (from, to) => all.filter((c) => c.start <= to && c.end >= from);
  let out;
  if (!sel || sel.kind === 'current') out = one(cur, ' (current)');
  else if (sel.kind === 'cycle') out = one(all.find((c) => c.start === sel.start) || cur, sel.start === cur.start ? ' (current)' : '');
  else if (sel.kind === 'last') {
    const done = all.filter((c) => c.end < cur.start).slice(0, sel.n);
    const list = done.length ? done : [cur];
    out = { sel, kind: 'last', from: list[list.length - 1].start, to: list[0].end, cycle: null, cycles: list, label: `Last ${sel.n} cycles`, sub: `${short(list[list.length - 1].start)} to ${short(list[0].end)}${done.length < sel.n ? ` (only ${done.length} finished)` : ''}` };
  } else if (sel.kind === 'month') {
    const from = `${sel.ym}-01`; const to = monthEnd(sel.ym);
    out = { sel, kind: 'month', from, to, cycle: null, cycles: overlapping(from, to), label: monthName(sel.ym), sub: 'Calendar month' };
  } else {
    out = { sel, kind: 'range', from: sel.from, to: sel.to, cycle: null, cycles: overlapping(sel.from, sel.to), label: `${short(sel.from)} to ${short(sel.to)} ${sel.to.slice(0, 4)}`, sub: 'Custom dates' };
  }
  out.days = dayDiff(out.from, out.to) + 1;
  out.current = Boolean(out.cycle && out.cycle.start === cur.start);
  return out;
}

// The next or previous period of the same kind (dir -1 or +1), or null at the edge of your records / today.
export function stepPeriod(p, dir, info) {
  const all = cycleList(info.paydays, info.firstDate || info.today, info.today, info.usualDay); // newest first
  if (p.cycle) {
    const i = all.findIndex((c) => c.start === p.cycle.start) - dir;
    const c = all[i];
    return c ? (i === 0 ? { kind: 'current' } : { kind: 'cycle', start: c.start }) : null;
  }
  if (p.kind === 'month') {
    const ym = shiftMonth(p.sel.ym, dir);
    if (ym > info.today.slice(0, 7) || monthEnd(ym) < (info.firstDate || '')) return null;
    return { kind: 'month', ym };
  }
  if (p.kind === 'range') {
    const n = p.days * dir;
    const from = addDays(p.from, n); const to = addDays(p.to, n);
    if (from > info.today || to < (info.firstDate || '')) return null;
    return { kind: 'range', from, to };
  }
  return null; // "last n cycles" always ends at the latest finished cycle
}

// The period just before, the same length, to compare against: the previous cycle, the n cycles before, the
// previous month, or the same number of days before a custom range.
export function previousPeriod(p, info) {
  if (p.cycle) { const prev = stepPeriod(p, -1, info); return prev ? resolvePeriod(prev, info) : null; }
  if (p.kind === 'month') return resolvePeriod({ kind: 'month', ym: shiftMonth(p.sel.ym, -1) }, info);
  if (p.kind === 'last') {
    const all = cycleList(info.paydays, info.firstDate || info.today, info.today, info.usualDay);
    const i = all.findIndex((c) => c.start === p.cycles[p.cycles.length - 1].start);
    const list = all.slice(i + 1, i + 1 + p.cycles.length);
    if (!list.length) return null;
    return { kind: 'range', from: list[list.length - 1].start, to: list[0].end, cycle: null, cycles: list, label: `The ${list.length} cycles before`, days: dayDiff(list[list.length - 1].start, list[0].end) + 1 };
  }
  return resolvePeriod({ kind: 'range', from: addDays(p.from, -p.days), to: addDays(p.from, -1) }, info);
}
