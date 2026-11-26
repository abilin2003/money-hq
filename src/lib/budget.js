// The budget engine: bills, safe to spend, leftovers, the payday plan and sinking funds. Whole pence throughout.
import { addDays, daysInMonth, dayDiff } from './dates.js';
import { normKey, merchantKey } from './text.js';

const pad = (n) => String(n).padStart(2, '0');

// Dates a bill falls on inside a cycle. Monthly and quarterly bills use the day of their next_date (a bill on
// the 31st falls on the last day of shorter months); weekly bills step 7 days; yearly bills use day and month.
export function billDates(bill, cycle) {
  if (!bill.next_date) return [];
  const day = +bill.next_date.slice(8, 10);
  const out = [];
  if (bill.cadence === 'weekly') {
    let d = bill.next_date;
    while (d > cycle.start) d = addDays(d, -7);
    for (; d <= cycle.end; d = addDays(d, 7)) if (d >= cycle.start) out.push(d);
    return out;
  }
  let y = +cycle.start.slice(0, 4);
  let m = +cycle.start.slice(5, 7);
  const anchorMonth = +bill.next_date.slice(5, 7);
  for (let guard = 0; guard < 3; guard++) {
    const date = `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
    const monthOk = bill.cadence === 'yearly' ? m === anchorMonth : bill.cadence === 'quarterly' ? (m - anchorMonth + 12) % 3 === 0 : true;
    if (monthOk && date >= cycle.start && date <= cycle.end) out.push(date);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const matchKey = (bill) => normKey(bill.match || merchantKey(bill.name));
export const paysBill = (t, bill) => t.amount_pence < 0 && ` ${normKey(t.raw_description)} `.includes(` ${matchKey(bill)} `);

// Every bill date in the cycle, with paid = a matching payment within 10 days either side is already there
// (banks often charge a few days late: a bill due on the 1st can land on the 9th).
export function billsInCycle(bills, cycle, txs, today) {
  const used = new Set();
  const out = [];
  for (const bill of bills.filter((b) => b.is_active !== false)) {
    for (const date of billDates(bill, cycle)) {
      const payment = txs.find((t) => !used.has(t) && paysBill(t, bill) && Math.abs(dayDiff(date, t.date)) <= 10);
      if (payment) used.add(payment);
      out.push({ name: bill.name, amount_pence: bill.amount_pence, date, paid: Boolean(payment), dueSoon: !payment && date >= today, overdue: !payment && date < today });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Bills in the next `days` days from today (across cycles), for the "Coming up" list.
export function upcomingBills(bills, today, days = 14, txs = []) {
  const window = { start: today, end: addDays(today, days - 1) };
  return billsInCycle(bills, window, txs, today).filter((b) => !b.paid);
}

// Safe to spend (rule 8): money left in budgeted buckets − bills still due before payday − reserve.
// Unbudgeted buckets (like Fuel) are tracked but don't count. Paid bills are already in bucket spending.
export function safeToSpend({ cycle, today, budgets, spentByBucket, bills, reserve = 0 }) {
  const left = Object.entries(budgets).reduce((a, [b, budget]) => a + budget - (spentByBucket[b] || 0), 0);
  const due = bills.filter((b) => !b.paid).reduce((a, b) => a + b.amount_pence, 0);
  const raw = left - due - reserve;
  const daysLeft = Math.max(1, dayDiff(today, cycle.end) + 1);
  const total = Math.max(0, raw);
  return {
    total,
    perDay: Math.floor(total / daysLeft),
    daysLeft,
    short: raw < 0 ? -raw : 0,
    lines: [
      { label: 'Left in your buckets', pence: left },
      { label: 'Bills still due before payday', pence: -due },
      { label: 'Reserve', pence: -reserve },
    ],
  };
}

// Budgets with last cycle's leftovers added for buckets set to roll over. Sweep (the default) starts fresh.
export function effectiveBudgets(budgets, lastBudgets, lastSpent, leftover = {}) {
  const out = {};
  for (const [b, budget] of Object.entries(budgets)) {
    const carried = leftover[b] === 'rollover' && lastBudgets[b] ? Math.max(0, lastBudgets[b] - (lastSpent[b] || 0)) : 0;
    out[b] = { budget, carried, total: budget + carried };
  }
  return out;
}

// Pay minus everything assigned. Negative means more was assigned than came in.
// funding: extra money used alongside the pay (e.g. "Existing Ulster balance"), so an over-assigned plan can be
// explained instead of hidden. Without it, assigning more than came in shows as a negative unassigned amount.
export function planTotals(pay, items, budgets, funding = []) {
  const itemTotal = items.reduce((a, i) => a + (i.amount_pence || 0), 0);
  const bucketTotal = Object.values(budgets).reduce((a, v) => a + (v || 0), 0);
  const extra = funding.reduce((a, f) => a + (f.amount_pence || 0), 0);
  return { pay, extra, available: pay + extra, items: itemTotal, buckets: bucketTotal, unassigned: pay + extra - itemTotal - bucketTotal };
}

// What a sinking fund needs each payday to reach its target by its date (null if it has no date).
export function fundNeedPerCycle(fund, today) {
  if (!fund.due_date) return null;
  const remaining = Math.max(0, (fund.target_pence || 0) - (fund.balance_pence || 0));
  if (!remaining) return 0;
  const months = Math.max(1, (+fund.due_date.slice(0, 4) - +today.slice(0, 4)) * 12 + (+fund.due_date.slice(5, 7) - +today.slice(5, 7)) - 1);
  return Math.ceil(remaining / months);
}

// Regular payments that aren't on your bills list yet: the same shop in 3+ different months for a similar
// amount (within 10%), money out only.
export function detectRecurring(txs, bills, minMonths = 3) {
  const known = bills.map((b) => matchKey(b)).filter(Boolean);
  const groups = new Map();
  for (const t of txs) {
    if (t.amount_pence >= 0 || t.kind !== 'spend' || t.status === 'needs_review') continue;
    const key = merchantKey(t.raw_description);
    if (!key || known.some((k) => ` ${normKey(t.raw_description)} `.includes(` ${k} `))) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    const amounts = list.map((t) => -t.amount_pence).sort((a, b) => a - b);
    const typical = amounts[Math.floor(amounts.length / 2)];
    const similar = list.filter((t) => Math.abs(-t.amount_pence - typical) <= typical * 0.1);
    const months = new Set(similar.map((t) => t.date.slice(0, 7)));
    if (months.size < minMonths) continue;
    // A bill is paid about once a month: a shop you visit several times a month isn't one, even at a similar price.
    if (list.length > months.size * 1.5) continue;
    const last = similar.map((t) => t.date).sort().pop();
    out.push({ key, name: similar[similar.length - 1].raw_description, amount_pence: typical, months: months.size, day: +last.slice(8, 10), last });
  }
  return out.sort((a, b) => b.months - a.months || b.amount_pence - a.amount_pence);
}
