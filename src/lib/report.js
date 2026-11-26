// The end-of-cycle financial review. Pure: given a cycle's transactions (and the cycle before, budgets, insights,
// goals and balances) it works out every figure and sentence in the report, so it can be tested and saved.
// The saved report holds totals and short lists only (no transactions), so it stays small and is a fixed record
// of the cycle as it looked when you closed it.
//
// The narrative follows the same rules as insights: every sentence is built from a figure in the report, nothing
// is guessed, and suggestions are things you can measure next cycle ("keep Eating out under £100"), never advice.
import { spendLines, total, fromPay, group, applyFilter, compare, frequency, shopName, weekdayOf, byDay } from './explore.js';
import { decompose, CONVENIENCE } from './insights.js';
import { summarise } from './summary.js';

export const REPORT_VERSION = 1;
const gbp = (p) => `£${Math.round(Math.abs(p) / 100).toLocaleString('en-GB')}`;
const round5 = (p) => Math.max(500, Math.round(p / 500) * 500);
const pays = (ls) => ls.filter((l) => l.kind === 'spend' && l.cost > 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

// Count and total of a cycle's lines: if this changes after closing (say a late import), the report may need
// refreshing.
export const fingerprint = (txs) => ({ count: txs.length, sum: txs.reduce((a, t) => a + t.amount_pence, 0) });
export const needsRefresh = (saved, txs) => Boolean(saved) && (saved.count !== txs.length || saved.sum !== txs.reduce((a, t) => a + t.amount_pence, 0));

// Did last cycle's chosen improvements happen? metric: { type: 'category'|'bucket'|'small'|'weekend', key, limit, target }
export function measure(metric, lines) {
  if (!metric) return null;
  if (metric.type === 'category') return total(applyFilter(lines, { category: metric.key }));
  if (metric.type === 'bucket') return total(applyFilter(fromPay(lines), { bucket: metric.key }));
  if (metric.type === 'small') return applyFilter(lines, { small: metric.limit }).length;
  if (metric.type === 'weekend') return total(applyFilter(lines, { weekend: true }));
  return null;
}
const fmtMetric = (m, v) => (m.type === 'small' ? `${v} payment${v === 1 ? '' : 's'}` : gbp(v));

// Budget suggestions for next cycle from up to three cycles of spending (this one first). Only where the numbers
// say so: over budget in 2+ of them and the average clearly above it, or well under in all of them.
export function suggestBudgets(budgets, history) {
  const out = [];
  for (const [bucket, budget] of Object.entries(budgets)) {
    if (!budget) continue;
    const spent = history.map((hh) => hh[bucket] || 0);
    const avg = Math.round(spent.reduce((a, v) => a + v, 0) / spent.length);
    const over = spent.filter((v) => v > budget).length;
    if (spent.length >= 2 && over >= 2 && avg > budget * 1.15) out.push({ bucket, from: budget, to: round5(avg), reason: `Over budget in ${over} of the last ${spent.length} cycles; you spent ${gbp(avg)} on average.` });
    else if (spent.length >= 2 && spent.every((v) => v < budget * 0.6)) out.push({ bucket, from: budget, to: round5(Math.max(avg * 1.15, avg + 1000)), reason: `Under 60% used in each of the last ${spent.length} cycles (${spent.map(gbp).join(', ')}).` });
  }
  return out;
}

// input: { cycle: { start, end, name, totalDays }, txs, prev: { txs, name } | null, usual: [lines of up to 3 earlier
//   cycles], splits, settled, eff: { bucket: { budget, carried, total } }, budgetHistory: [{ bucket: spent }] (this
//   cycle first), fctx, insights, goals: [{ name, saved, target, pct, status }], netWorth: { from, to, start, end }
//   | null, plan: { lines } | null, previousImprovements: [{ text, metric }], smallLimit }
export function buildReport(input) {
  const { cycle, txs, prev = null, usual = [], splits = {}, settled = new Set(), eff = {}, budgetHistory = [], fctx = {}, insights = [], goals = [], netWorth = null, plan = null, previousImprovements = [], smallLimit = 1000 } = input;
  const s = summarise(txs, splits, settled);
  const lines = spendLines(txs, splits, settled);
  const ps = prev ? summarise(prev.txs, splits, settled) : null;
  const plines = prev ? spendLines(prev.txs, splits, settled) : [];
  const all = total(lines);
  const putAway = s.saved + s.invested;
  const rate = pct(putAway, s.income);
  const prevRate = ps ? pct(ps.saved + ps.invested, ps.income) : null;

  // ---- 1. summary
  const budgetTotal = Object.values(eff).reduce((a, e) => a + e.total, 0);
  const budgetSpent = Object.keys(eff).reduce((a, b) => a + (s.byBucket[b] || 0), 0);
  const summary = { income: s.income, spent: all, fromPay: s.netSpent, fromSavings: s.fromSavings, saved: s.saved, invested: s.invested,
    net: s.income - all - putAway, savingsRate: rate, budget: { total: budgetTotal, spent: budgetSpent },
    prev: ps ? { name: prev.name, income: ps.income, spent: ps.totalSpent, saved: ps.saved, invested: ps.invested, savingsRate: prevRate } : null };

  // ---- 2. spending breakdown
  const buckets = group(lines, (l) => l.bucket).map((g) => ({ key: g.key, pence: g.pence, count: g.count, cats: group(g.lines, (l) => l.category).map((c) => ({ key: c.key, pence: c.pence, count: c.count })) }));
  const shops = group(lines.filter((l) => l.kind !== 'payback'), (l) => l.merchant).filter((g) => g.pence > 0).slice(0, 10).map((g) => ({ key: g.key, name: shopName(g.lines), pence: g.pence, count: g.count }));
  const biggest = [...pays(lines)].sort((a, b) => b.cost - a.cost).slice(0, 8).map((l) => ({ id: l.id, date: l.date, name: l.t.raw_description, pence: l.cost, category: l.category, fromSavings: l.fromSavings }));
  const fq = frequency(lines, cycle.start, cycle.end);
  const spending = { buckets, shops, biggest, payments: fq.payments, average: fq.average, median: fq.median, noSpendDays: fq.noSpendDays, days: fq.days,
    essential: { yes: total(applyFilter(lines, { essential: true }, fctx)), no: total(applyFilter(lines, { essential: false }, fctx)), buckets: [...(fctx.essential || [])] },
    recurring: { yes: total(applyFilter(lines, { recurring: true }, fctx)), no: total(applyFilter(lines, { recurring: false }, fctx)) } };

  // ---- 3. budget performance, with the reasons behind any big overspend
  const rows = Object.entries(eff).map(([bucket, e]) => ({ bucket, budget: e.budget, carried: e.carried, total: e.total, actual: s.byBucket[bucket] || 0, diff: (s.byBucket[bucket] || 0) - e.total }));
  const reasons = {};
  for (const r of rows.filter((x) => x.diff > 0)) {
    const inB = fromPay(applyFilter(lines, { bucket: r.bucket }));
    const cats = group(inB, (l) => l.category).slice(0, 2);
    const big = [...pays(inB)].sort((a, b) => b.cost - a.cost)[0];
    reasons[r.bucket] = [
      ...cats.map((c) => `${c.key}: ${gbp(c.pence)} in ${c.count} payment${c.count === 1 ? '' : 's'}${prev ? ` (the ${prev.name} cycle: ${gbp(total(fromPay(applyFilter(plines, { bucket: r.bucket, category: c.key }))))})` : ''}`),
      ...(big && big.cost >= r.diff * 0.5 ? [`One payment, ${big.t.raw_description} on ${big.date.slice(8, 10)}/${big.date.slice(5, 7)}, was ${gbp(big.cost)}.`] : []),
    ];
  }
  // The day budgeted spending passed the budget total, if it did.
  const budgeted = fromPay(lines).filter((l) => eff[l.bucket]);
  const days = byDay(budgeted, cycle.start, cycle.end);
  let run = 0; let crossedOn = null; const cumulative = [];
  for (const d of days) { run += d.pence; cumulative.push(run); if (!crossedOn && budgetTotal && run > budgetTotal) crossedOn = d.key; }
  const budget = { rows, reasons, crossedOn, cumulative, unused: rows.filter((r) => r.diff < 0).reduce((a, r) => a - r.diff, 0),
    over: rows.filter((r) => r.diff > 0).map((r) => r.bucket), under: rows.filter((r) => r.diff <= 0).map((r) => r.bucket) };

  // ---- 4. habits
  const small = applyFilter(lines, { small: smallLimit });
  const freqShops = group(pays(lines), (l) => l.merchant).filter((g) => g.count >= 3).sort((a, b) => b.count - a.count).slice(0, 5).map((g) => ({ key: g.key, name: shopName(g.lines), count: g.count, pence: g.pence }));
  const conv = (ls) => total(ls.filter((l) => CONVENIENCE.test(l.category)));
  const topDays = byDay(lines, cycle.start, cycle.end).filter((d) => d.pence > 0).sort((a, b) => b.pence - a.pence).slice(0, 5).map((d) => ({ date: d.key, weekday: weekdayOf(d.key), pence: d.pence, count: d.count, top: shopName(d.lines.filter((l) => l.kind === 'spend').sort((a, b) => b.cost - a.cost).slice(0, 1)) }));
  const spendOnly = (ls) => ls.filter((l) => l.kind !== 'payback'); // money paid back to you isn't a habit
  const changes = prev ? compare(spendOnly(plines), spendOnly(lines), (l) => l.category).filter((r) => Math.abs(r.diff) >= 1000).slice(0, 8).map((r) => {
    const d = decompose(r.linesB, [{ lines: r.linesA, scale: 1 }]);
    return { key: r.key, a: r.a, b: r.b, diff: r.diff, countA: pays(r.linesA).length, countB: pays(r.linesB).length, freq: d.freq, size: d.size };
  }) : [];
  const habits = { small: { limit: smallLimit, count: small.length, pence: total(small), share: pct(total(small), all) },
    frequent: freqShops, convenience: { now: conv(lines), prev: prev ? conv(plines) : null }, topDays,
    unusual: insights.filter((i) => i.id.startsWith('unusual-')).map((i) => ({ title: i.title, body: i.body })), changes };

  // ---- 5. savings and wealth
  const planSaved = plan ? plan.lines.filter((l) => l.kind === 'saved') : [];
  const wealth = { saved: s.saved, invested: s.invested, goals, netWorth,
    funds: planSaved.map((l) => ({ name: l.name, pence: l.amount_pence, state: l.state })) };

  // ---- 6. narrative, built only from the figures above
  const wentWell = []; const better = []; const drivers = []; const changed = []; const suggestions = [];
  if (ps && ps.totalSpent > 0 && all < ps.totalSpent * 0.95) wentWell.push(`You spent ${gbp(ps.totalSpent - all)} less than the ${prev.name} cycle (${gbp(all)} against ${gbp(ps.totalSpent)}).`);
  const under = rows.filter((r) => r.diff <= 0 && r.total > 0);
  if (under.length) wentWell.push(`${under.length} of ${rows.length} budgeted bucket${rows.length === 1 ? '' : 's'} finished within budget: ${under.map((r) => `${r.bucket} (${gbp(-r.diff)} left)`).join(', ')}.`);
  if (rate !== null && rate > 0 && (prevRate === null || rate >= prevRate)) wentWell.push(`You put away ${rate}% of your income: ${gbp(putAway)} saved and invested${prevRate !== null ? `, against ${prevRate}% the cycle before` : ''}.`);
  if (fq.noSpendDays >= 3) wentWell.push(`${fq.noSpendDays} days with no spending at all.`);
  for (const i of insights.filter((x) => x.level === 'good' && !x.id.startsWith('opportunity')).slice(0, 2)) wentWell.push(`${i.title}. ${i.body}`);

  for (const r of rows.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff)) {
    const top = group(fromPay(applyFilter(lines, { bucket: r.bucket })), (l) => l.category)[0];
    better.push(`${r.bucket} went ${gbp(r.diff)} over its ${gbp(r.total)} budget${top ? `; the biggest part was ${top.key} (${gbp(top.pence)}, ${top.count} payment${top.count === 1 ? '' : 's'})` : ''}.`);
  }
  if (ps && ps.totalSpent > 0 && all > ps.totalSpent * 1.1) better.push(`You spent ${gbp(all - ps.totalSpent)} more than the ${prev.name} cycle (${gbp(all)} against ${gbp(ps.totalSpent)}).`);
  for (const i of insights.filter((x) => ['watch', 'act'].includes(x.level) && !x.id.startsWith('budget-') && !x.id.startsWith('unusual-')).slice(0, 3)) better.push(`${i.title}. ${i.body}`);
  if (crossedOn) better.push(`Budgeted spending passed the ${gbp(budgetTotal)} total on ${crossedOn.slice(8, 10)}/${crossedOn.slice(5, 7)}, ${cycle.totalDays - (days.findIndex((d) => d.key === crossedOn) + 1)} days before payday.`);

  for (const c of group(spendOnly(lines), (l) => l.category).filter((g) => g.pence > 0).slice(0, 3)) {
    drivers.push(`${c.key}: ${gbp(c.pence)} (${pct(c.pence, all)}% of spending) in ${c.count} payment${c.count === 1 ? '' : 's'}, ${gbp(c.pence / Math.max(1, c.count))} each on average.`);
  }
  if (small.length >= 8) drivers.push(`Small payments under ${gbp(smallLimit)}: ${small.length} of them came to ${gbp(total(small))} (${pct(total(small), all)}% of spending).`);
  for (const c of changes.slice(0, 4)) {
    const parts = [];
    if (c.countA !== c.countB) parts.push(`${Math.abs(c.countB - c.countA)} ${c.countB > c.countA ? 'more' : 'fewer'} payment${Math.abs(c.countB - c.countA) === 1 ? '' : 's'}`);
    if (Math.abs(c.size) >= 500) parts.push(`${c.size > 0 ? 'bigger' : 'smaller'} payments (${c.size > 0 ? '+' : '−'}${gbp(c.size)})`);
    changed.push(`${c.key}: ${gbp(c.a)} → ${gbp(c.b)} (${c.diff > 0 ? '+' : '−'}${gbp(c.diff)})${parts.length ? `, from ${parts.join(' and ')}` : ''}.`);
  }

  // Suggestions: measurable, from this cycle's numbers. You choose which to take on.
  const usualCat = (key) => (usual.length ? Math.round(usual.reduce((a, ls) => a + total(ls.filter((l) => l.category === key)), 0) / usual.length) : null);
  for (const r of rows.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 2)) {
    const top = group(fromPay(applyFilter(lines, { bucket: r.bucket })), (l) => l.category)[0];
    const u = top ? usualCat(top.key) : null;
    if (top && u !== null && u < top.pence) suggestions.push({ id: `cat-${top.key}`, text: `Keep ${top.key} under ${gbp(round5(u))} (it was ${gbp(top.pence)}; ${gbp(round5(u))} is your usual).`, metric: { type: 'category', key: top.key, target: round5(u) } });
    suggestions.push({ id: `bucket-${r.bucket}`, text: `Stay within the ${r.bucket} budget (${gbp(r.budget)}).`, metric: { type: 'bucket', key: r.bucket, target: r.budget } });
  }
  if (small.length >= 8) suggestions.push({ id: 'small', text: `Make fewer than ${Math.ceil(small.length * 0.75)} payments under ${gbp(smallLimit)} (this cycle: ${small.length}).`, metric: { type: 'small', limit: smallLimit, target: Math.ceil(small.length * 0.75) - 1 } });
  const we = insights.find((i) => i.id === 'weekends');
  if (we) suggestions.push({ id: 'weekend', text: `Keep weekend spending under ${gbp(round5(we.pence * 0.8))} (this cycle: ${gbp(we.pence)}).`, metric: { type: 'weekend', target: round5(we.pence * 0.8) } });

  // Last cycle's chosen improvements, measured against this cycle.
  const improvementsReview = previousImprovements.map((imp) => {
    const actual = measure(imp.metric, lines);
    return { text: imp.text, metric: imp.metric || null, actual, met: actual === null ? null : actual <= imp.metric.target, actualText: actual === null ? null : fmtMetric(imp.metric, actual) };
  });

  return { version: REPORT_VERSION, cycle: { start: cycle.start, end: cycle.end, name: cycle.name, totalDays: cycle.totalDays }, fingerprint: fingerprint(txs),
    summary, spending, budget, habits, wealth, narrative: { wentWell, better, drivers, changed, suggestions }, improvementsReview };
}
