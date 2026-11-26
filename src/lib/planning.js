// Planning maths for Budgets, the Payday plan / Money day, Goals and Wealth. Pure, in whole pence, so it's tested.
import { dayDiff, addDays } from './dates.js';
import { netWorth } from './analytics.js';
import { normKey } from './text.js';

// ---------------------------------------------------------------- budget overview
// One row per budgeted bucket: what you allocated, what rolled over, what you've spent, what's left, where the
// even-spending line says you'd be today (pace), and where you'll end up at this rate (projected).
// A budget lower than last cycle's is treated as a deliberate cut, not a mistake: it's labelled, and only the
// pace and projection can raise a warning about it.
// eff: { bucket: { budget, carried, total } }; spent: { bucket: pence }; prevBudgets: { bucket: pence };
// cycle: { dayNumber, totalDays }; finished: the cycle is over.
// Last cycle's running total lined up with this cycle, which may be a different length: day d of this cycle is
// compared with the same share of the way through last cycle, and both end on payday. prevCum: cumulative pence
// per day of last cycle; days: this cycle's length. Returns one value per day of this cycle.
export function alignToCycle(prevCum, days) {
  if (!prevCum?.length || !days) return [];
  return Array.from({ length: days }, (_, i) => prevCum[Math.max(1, Math.min(prevCum.length, Math.round(((i + 1) * prevCum.length) / days))) - 1]);
}

// Projections need a few days to go on: before day 4 of a cycle there's no projection or pace warning.
export const MIN_DAYS_TO_PROJECT = 4;
export function budgetOverview({ eff, spent, prevBudgets = {}, cycle, finished = false }) {
  const day = finished ? cycle.totalDays : cycle.dayNumber;
  return Object.entries(eff).map(([bucket, e]) => {
    const actual = spent[bucket] || 0;
    const expected = Math.round((e.total * day) / cycle.totalDays);
    const projected = finished ? actual : day >= MIN_DAYS_TO_PROJECT ? Math.round((actual / day) * cycle.totalDays) : null;
    const prev = prevBudgets[bucket];
    const reduced = Number.isInteger(prev) && e.budget < prev ? { from: prev, to: e.budget } : null;
    const warnings = [];
    if (actual > e.total) warnings.push({ level: 'over', text: `Over by ${Math.round((actual - e.total) / 100)}` });
    else if (!finished && projected !== null && projected > e.total && actual > expected) warnings.push({ level: 'pace', text: 'On course to go over' });
    return { bucket, allocated: e.budget, carried: e.carried, total: e.total, actual, remaining: e.total - actual, expected, projected, ahead: actual - expected, reduced, warnings };
  });
}

// ---------------------------------------------------------------- payday plan lines: planned, completed, verified
// Each line of the plan (a transfer, investment, saving or one-off payment) is:
//   planned    - it's in the plan
//   completed  - a matching payment is in your imported bank lines this cycle (same kind, same amount within £1,
//                money going out), each bank line used once
//   verified   - you confirmed it on Money day after checking the account it went to
// "Left in Ulster" lines don't move, so they're never matched.
const KIND_MATCH = { transfer: ['transfer'], invested: ['invested', 'transfer'], saved: ['saved', 'transfer'], paid: ['spend'] };
export function matchPlanLines(items, txs, cycle, today) {
  const end = cycle.end < today ? cycle.end : today;
  const pool = txs.filter((t) => t.amount_pence < 0 && t.status !== 'needs_review' && t.date >= cycle.start && t.date <= end);
  const used = new Set();
  const words = (s) => normKey(s).split(' ').filter((w) => w.length >= 3);
  return items.map((it) => {
    if (it.kind === 'kept' || !it.amount_pence) return { ...it, state: it.kind === 'kept' ? 'stays' : 'planned', tx: null };
    const ok = (KIND_MATCH[it.kind] || []);
    const cands = pool.filter((t) => !used.has(t.id) && ok.includes(t.kind) && Math.abs(-t.amount_pence - it.amount_pence) <= 100);
    const named = cands.find((t) => words(it.name).some((w) => normKey(t.raw_description).includes(w)));
    const tx = named || cands.sort((a, b) => Math.abs(-a.amount_pence - it.amount_pence) - Math.abs(-b.amount_pence - it.amount_pence) || a.date.localeCompare(b.date))[0] || null;
    if (tx) used.add(tx.id);
    return { ...it, tx, state: it.verified ? 'verified' : tx ? 'completed' : 'planned' };
  });
}

// ---------------------------------------------------------------- goals
// history: [{ date, pence }] oldest first (balances of the linked account or pot). perPayday: what each payday
// must put in to hit the date (one payday a month). expected: when you'll get there at the planned amount, or at
// your recent pace if no amount is planned.
export function goalProgress({ target, saved, date = null, monthly = 0, history = [], today }) {
  const pct = target > 0 ? Math.min(100, Math.floor((saved / target) * 100)) : 0;
  const left = Math.max(0, target - saved);
  const months = date ? Math.max(1, (+date.slice(0, 4) - +today.slice(0, 4)) * 12 + (+date.slice(5, 7) - +today.slice(5, 7))) : null;
  const perPayday = date ? (left ? Math.ceil(left / months) : 0) : null;
  // Recent pace from the history: change per month between the first and last points (at least 28 days apart).
  let pace = null;
  if (history.length >= 2) {
    const a = history[0]; const b = history[history.length - 1];
    const days = dayDiff(a.date, b.date);
    if (days >= 28) pace = Math.round(((b.pence - a.pence) / days) * 30.44);
  }
  const rate = monthly > 0 ? monthly : pace && pace > 0 ? pace : 0;
  const monthsToGo = left === 0 ? 0 : rate > 0 ? Math.ceil(left / rate) : null;
  const expected = monthsToGo === null ? null : addMonths(today, monthsToGo);
  const status = left === 0 ? 'reached' : !date ? (rate ? 'no deadline' : 'needs a plan') : expected && expected <= date ? 'on track' : 'behind';
  return { pct, left, perPayday, pace, rate, rateSource: monthly > 0 ? 'planned' : pace && pace > 0 ? 'recent pace' : null, expected, status };
}
function addMonths(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }

// ---------------------------------------------------------------- wealth
// At each date a balance was typed in: net worth, and how it splits. Each account carries its last balance
// forward. Only accounts are added up: sinking funds are pots inside an account (e.g. Monzo), and transfers
// only move money between accounts, so neither is counted twice.
const GROUP = (type) => (type === 'credit_card' ? 'debt' : type === 'pension' ? 'pension' : type === 'isa' || type === 'investment' ? 'investments' : 'cash');
export function wealthSeries(accounts, snapshots) {
  const dates = [...new Set(snapshots.map((s) => s.date))].sort();
  return dates.map((d) => {
    const nw = netWorth(accounts, snapshots.filter((s) => s.date <= d), d);
    const g = { cash: 0, investments: 0, pension: 0, debt: 0 };
    for (const r of nw.rows) if (r.value !== null) g[GROUP(r.type)] += r.value;
    return { date: d, total: nw.total, ...g, assets: g.cash + g.investments + g.pension, liabilities: -g.debt };
  });
}

// Investments: what you put in against what they've gained. From the first time you typed in your ISA and
// investment balances: gain = value now − value then − money put in since (net of withdrawals).
// Pensions aren't included (contributions come from payroll and aren't in your bank lines).
export function investmentReturn(accounts, snapshots, txs) {
  const inv = new Set(accounts.filter((a) => ['isa', 'investment'].includes(a.type) && a.is_active !== false).map((a) => a.id));
  const snaps = snapshots.filter((s) => inv.has(s.account_id)).sort((a, b) => a.date.localeCompare(b.date));
  const contributedAll = txs.filter((t) => t.kind === 'invested' && t.status !== 'needs_review').reduce((a, t) => a - t.amount_pence, 0);
  if (!snaps.length) return { known: false, contributedAll };
  const firstDate = snaps[0].date;
  const startAccounts = [...inv].filter((id) => snaps.some((s) => s.account_id === id && s.date === firstDate));
  if (startAccounts.length < inv.size) return { known: false, contributedAll, reason: 'Type in every ISA and investment balance on the same day to start tracking gains.' };
  const at = (d) => [...inv].reduce((a, id) => { const s = snaps.filter((x) => x.account_id === id && x.date <= d).pop(); return a + (s ? s.balance_pence : 0); }, 0);
  const lastDate = snaps[snaps.length - 1].date;
  const start = at(firstDate); const now = at(lastDate);
  const contributed = txs.filter((t) => t.kind === 'invested' && t.status !== 'needs_review' && t.date > firstDate && t.date <= lastDate).reduce((a, t) => a - t.amount_pence, 0);
  return { known: true, from: firstDate, to: lastDate, start, now, contributed, gain: now - start - contributed, contributedAll };
}

// Days since a balance was typed in, as words.
export function ago(date, today) {
  const d = dayDiff(date, today);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 31 ? `${d} days ago` : `${Math.round(d / 30.44)} month${Math.round(d / 30.44) === 1 ? '' : 's'} ago`;
}
export { addDays };
