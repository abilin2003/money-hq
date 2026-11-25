// One cycle's numbers, worked out once so Overview, Budgets and the Payday plan always agree.
import { cycleFor, cycleName } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { summarise } from '../lib/summary.js';
import { billsInCycle, safeToSpend, effectiveBudgets } from '../lib/budget.js';
import { inCycle } from '../ui/parts.js';
import { historyRows } from './history.js';

export const paydaysOf = (ctx) => ctx.ref.settings?.paydays || [];
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

export function cycleState(ctx, c) {
  const txs = ctx.transactions.filter((t) => inCycle(t, c));
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
