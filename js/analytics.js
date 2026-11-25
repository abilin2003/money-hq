// Spending analytics: breakdowns, trends, habits, spikes and recurring-payment detection. Pure functions.
import { r2, addDays, dayDiff, normKey } from './money.js';
import { categoryLabel, monthRange, monthLabel } from './dashboard.js';

const sum = (list) => r2(list.reduce((a, t) => a + t.amount, 0));
export const monthOf = (iso) => iso.slice(0, 7);
const PEOPLE = new Set(['Friends', 'Partner', 'Family (mum)', 'Family (dad)', 'Family (brother)']);

// What a transaction is called when grouped by shop: the name without store numbers or punctuation.
export const shopKey = (t) => normKey(t.desc) || String(t.desc).toLowerCase();
export const catOf = (t) => (PEOPLE.has(t.detail) ? 'Friends & family' : categoryLabel(t.detail));

// filters: { from, to (dates), type: 'spending'|'payback'|'income'|'invested'|'internal'|'all', categories[], accounts[],
//            buckets[], tag, q (shop text) }
export function applyFilters(data, f = {}) {
  const type = f.type || 'spending';
  const q = String(f.q || '').trim().toLowerCase();
  return data.transactions.filter((t) => {
    if (type === 'spending' ? !(t.kind === 'spending' && t.direction === 'out') : type !== 'all' && t.kind !== type) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.categories && f.categories.length && !f.categories.includes(catOf(t))) return false;
    if (f.accounts && f.accounts.length && !f.accounts.includes(t.account)) return false;
    if (f.buckets && f.buckets.length && !f.buckets.includes(t.category)) return false;
    if (f.tag && t.tag !== f.tag) return false;
    if (q && !`${t.desc} ${t.note || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// Group a list: [{ key, label, total, count, avg, share, txs }] biggest first.
export function breakdown(list, keyFn, labelFn = (k) => k) {
  const map = new Map();
  for (const t of list) {
    const k = keyFn(t);
    const cur = map.get(k) || { key: k, label: labelFn(k, t), total: 0, count: 0, txs: [] };
    cur.total += t.amount; cur.count++; cur.txs.push(t);
    map.set(k, cur);
  }
  const grand = [...map.values()].reduce((a, x) => a + x.total, 0) || 1;
  return [...map.values()].map((x) => ({ ...x, total: r2(x.total), avg: r2(x.total / x.count), share: Math.round((x.total / grand) * 1000) / 10 })).sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- recurring vs one-off, fixed vs variable
// A shop is "recurring" if it appears in at least 3 different months with similar amounts, or matches a bill you entered.
export function detectRecurring(data) {
  const spend = data.transactions.filter((t) => t.kind === 'spending' && t.direction === 'out');
  const byShop = new Map();
  for (const t of spend) {
    const k = shopKey(t);
    if (!byShop.has(k)) byShop.set(k, []);
    byShop.get(k).push(t);
  }
  const known = (data.settings.recurring || []).map((b) => normKey(b.match || b.name));
  const found = [];
  for (const [key, list] of byShop) {
    const months = new Set(list.map((t) => monthOf(t.date)));
    if (months.size < 3) continue;
    const amounts = list.map((t) => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const similar = list.filter((t) => Math.abs(t.amount - median) <= Math.max(0.5, median * 0.1));
    const sm = new Set(similar.map((t) => monthOf(t.date)));
    if (sm.size < 3 || similar.length < sm.size * 0.6) continue;
    if (sm.size < months.size * 0.5) continue;
    const last = similar.map((t) => t.date).sort().pop();
    found.push({
      key, name: list[0].desc, amount: r2(median), months: sm.size, lastDate: last, day: +last.slice(8, 10),
      annual: r2(median * 12), alreadyEntered: known.some((k) => k && (key.includes(k) || k.includes(key))),
      category: list[0].category, account: list[0].account,
    });
  }
  return found.sort((a, b) => b.annual - a.annual);
}

// 'recurring' | 'one-off' | 'variable' for each transaction.
export function spendKinds(data, list) {
  const rec = new Set(detectRecurring(data).map((r) => r.key));
  const counts = new Map();
  for (const t of data.transactions.filter((x) => x.kind === 'spending' && x.direction === 'out')) counts.set(shopKey(t), (counts.get(shopKey(t)) || 0) + 1);
  const kindOf = (t) => (rec.has(shopKey(t)) ? 'recurring' : counts.get(shopKey(t)) === 1 && t.amount >= 50 ? 'one-off' : 'variable');
  const groups = { recurring: [], 'one-off': [], variable: [] };
  for (const t of list) groups[kindOf(t)].push(t);
  return groups;
}

export function essentialSplit(data, list) {
  const ess = new Set(data.settings.essentialBuckets || ['Essentials', 'Groceries']);
  return { essential: list.filter((t) => ess.has(t.category)), discretionary: list.filter((t) => !ess.has(t.category)) };
}

// ---------------------------------------------------------------- time series
export function dailyTotals(list) {
  const m = new Map();
  for (const t of list) m.set(t.date, r2((m.get(t.date) || 0) + t.amount));
  return m;
}

// Weeks start on Monday. Returns the last n weeks, oldest first: [{ start, total }].
export function weeklySeries(list, today, n = 12) {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const thisWeek = addDays(today, -dow);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    out.push({ start, total: sum(list.filter((t) => t.date >= start && t.date <= end)) });
  }
  return out;
}

// Average spent per day over the previous `window` days, for each of the last `days` days.
export function rollingAverage(list, today, window, days = 180) {
  const m = dailyTotals(list);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    let s = 0;
    for (let k = 0; k < window; k++) s += m.get(addDays(day, -k)) || 0;
    out.push({ date: day, value: r2(s / window) });
  }
  return out;
}

// A calendar heatmap: weeks (columns) x weekdays, for the last `weeks` weeks.
export function heatmap(list, today, weeks = 26) {
  const m = dailyTotals(list);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const lastMonday = addDays(today, -dow);
  const cols = [];
  let max = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(lastMonday, -7 * w);
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      const value = date > today ? null : m.get(date) || 0;
      if (value > max) max = value;
      days.push({ date, value });
    }
    cols.push({ start, days });
  }
  return { cols, max };
}

export function byWeekday(list) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const t of list) {
    const d = (new Date(`${t.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    totals[d] += t.amount; counts[d]++;
  }
  return names.map((name, i) => ({ name, total: r2(totals[i]), count: counts[i] }));
}

export function monthlyTotals(list, months) {
  return months.map((m) => ({ month: m, label: monthLabel(m), total: sum(list.filter((t) => monthOf(t.date) === m)) }));
}

// This month so far vs the same days last month, and vs the same month last year.
export function comparisons(list, today) {
  const thisM = monthOf(today);
  const day = +today.slice(8, 10);
  const lastM = monthOf(addDays(`${thisM}-01`, -1));
  const lastY = `${+thisM.slice(0, 4) - 1}${thisM.slice(4)}`;
  const upTo = (m) => sum(list.filter((t) => monthOf(t.date) === m && +t.date.slice(8, 10) <= day));
  const whole = (m) => sum(list.filter((t) => monthOf(t.date) === m));
  const now = upTo(thisM);
  const prev = upTo(lastM);
  const year = upTo(lastY);
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  return { now, prev, year, prevWhole: whole(lastM), vsPrevPct: pct(now, prev), vsYearPct: pct(now, year), thisMonth: thisM, lastMonth: lastM };
}

// Which categories moved most between two months (last full month vs the one before).
export function categoryChanges(list, a, b) {
  const sumBy = (m) => { const o = {}; for (const t of list.filter((x) => monthOf(x.date) === m)) o[catOf(t)] = (o[catOf(t)] || 0) + t.amount; return o; };
  const A = sumBy(a);
  const B = sumBy(b);
  const names = new Set([...Object.keys(A), ...Object.keys(B)]);
  return [...names].map((name) => ({ name, now: r2(A[name] || 0), before: r2(B[name] || 0), change: r2((A[name] || 0) - (B[name] || 0)) })).sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
}

export function spikes(list, today, days = 365) {
  const m = dailyTotals(list.filter((t) => t.date >= addDays(today, -days)));
  const vals = [...m.values()];
  if (vals.length < 10) return [];
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  return [...m.entries()].filter(([, v]) => v > mean + 2 * sd && v >= 50).map(([date, total]) => ({ date, total, usual: r2(mean) })).sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- behaviour
const HABIT_GROUPS = [
  { id: 'takeaway', name: 'Takeaways & eating out', details: ['Takeaway & eating out', 'Bakery'] },
  { id: 'snacks', name: 'Snacks & energy drinks', details: ['Snacks & drinks', 'Energy drink'] },
  { id: 'pubs', name: 'Pubs & bars', details: ['Pubs & bars'] },
  { id: 'shopping', name: 'Shopping', details: ['Shopping', 'Home Bargains', 'Clothing & shoes'] },
];

export function habits(list, months) {
  const n = Math.max(1, months.length);
  const out = HABIT_GROUPS.map((g) => {
    const tx = list.filter((t) => g.details.includes(t.detail));
    const total = sum(tx);
    return { id: g.id, name: g.name, total, count: tx.length, perMonth: r2(total / n), perYear: r2((total / n) * 12), avg: tx.length ? r2(total / tx.length) : 0, txs: tx };
  });
  const small = list.filter((t) => t.amount < 5);
  out.push({ id: 'small', name: 'Purchases under £5', total: sum(small), count: small.length, perMonth: r2(sum(small) / n), perYear: r2((sum(small) / n) * 12), avg: small.length ? r2(sum(small) / small.length) : 0, txs: small });
  return out;
}

export function frequentShops(list, top = 10) {
  return breakdown(list, shopKey, (k, t) => t.desc).sort((a, b) => b.count - a.count).slice(0, top);
}

// Possibly unnecessary: big for its category, one-off shopping or entertainment, or a small treat that repeats a lot.
export function unusual(list) {
  const byCat = new Map();
  for (const t of list) { const k = catOf(t); if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(t.amount); }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const meds = new Map([...byCat].map(([k, v]) => [k, med(v)]));
  return list.filter((t) => t.amount >= 50 && t.amount > (meds.get(catOf(t)) || 0) * 4).sort((a, b) => b.amount - a.amount).slice(0, 12);
}

export function impulse(list) {
  const kinds = ['Shopping', 'Entertainment', 'Takeaway & eating out', 'Clothing & shoes'];
  return list.filter((t) => kinds.includes(t.detail) && t.amount < 30);
}

// Habits worth easing off, ranked, each with what it would free up. `goal` (optional) adds the effect on a goal.
export function easeOff(habitList, goal, today, goalForecast) {
  return habitList.filter((h) => h.perMonth >= 5 && h.id !== 'small').sort((a, b) => b.perMonth - a.perMonth).slice(0, 4).map((h) => {
    const cut = r2(h.perMonth * 0.25);
    let effect = `£${Math.round(cut * 12).toLocaleString('en-GB')} a year`;
    if (goal && goalForecast) {
      const a = goalForecast(goal, today);
      const b = goalForecast({ ...goal, monthly: (Number(goal.monthly) || 0) + cut }, today);
      if (a.months && b.months && a.months > b.months) effect += `, and ${goal.name} would be reached ${a.months - b.months} month${a.months - b.months === 1 ? '' : 's'} sooner`;
    }
    return { name: h.name, perMonth: h.perMonth, cut, effect };
  });
}

export const monthsIn = (list, from, to) => monthRange(from || monthOf(list[0]?.date || '2000-01-01'), to || monthOf(list[list.length - 1]?.date || '2000-01-01'));
export { dayDiff };
