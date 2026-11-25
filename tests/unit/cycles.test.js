// Pay cycles (spec section 4, rules 3, 4 and 9). Dates are calendar dates in Europe/London. Paydays here are made up.
import { describe, it, expect } from 'vitest';
import { cycleFor, cycleList, predictPayday, pace, cycleName } from '../../src/lib/cycles.js';
import { todayLondon, addDays, dayDiff } from '../../src/lib/dates.js';

const paydays = ['2026-09-24', '2026-10-26', '2026-11-24', '2026-12-18'];

describe('dates', () => {
  it('today is the London calendar date, not UTC', () => {
    // 23:30 UTC on 30 June is already 1 July in London (BST, UTC+1).
    expect(todayLondon(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    // In winter London is UTC, so 23:30 UTC on 30 Nov is still 30 Nov.
    expect(todayLondon(new Date('2026-11-30T23:30:00Z'))).toBe('2026-11-30');
  });
  it('adds days and counts days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayDiff('2026-10-26', '2026-11-23')).toBe(28);
    expect(dayDiff('2026-03-28', '2026-03-30')).toBe(2); // across the clocks going forward
  });
});

describe('cycleFor: payday to the day before the next payday', () => {
  it('crosses a month end', () => {
    const c = cycleFor('2026-11-10', paydays);
    expect(c.start).toBe('2026-10-26');
    expect(c.end).toBe('2026-11-23');
    expect(c.totalDays).toBe(29);
  });
  it('payday itself is day 1 of the new cycle', () => {
    const c = cycleFor('2026-11-24', paydays);
    expect(c.start).toBe('2026-11-24');
    expect(c.end).toBe('2026-12-17'); // the early December payday makes this cycle short
    expect(c.dayNumber).toBe(1);
    expect(c.totalDays).toBe(24);
  });
  it('day N of M uses the real cycle length', () => {
    const c = cycleFor('2026-11-25', paydays);
    expect([c.dayNumber, c.totalDays, c.daysLeft]).toEqual([2, 24, 22]);
    const last = cycleFor('2026-11-23', paydays);
    expect([last.dayNumber, last.totalDays, last.daysLeft]).toEqual([29, 29, 0]);
  });
  it('predicts the next payday when it has not been entered, and says so', () => {
    const c = cycleFor('2026-12-20', paydays); // after the last known payday
    expect(c.start).toBe('2026-12-18');
    expect(c.predicted).toBe(true);
    expect(c.next).toBe('2027-01-22'); // 24 Jan 2027 is a Sunday, so the Friday before
    expect(c.end).toBe('2027-01-21');
  });
  it('keeps predicting forward when today is well past the last known payday', () => {
    // Known paydays stop at 18 Dec. Predicted: 22 Jan (24th is a Sunday), then 24 Feb.
    const c = cycleFor('2027-02-10', paydays);
    expect([c.start, c.end, c.next, c.predicted]).toEqual(['2027-01-22', '2027-02-23', '2027-02-24', true]);
    expect(c.dayNumber).toBe(20);
    expect(c.daysLeft).toBeGreaterThan(0);
  });
  it('a known next payday is not marked as predicted', () => {
    expect(cycleFor('2026-11-10', paydays).predicted).toBe(false);
  });
});

describe('predictPayday', () => {
  it('uses the usual day of the month, moved back to Friday at weekends', () => {
    expect(predictPayday('2026-12-18')).toBe('2027-01-22'); // 24 Jan 2027 is a Sunday
    expect(predictPayday('2027-01-22')).toBe('2027-02-24'); // Wednesday
    expect(predictPayday('2026-09-24', 25)).toBe('2026-10-23'); // 25 Oct 2026 is a Sunday
  });
});

describe('cycle names and lists', () => {
  it('a cycle is named after the month it ends in', () => {
    expect(cycleName(cycleFor('2026-11-10', paydays))).toBe('November');
  });
  it('lists cycles newest first, back to the one holding the first date', () => {
    expect(cycleList(paydays, '2026-10-30', '2026-11-25').map((c) => c.start)).toEqual(['2026-11-24', '2026-10-26']);
  });
});

describe('pace: expected spend by today = budget × days elapsed ÷ cycle length', () => {
  const c = cycleFor('2026-11-10', paydays); // day 16 of 29
  it('works out the expected spend in whole pence', () => {
    expect(pace(14000, 10000, c).expected).toBe(7724); // £140 × 16 ÷ 29
  });
  it('is on pace when spent is at or under expected', () => {
    expect(pace(14000, 7724, c).onPace).toBe(true);
    expect(pace(14000, 7725, c).onPace).toBe(false);
  });
  it('with nothing spent it does not pretend to know the future (section 11, bug 3)', () => {
    const p = pace(14000, 0, cycleFor('2026-11-25', paydays));
    expect(p.spent).toBe(0);
    expect(p.projected).toBeNull(); // no spending yet: no projection, rather than "£0 by payday"
  });
  it('projects the end-of-cycle total once there is spending', () => {
    expect(pace(14000, 1600, c).projected).toBe(2900); // £16 over 16 days, 29-day cycle
  });
});
