// One cycle's numbers, worked out once so Overview, Budgets and the Payday plan always agree.
import { cycleFor, cycleName, detectPaydays } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { summarise } from '../lib/summary.js';
import { billsInCycle, safeToSpend, effectiveBudgets } from '../lib/budget.js';
import { inCycle } from '../ui/parts.js';
import { historyRows } from './history.js';
import { cashPosition, cardOwed, cardSpendIn, withCardAmounts, mirroredFund } from '../lib/position.js';

// The paydays you entered, plus real salary dates before the first one (cached until either changes).
export function paydaysOf(ctx) {
  const key = `${(ctx.ref.settings?.paydays || []).join()}|${ctx.all.length}`;
  if (ctx._paydaysKey !== key) { ctx._paydays = detectPaydays(ctx.all, ctx.ref.settings?.paydays || []); ctx._paydaysKey = key; }
  return ctx._paydays;
}
export const usualDay = (ctx) => ctx.ref.settings?.payday_usual_day || 24;
export const currentCycle = (ctx) => { const c = cycleFor(ctx.today, paydaysOf(ctx), usualDay(ctx)); return { ...c, name: cycleName(c) }; };
export const cycleRowOf = (ctx, c) => ctx.ref.cycles.find((x) => x.start_date === c.start);
const bucketName = (ctx, id) => ctx.ref.buckets.find((b) => b.id === id)?.name;

// { bucketName: pence } for exactly this cycle (empty if none set).
export function budgetsExact(ctx, c) {
  const row = cycleRowOf(ctx, c);
  if (!row) return {};
  return Object.fromEntries(ctx.ref.budgets.filter((b) => b.cycle_id === row.id).map((b) => [bucketName(ctx, b.bucket_id), b.amount_pence]));
}

// This cycle's budgets, or the most recent earlier cycle's if none are set yet (inherited: true).
export function budgetsFor(ctx, c) {
  const exact = budgetsExact(ctx, c);
  if (Object.keys(exact).length) return { budgets: exact, inherited: false };
  const earlier = [...ctx.ref.cycles].reverse().filter((x) => x.start_date < c.start);
  for (const row of earlier) {
    const list = ctx.ref.budgets.filter((b) => b.cycle_id === row.id);
    if (list.length) return { budgets: Object.fromEntries(list.map((b) => [bucketName(ctx, b.bucket_id), b.amount_pence])), inherited: true, from: row.start_date };
  }
  return { budgets: {}, inherited: false };
}

// rows: the lines to count. Live lines by default; Analytics passes your whole history so older cycles work too.
export function cycleState(ctx, c, rows = ctx.transactions) {
  const txs = rows.filter((t) => inCycle(t, c));
  const s = summarise(txs, ctx.splitMap, ctx.settled);
  const { budgets, inherited, from } = budgetsFor(ctx, c);
  const prev = cycleFor(addDays(c.start, -1), paydaysOf(ctx), usualDay(ctx));
  // Last cycle may be in the archived history (before the fresh start), so look there too.
  const prevS = summarise(historyRows(ctx.all).filter((t) => inCycle(t, prev)), ctx.splitMap, ctx.settled);
  const eff = effectiveBudgets(budgets, budgetsFor(ctx, prev).budgets, prevS.byBucket, ctx.ref.settings?.extra?.leftover || {});
  const effTotals = Object.fromEntries(Object.entries(eff).map(([b, e]) => [b, e.total]));
  const bills = billsInCycle(ctx.ref.bills || [], c, txs, ctx.today);
  const safe = safeToSpend({ cycle: c, today: ctx.today < c.start ? c.start : ctx.today, budgets: effTotals, spentByBucket: s.byBucket, bills, reserve: ctx.ref.settings?.reserve_pence || 0 });
  return { txs, s, budgets, eff, effTotals, inherited, inheritedFrom: from, prev, prevS, bills, safe };
}

// The figures Overview and Analytics both show for a cycle, worked out once so they can't disagree.
// finished: the cycle is over, so there is no cash check (that's about today) and the card estimate is at its end.
export function cycleFigures(ctx, c, st, finished) {
  const { s } = st;
  const budgetTotal = Object.values(st.effTotals).reduce((a, v) => a + v, 0);
  const spentBudgeted = Object.keys(st.effTotals).reduce((a, b) => a + (s.byBucket[b] || 0), 0);
  const prevBudgeted = budgetTotal ? Object.keys(st.effTotals).reduce((a, b) => a + (st.prevS.byBucket[b] || 0), 0) : st.prevS.netSpent;
  const billsDue = st.bills.filter((b) => !b.paid).reduce((a, b) => a + b.amount_pence, 0);
  const billsPaid = st.bills.filter((b) => b.paid).reduce((a, b) => a + b.amount_pence, 0);
  const reserve = ctx.ref.settings?.reserve_pence || 0;
  const cash = finished ? null : cashPosition({ accounts: ctx.ref.accounts, snapshots: ctx.ref.snapshots || [], txs: ctx.transactions, today: ctx.today, billsDue, reserve });
  const card = ctx.ref.accounts.find((a) => a.type === 'credit_card' && a.is_active !== false);
  const owed = card ? cardOwed(card, ctx.ref.snapshots || [], ctx.all, finished ? c.end : ctx.today) : null;
  const planItems = planItemsFor(ctx, c, ctx.ref.settings?.extra?.plans?.[c.start]?.items || []);
  const plannedOf = (kind) => planItems.filter((i) => i.kind === kind).reduce((a, i) => a + (i.amount_pence || 0), 0);
  return { budgetTotal, spentBudgeted, prevBudgeted, unbudgeted: s.netSpent - spentBudgeted, billsDue, billsPaid, cash, card, owed, plannedOf, today: finished ? c.totalDays : c.dayNumber };
}

// The card's spending in the cycle before this payday: what that payday's card repayment should be.
export function cardSpendBefore(ctx, c) {
  const card = ctx.ref.accounts.find((a) => a.type === 'credit_card' && a.is_active !== false);
  if (!card) return { card: null, spend: null };
  const prev = cycleFor(addDays(c.start, -1), paydaysOf(ctx), usualDay(ctx));
  return { card, spend: { ...cardSpendIn(card, historyRows(ctx.all), prev.start, prev.end), name: cycleName(prev) } };
}
// A plan's lines with the card repayment worked out from the card (see withCardAmounts).
export function planItemsFor(ctx, c, items) {
  const { card, spend } = cardSpendBefore(ctx, c);
  return withCardAmounts(items, card, spend);
}
// Sinking funds, with any fund that is really an account showing that account's balance.
export function fundsOf(ctx) {
  const mirrors = ctx.ref.settings?.extra?.fund_mirrors || {};
  return (ctx.ref.funds || []).map((f) => { const a = mirrors[f.id] && ctx.ref.accounts.find((x) => x.id === mirrors[f.id]); return a ? mirroredFund(f, a, ctx.ref.snapshots || []) : f; });
}
