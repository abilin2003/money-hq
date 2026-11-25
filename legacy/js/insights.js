// The "Am I okay?" numbers. Pure functions, so they can be tested without a browser.
// Everything here is worked out from the saved data: nothing is hard-coded.
import { periodFor, inPeriod } from './paycycle.js';
import { addDays, dayDiff, r2, normKey } from './money.js';

const sum = (list) => r2(list.reduce((a, t) => a + t.amount, 0));
const pad = (n) => String(n).padStart(2, '0');
// "18 Nov" from "2026-11-18" (a plain date, so no time zone surprises).
const niceDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// When does a monthly bill fall inside this pay cycle? Returns a list of "YYYY-MM-DD".
// Only monthly and yearly bills are understood for now; other kinds are left out.
export function billDates(bill, period) {
  const freq = bill.freq || 'monthly';
  if (freq !== 'monthly' && freq !== 'yearly') return [];
  const out = [];
  let y = +period.start.slice(0, 4);
  let m = +period.start.slice(5, 7);
  const endKey = period.end.slice(0, 7);
  for (let guard = 0; guard < 14; guard++) {
    const key = `${y}-${pad(m)}`;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const date = `${key}-${pad(Math.min(Math.max(1, bill.day || 1), dim))}`;
    const monthOk = freq === 'monthly' || Number(bill.month) === m;
    if (monthOk && inPeriod(date, period)) out.push(date);
    if (key >= endKey) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// What is the status of this pay cycle? `today` is "YYYY-MM-DD".
export function cycleSummary(data, today) {
  const st = data.settings;
  const period = periodFor(today, st.paydates);
  // A transaction can be assigned to a different budget cycle (cycleDate) without changing its bank date.
  const cycleTx = data.transactions.filter((t) => inPeriod(t.cycleDate || t.date, period));
  const through = cycleTx.length ? cycleTx.map((t) => t.date).sort().pop() : null;
  const staleDays = through ? Math.max(0, dayDiff(through, today)) : null;

  const of = (kind, direction, extra = () => true) => cycleTx.filter((t) => t.kind === kind && t.direction === direction && extra(t));
  const income = sum(of('income', 'in'));
  const invested = sum(of('invested', 'out'));
  const paidBack = sum(of('payback', 'in'));

  // ---- Budgets: money out, less what friends and refunds paid back for the same bucket ----
  const budgets = st.budgets || {};
  const order = [...st.categories.map((c) => c.name), ...Object.keys(budgets)];
  const names = [...new Set(order)].filter((n) => Number(budgets[n]) > 0);
  const buckets = names.map((name) => {
    const cat = st.categories.find((c) => c.name === name) || {};
    const spent = sum(of('spending', 'out', (t) => t.category === name));
    const back = sum(of('payback', 'in', (t) => t.category === name));
    const net = Math.max(0, r2(spent - back));
    const budget = r2(budgets[name]);
    const left = r2(budget - net);
    return { name, emoji: cat.emoji || '', color: cat.color || '', budget, spent, back, net, left, over: left < 0 ? r2(-left) : 0 };
  });
  const budgetTotal = r2(buckets.reduce((a, b) => a + b.budget, 0));
  const netTotal = r2(buckets.reduce((a, b) => a + b.net, 0));
  const leftTotal = r2(buckets.reduce((a, b) => a + Math.max(0, b.left), 0));

  // ---- Bills that fall in this cycle but are not in the data yet (the data stops before they were due) ----
  const bills = [];
  for (const bill of st.recurring || []) {
    for (const date of billDates(bill, period)) {
      const unseen = through ? date > through : true;
      bills.push({ name: bill.name, amount: r2(bill.amount), date, unseen, dueSoon: date >= today });
    }
  }
  bills.sort((a, b) => a.date.localeCompare(b.date));
  const billsUnseen = r2(bills.filter((b) => b.unseen).reduce((a, b) => a + b.amount, 0));

  // ---- Safe to spend until payday ----
  const daysLeft = period.daysLeft + 1; // today counts
  const safeTotal = Math.max(0, r2(leftTotal - billsUnseen));
  const safe = { total: safeTotal, perDay: r2(safeTotal / daysLeft), days: daysLeft, billsHeldBack: billsUnseen };

  // ---- Spoken for vs free ----
  const legacy = st.legacy || {};
  const planned = r2(Object.values(legacy.lt || {}).reduce((a, v) => a + (Number(v) || 0), 0)
    + Object.values(legacy.st || {}).reduce((a, v) => a + (Number(v) || 0), 0));
  const buffer = r2(st.buffer || 0);
  const moneyIn = income > 0 ? income : r2(Number(legacy.income) || 0);
  const spokenFor = r2(planned + buffer);
  const free = Math.max(0, r2(moneyIn - spokenFor));

  // ---- Status, in plain words ----
  const over = buckets.filter((b) => b.over > 0.005);
  const list = (arr) => arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
  const gbp = (n) => `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  let level = 'good';
  let headline = "Yes, you're okay.";
  let reason = `Every budget is on track, and ${gbp(safeTotal)} is still safe to spend.`;
  if (!buckets.length) {
    level = 'watch';
    headline = 'Add your budgets to see where you stand.';
    reason = 'No budgets are set yet, so there is nothing to compare your spending against.';
  } else if (netTotal > budgetTotal * 1.15) {
    // Red is kept for being clearly over (15% or more), never for a small overshoot.
    level = 'act';
    headline = 'Worth a closer look.';
    reason = `Spending is ${gbp(netTotal - budgetTotal)} above your total budget this cycle. Here's what to adjust.`;
  } else if (over.length || netTotal > budgetTotal) {
    level = 'watch';
    const names = over.map((b) => b.name);
    headline = names.length ? `Mostly okay: keep an eye on ${list(names)}.` : 'Mostly okay: keep an eye on your spending.';
    const amounts = list(over.map((b) => `${b.name} by ${gbp(b.over)}`));
    const overall = netTotal > budgetTotal ? ` (${gbp(netTotal - budgetTotal)} over in total)` : '';
    const room = safeTotal > 0 ? `You still have ${gbp(safeTotal)} safe to spend.` : 'There is no room left to spend this cycle.';
    reason = names.length
      ? `${amounts} ${over.length === 1 ? 'is' : 'are'} over budget${overall}. ${room}`
      : `You are ${gbp(netTotal - budgetTotal)} over your total budget. ${room}`;
  }

  // ---- What's going well (up to 2) ----
  const wins = [];
  const best = buckets.filter((b) => b.left >= Math.max(10, b.budget * 0.1)).sort((a, b) => b.left - a.left)[0];
  if (best) wins.push(`${best.name} is ${gbp(best.left)} under budget.`);
  if (invested > 0) wins.push(`${gbp(invested)} went into your ISAs this cycle.`);
  if (paidBack > 0) wins.push(`Friends and refunds paid back ${gbp(paidBack)}, which brings your spending down.`);

  // ---- Next actions (up to 3), each with its £ effect ----
  const actions = [];
  const unsure = data.transactions.filter((t) => t.kind === 'unsure').length;
  if (staleDays !== null && staleDays >= 2) {
    actions.push({ text: `Add your latest statements. Your data stops on ${niceDay(through)}, ${staleDays} days ago.`, effect: 'The numbers above become exact.' });
  }
  // The two buckets furthest over (ignoring tiny overshoots under £5).
  for (const worst of over.filter((b) => b.over >= 5).sort((a, b) => b.over - a.over).slice(0, 2)) {
    const byShop = new Map();
    for (const t of of('spending', 'out', (x) => x.category === worst.name)) {
      const key = normKey(t.desc) || t.desc;
      const cur = byShop.get(key) || { name: t.desc, total: 0 };
      cur.total = r2(cur.total + t.amount);
      byShop.set(key, cur);
    }
    const top = [...byShop.values()].sort((a, b) => b.total - a.total)[0];
    const before = worst.back > 0 ? ', before friends paid you back' : '';
    actions.push({
      text: `${worst.name} is ${gbp(worst.over)} over.${top ? ` Your biggest ${worst.name} spend was ${top.name} (${gbp(top.total)}${before}).` : ''}`,
      effect: `Easing off by ${gbp(worst.over)} next cycle keeps ${worst.name} on budget.`,
    });
  }
  if (unsure > 0) actions.push({ text: `Decide ${unsure} ${unsure === 1 ? 'line' : 'lines'} under "Not sure yet" in the List tab.`, effect: 'They count in your totals once decided.' });
  if (period.missing) actions.push({ text: 'Add your next payday.', effect: 'So "safe to spend" counts the right number of days.' });
  if (!actions.length) actions.push({ text: 'Nothing needs fixing right now.', effect: 'Enjoy it.' });

  return {
    period, today, through, staleDays,
    counts: { transactions: data.transactions.length, inCycle: cycleTx.length, internal: data.transactions.filter((t) => t.kind === 'internal').length, unsure },
    income, invested, paidBack,
    buckets, totals: { budget: budgetTotal, net: netTotal, left: leftTotal },
    bills, safe,
    plan: { moneyIn, spokenFor, free, planned, buffer },
    status: { level, headline, reason },
    wins: wins.slice(0, 2), actions: actions.slice(0, 3),
  };
}

export { addDays };
