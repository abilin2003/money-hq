// Numbers behind the charts, insights, IOUs, goals and net worth. Pure functions in whole pence.
import { addDays, dayDiff, isIsoDate } from './dates.js';
import { normKey } from './text.js';
import { summarise, ranked } from './summary.js';

const inRange = (t, c) => { const d = t.cycle_date || t.date; return d >= c.start && d <= c.end; };

// Per-cycle summaries, oldest first, for the cycles given. splits: { txId: pence others owe }.
export function perCycle(rows, cycles, splits = {}, settled = new Set()) {
  return cycles.map((c) => ({ cycle: c, s: summarise(rows.filter((t) => inRange(t, c)), splits, settled) }));
}

// Daily spending in a cycle: [{ date, pence }] for every day, and the running total up to `uptoDay` (1-based).
// onlyBuckets: count just these buckets (the pace chart compares budgeted buckets with their budget line).
export function dailySpend(txs, cycle, splits = {}, settled = new Set(), onlyBuckets = null) {
  const days = [];
  for (let d = cycle.start; d <= cycle.end; d = addDays(d, 1)) days.push({ date: d, pence: 0 });
  const idx = Object.fromEntries(days.map((d, i) => [d.date, i]));
  for (const t of txs) {
    if (t.status === 'needs_review' || t.from_savings) continue;
    if (onlyBuckets && !onlyBuckets.has(t.bucket)) continue;
    if (t.kind === 'repayment' && !settled.has(t.id)) { const j = idx[t.cycle_date || t.date]; if (j !== undefined) days[j].pence -= t.amount_pence; continue; }
    if (!['spend', 'refund'].includes(t.kind)) continue;
    const i = idx[t.cycle_date || t.date];
    if (i === undefined) continue;
    const cost = t.kind === 'spend' ? -t.amount_pence - (splits[t.id] || 0) : -t.amount_pence;
    days[i].pence += cost;
  }
  return days;
}
export const cumulative = (days, upto) => { let a = 0; return days.slice(0, upto).map((d) => (a += d.pence)); };

// Categories ranked, with the change since the previous period (spec: "one ranked bar list with change").
export function categoryChanges(now, before) {
  const names = new Set([...Object.keys(now.byCategory), ...Object.keys(before.byCategory)]);
  return [...names].map((name) => ({ name, now: now.byCategory[name] || 0, before: before.byCategory[name] || 0, change: (now.byCategory[name] || 0) - (before.byCategory[name] || 0) }))
    .filter((c) => c.now > 0 || c.before > 0).sort((a, b) => b.now - a.now || b.before - a.before);
}

// Bridge steps from one period's total to another's, one per bucket (biggest moves first).
export function bridgeSteps(before, now) {
  const names = new Set([...Object.keys(before.byBucket), ...Object.keys(now.byBucket)]);
  return [...names].map((name) => ({ name, delta: (now.byBucket[name] || 0) - (before.byBucket[name] || 0) }))
    .filter((s) => s.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ---------------------------------------------------------------- splits and IOUs (spec Phase 3)

// Others' shares per transaction: { txId: pence owed to you }.
export function splitTotals(splits) {
  const out = {};
  for (const s of splits) out[s.transaction_id] = (out[s.transaction_id] || 0) + s.amount_pence;
  return out;
}

// Equal split of a payment between you and others: returns each other person's share (you keep the rounding).
export function equalShares(totalPence, people) {
  const n = people + 1;
  const each = Math.floor(Math.abs(totalPence) / n);
  return Array.from({ length: people }, () => each);
}

// Balance per person: open IOUs (not yet settled), oldest first.
export function peopleBalances(splits, people, txById) {
  return people.map((p) => {
    const open = splits.filter((s) => s.person_id === p.id && !s.settled_by_transaction_id);
    const oldest = open.map((s) => txById[s.transaction_id]?.date).filter(Boolean).sort()[0] || null;
    return { ...p, owed: open.reduce((a, s) => a + s.amount_pence, 0), open, oldest };
  }).filter((p) => p.owed > 0 || p.open.length).sort((a, b) => (a.oldest || '9').localeCompare(b.oldest || '9'));
}

// Money in that might clear an IOU: the person's name in the description, amount within £1, last 60 days.
export function suggestIouMatches(tx, openSplits, people, txById) {
  if (tx.amount_pence <= 0) return [];
  const text = ` ${normKey(tx.raw_description)} `;
  return openSplits.filter((s) => {
    const p = people.find((x) => x.id === s.person_id);
    const first = p ? normKey(p.name).split(' ')[0] : '';
    const t = txById[s.transaction_id];
    return p && first && text.includes(` ${first} `) && Math.abs(s.amount_pence - tx.amount_pence) <= 100 && t && Math.abs(dayDiff(t.date, tx.date)) <= 60;
  });
}

// ---------------------------------------------------------------- goals (spec Phase 6, with the old what-if)

// Months to reach a goal at a monthly amount, with yearly growth (an assumption you choose) and a lump sum.
export function projectGoal({ target, saved, monthly, growthPct = 0, lump = 0 }, today) {
  let bal = saved + lump;
  const r = growthPct / 100 / 12;
  const series = [bal];
  let months = 0;
  while (bal < target && months < 600) {
    if (monthly <= 0 && r <= 0) return { months: null, date: null, series };
    bal = Math.round(bal * (1 + r)) + monthly; // whole pence each month, even with growth
    months += 1;
    if (months <= 120) series.push(Math.round(bal));
  }
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return { months, date: d.toISOString().slice(0, 10), series };
}

// Monthly amount needed to hit a target by a date (no growth).
export function neededMonthly(target, saved, today, date) {
  if (!date || !isIsoDate(date)) return null;
  const months = Math.max(1, (+date.slice(0, 4) - +today.slice(0, 4)) * 12 + (+date.slice(5, 7) - +today.slice(5, 7)));
  return Math.max(0, Math.ceil((target - saved) / months));
}

// ---------------------------------------------------------------- net worth (spec Phase 6)

const DEBT = new Set(['credit_card']);
// Latest balance per account (credit card owed counts against you), stale after 35 days.
export function netWorth(accounts, snapshots, today) {
  const rows = accounts.filter((a) => a.is_active !== false).map((a) => {
    const snaps = snapshots.filter((s) => s.account_id === a.id).sort((x, y) => x.date.localeCompare(y.date));
    const last = snaps[snaps.length - 1] || null;
    const value = last ? (DEBT.has(a.type) ? -Math.abs(last.balance_pence) : last.balance_pence) : null;
    return { ...a, last, value, stale: !last || dayDiff(last.date, today) > 35 };
  });
  const total = rows.reduce((a, r) => a + (r.value || 0), 0);
  const groups = {};
  for (const r of rows) { if (r.value === null) continue; const g = DEBT.has(r.type) ? 'Debt' : r.type === 'pension' ? 'Pension' : r.type === 'isa' || r.type === 'investment' ? 'ISAs and investments' : 'Cash and savings'; groups[g] = (groups[g] || 0) + r.value; }
  return { rows, total, groups, known: rows.filter((r) => r.value !== null).length };
}

// Net worth at each snapshot date (each account carries its last known balance forward).
export function netWorthSeries(accounts, snapshots) {
  const dates = [...new Set(snapshots.map((s) => s.date))].sort();
  return dates.map((d) => ({ date: d, total: netWorth(accounts, snapshots.filter((s) => s.date <= d), d).total }));
}

export { ranked };
