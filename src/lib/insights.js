// Spending insights that explain behaviour, not just totals. Pure, so every rule is tested.
//
// Rules for every insight:
//   - Built only from your spending lines (lib/explore.js), with plain arithmetic: counts, totals, averages and
//     medians. Nothing is guessed, and nothing appears when there isn't enough data to say it.
//   - "Usual" means the average of up to three earlier periods of the same kind, scaled to the same number of days
//     (so a cycle still in progress is compared fairly).
//   - Each insight carries a filter, and `pence` is exactly what that filter's lines add up to, so "See the
//     payments" shows the lines behind the number. `how` says how it was worked out.
//   - Savings figures are only "what the numbers would be if…" (back to your usual, half as many small buys),
//     never advice.
import { total, applyFilter, group, weekdayOf, shopName } from './explore.js';
import { addDays } from './dates.js';

const gbp = (p) => `£${Math.round(Math.abs(p) / 100).toLocaleString('en-GB')}`;
const gbp2 = (p) => `£${(Math.abs(p) / 100).toFixed(2)}`;
const pays = (ls) => ls.filter((l) => l.kind === 'spend' && l.cost > 0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const WEIGHT = { act: 3, watch: 2, info: 1, good: 1 };
export const CONVENIENCE = /takeaway|eating out|snack|energy|coffee|convenience|work food|fast food|treats?\b/i;

// Splits a change in a group of payments into "more (or fewer) payments" and "bigger (or smaller) payments".
// now: lines this period; base: [{ lines, scale }] earlier periods. The two parts add up exactly to the change
// in payments: (n1 − n0) × a0 + n1 × (a1 − a0) = T1 − T0.
export function decompose(nowLines, base) {
  const p1 = pays(nowLines);
  const n1 = p1.length; const t1 = total(p1);
  const n0 = base.length ? base.reduce((a, b) => a + pays(b.lines).length * b.scale, 0) / base.length : 0;
  const t0 = base.length ? base.reduce((a, b) => a + total(pays(b.lines)) * b.scale, 0) / base.length : 0;
  const a0 = n0 ? t0 / n0 : 0; const a1 = n1 ? t1 / n1 : 0;
  const freq = Math.round((n1 - n0) * a0);
  return { n1, n0, a1, a0, t1, t0: Math.round(t0), freq, size: Math.round(t1 - t0) - freq };
}
export function explainSplit(d) {
  if (!d.n0) return '';
  const more = d.n1 - d.n0;
  const f = `${Math.abs(more) < 0.5 ? 'about the same number of payments' : `${Math.abs(Math.round(more))} ${more > 0 ? 'more' : 'fewer'} payment${Math.abs(Math.round(more)) === 1 ? '' : 's'} (${d.freq >= 0 ? '+' : '−'}${gbp(d.freq)})`}`;
  const s = Math.abs(d.a1 - d.a0) < 50 ? 'a similar average payment' : `an average payment ${d.a1 > d.a0 ? 'up' : 'down'} from ${gbp2(d.a0)} to ${gbp2(d.a1)} (${d.size >= 0 ? '+' : '−'}${gbp(d.size)})`;
  return `That’s ${f} and ${s}.`;
}

// input: { lines, days, base: [{ lines, days, label }] newest first, history (lines before the period),
//          budgets: [{ label, budget: {bucket: pence}, actual: {bucket: pence} }] newest first (pay cycles only),
//          fctx (recurring / essential), smallLimit, periodName }. from..to are the days counted so far.
export function buildInsights({ lines, from, to, days, base = [], history = [], budgets = [], fctx = {}, smallLimit = 1000, periodName = 'this period' }) {
  const out = [];
  if (!pays(lines).length) return out;
  const B = base.filter((b) => b.days > 0).map((b) => ({ ...b, scale: days / b.days }));
  const usual = (fn) => (B.length ? Math.round(B.reduce((a, b) => a + fn(b.lines) * b.scale, 0) / B.length) : null);
  const usualCount = (fn) => (B.length ? B.reduce((a, b) => a + pays(fn(b.lines)).length * b.scale, 0) / B.length : null);
  const compared = B.length ? `${B.length === 1 ? B[0].label : `your last ${B.length} ${B.length === 1 ? 'period' : 'periods'} (${B.map((b) => b.label).join(', ')})`}` : '';
  const add = (x) => out.push({ saving: null, ...x, pence: total(applyFilter(lines, x.filter, fctx)), count: pays(applyFilter(lines, x.filter, fctx)).length });
  const allTotal = total(lines);

  // 1. Frequent small purchases
  const small = applyFilter(lines, { small: smallLimit });
  if (small.length >= 8) {
    const t = total(small);
    const topCat = group(small, (l) => l.category)[0];
    const topShop = group(small, (l) => l.merchant).sort((a, b) => b.count - a.count)[0];
    const uN = usualCount((ls) => applyFilter(ls, { small: smallLimit }));
    const uT = usual((ls) => total(applyFilter(ls, { small: smallLimit })));
    add({ id: 'small', level: t >= 3000 && (uN === null || small.length > uN * 1.25) ? 'watch' : 'info',
      title: `${small.length} small payments added up to ${gbp(t)}`,
      body: `Payments under ${gbp(smallLimit)}: about one every ${(days / small.length).toFixed(1)} days, ${gbp2(t / small.length)} each on average. The most were ${topCat.key} (${topCat.count}) and the most frequent shop was ${shopName(topShop.lines)} (${topShop.count}).${uN !== null ? ` Usually you make about ${Math.round(uN)} for ${gbp(uT)}.` : ''}`,
      saving: Math.round(t / 2), savingText: `Half as many would have kept about ${gbp(t / 2)}`,
      how: `Every payment under ${gbp(smallLimit)} in ${periodName}, counted and added up.${uN !== null ? ` Usual = average of ${compared}, scaled to ${days} days.` : ''}`,
      filter: { small: smallLimit } });
  }

  // 2. Habits rising period after period, and 6. takeaway/convenience changes, and 10. frequency vs size
  const byCat = group(lines, (l) => l.category);
  const covered = new Set();
  if (B.length >= 2) {
    for (const g of byCat) {
      const series = [...B].reverse().map((b) => Math.round(total(b.lines.filter((l) => l.category === g.key)) * b.scale));
      const avg = Math.round(series.reduce((a, v) => a + v, 0) / series.length);
      const last3 = [...series.slice(-2), g.pence];
      if (last3[0] > 0 && last3[0] < last3[1] && last3[1] < last3[2] && g.pence - avg >= 1500 && g.pence >= avg * 1.2) {
        const essential = (fctx.essential || new Set()).has(g.lines[0].bucket);
        const d = decompose(g.lines, B.map((b) => ({ lines: b.lines.filter((l) => l.category === g.key), scale: b.scale })));
        covered.add(g.key);
        add({ id: `rising-${g.key}`, level: 'watch', title: `${g.key} has gone up ${last3.length - 1} times in a row`,
          body: `${last3.map(gbp).join(' → ')} (oldest to now, ${plural(d.n1, 'payment')} this time). ${explainSplit(d)}`,
          saving: essential ? null : g.pence - avg, savingText: essential ? null : `Back at your average (${gbp(avg)}) would have kept ${gbp(g.pence - avg)}`,
          how: `${g.key} in each of ${compared} and ${periodName}, scaled to ${days} days: above zero to start with, rising each time, and at least 20% and £15 above the average.`,
          filter: { category: g.key } });
      }
    }
  }
  if (B.length) {
    const conv = byCat.filter((g) => CONVENIENCE.test(g.key)).map((g) => g.key);
    const allConv = new Set([...conv, ...B.flatMap((b) => b.lines.filter((l) => CONVENIENCE.test(l.category)).map((l) => l.category))]);
    if (allConv.size) {
      const cats = [...allConv].sort();
      const pick = (ls) => ls.filter((l) => allConv.has(l.category));
      const now = total(pick(lines)); const u = usual((ls) => total(pick(ls)));
      if (Math.abs(now - u) >= Math.max(1500, u * 0.2)) {
        const d = decompose(pick(lines), B.map((b) => ({ lines: pick(b.lines), scale: b.scale })));
        add({ id: 'convenience', level: now > u ? 'watch' : 'good', title: `Takeaway and convenience ${now > u ? 'up' : 'down'} ${gbp(now - u)} on usual`,
          body: `${gbp(now)} on ${cats.join(', ')} against a usual ${gbp(u)}. ${explainSplit(d)}`,
          saving: now > u ? now - u : null, savingText: now > u ? `Back at your usual would have kept ${gbp(now - u)}` : null,
          how: `Categories that look like takeaway, eating out, snacks, energy drinks or coffee, added together. Usual = average of ${compared}, scaled to ${days} days.`,
          filter: { cats: cats.join('|') } });
        cats.forEach((c) => covered.add(c));
      }
    }
    const biggest = byCat.map((g) => ({ g, u: usual((ls) => total(ls.filter((l) => l.category === g.key))) })).filter((x) => !covered.has(x.g.key) && x.g.key !== 'Paid back to you')
      .sort((a, b) => Math.abs(b.g.pence - b.u) - Math.abs(a.g.pence - a.u))[0];
    if (biggest && Math.abs(biggest.g.pence - biggest.u) >= 2000) {
      const d = decompose(biggest.g.lines, B.map((b) => ({ lines: b.lines.filter((l) => l.category === biggest.g.key), scale: b.scale })));
      const up = biggest.g.pence > biggest.u;
      add({ id: `change-${biggest.g.key}`, level: up ? 'watch' : 'good', title: `${biggest.g.key}: ${up ? 'more often or bigger?' : 'down on usual'}`,
        body: `${gbp(biggest.g.pence)} against a usual ${gbp(biggest.u)} (${up ? '+' : '−'}${gbp(biggest.g.pence - biggest.u)}). ${explainSplit(d)}`,
        how: `The category that moved most against the average of ${compared}. The change is split into how many payments you made and how big they were; the two parts add up to the change.`,
        filter: { category: biggest.g.key } });
    }
  }

  // 3. Unusual transactions (against your own history at that shop)
  const unusual = [];
  for (const l of pays(lines)) {
    if (l.cost < 3000) continue;
    const prior = pays(history.filter((x) => x.merchant === l.merchant));
    const m = median(prior.map((x) => x.cost));
    if (prior.length >= 3 && l.cost >= m * 2.5) unusual.push({ l, text: `${gbp2(l.cost)} at ${shopName([l])} on ${l.date.slice(8, 10)}/${l.date.slice(5, 7)} is ${(l.cost / m).toFixed(1)}× your usual ${gbp2(m)} there (${prior.length} earlier payments).` });
    else if (!prior.length && l.cost >= 5000 && (() => { const cat = pays(history.filter((x) => x.category === l.category)).map((x) => x.cost); return cat.length < 3 || l.cost >= median(cat) * 2.5; })()) unusual.push({ l, text: `${gbp2(l.cost)} to ${shopName([l])} on ${l.date.slice(8, 10)}/${l.date.slice(5, 7)}: the first payment there in your recent history.` });
  }
  const seen = new Set();
  for (const { l, text } of unusual.sort((a, b) => b.l.cost - a.l.cost).filter(({ l }) => !seen.has(l.merchant) && seen.add(l.merchant)).slice(0, 3)) {
    add({ id: `unusual-${l.id}`, level: l.cost >= 10000 ? 'watch' : 'info', title: `Unusual: ${gbp(l.cost)} at ${shopName([l])}`, body: `${text}${l.fromSavings ? ' Paid from savings.' : ''}`,
      how: 'A payment of £30 or more that is at least 2.5 times your typical (median) payment at that shop; or £50 or more somewhere new to your recent history that is also at least 2.5 times your typical payment in that category.',
      filter: { merchant: l.merchant, day: l.date } });
  }

  // 4. Expensive weekends
  let weDays = 0; let wdDays = 0;
  if (from && to) for (let d = from; d <= to; d = addDays(d, 1)) { if (['Sat', 'Sun'].includes(weekdayOf(d))) weDays += 1; else wdDays += 1; }
  const we = applyFilter(lines, { weekend: true }); const wd = applyFilter(lines, { weekend: false });
  if (weDays >= 2 && wdDays >= 3 && total(we) >= 3000) {
    const perWe = total(we) / weDays; const perWd = total(wd) / wdDays;
    if (perWe >= perWd * 1.5) {
      const top = group(we, (l) => l.category)[0];
      add({ id: 'weekends', level: 'watch', title: `Weekends cost ${(perWe / Math.max(1, perWd)).toFixed(1)}× a weekday`,
        body: `${gbp(perWe)} a day at weekends against ${gbp(perWd)} on weekdays. Weekends were ${Math.round((total(we) / allTotal) * 100)}% of your spending on ${Math.round((weDays / (weDays + wdDays)) * 100)}% of the days, mostly ${top.key} (${gbp(top.pence)}).`,
        saving: Math.round((perWe - perWd) * weDays), savingText: `Weekend days at your weekday rate would have kept ${gbp((perWe - perWd) * weDays)}`,
        how: `Spending on Saturdays and Sundays divided by the ${weDays} weekend days, against the rest divided by the ${wdDays} weekdays.`,
        filter: { weekend: true } });
    }
  }

  // 5. Frequently visited shops
  const freq = group(pays(lines), (l) => l.merchant).filter((g) => g.count >= 5).sort((a, b) => b.count - a.count || b.pence - a.pence).slice(0, 2);
  for (const g of freq) {
    const uN = usualCount((ls) => ls.filter((l) => l.merchant === g.key));
    add({ id: `often-${g.key}`, level: 'info', title: `${shopName(g.lines)}: ${g.count} visits`,
      body: `${gbp(g.pence)} in ${plural(g.count, 'payment')}, ${gbp2(g.pence / g.count)} each on average.${uN === null ? '' : uN < 0.5 ? ' None in earlier periods.' : ` Usually about ${Math.round(uN)} visits.`}`,
      how: `Payments to the same shop or payee, counted.${uN !== null ? ` Usual = average of ${compared}, scaled to ${days} days.` : ''}`,
      filter: { merchant: g.key } });
  }

  // 7. A rise explained by one-off payments
  if (B.length) {
    const u = usual((ls) => total(ls));
    if (allTotal - u >= Math.max(5000, u * 0.15)) {
      const big = applyFilter(lines, { recurring: false, min: 7500 }, fctx);
      const bigT = total(big);
      if (bigT >= (allTotal - u) * 0.5) {
        const names = [...big].sort((a, b) => b.cost - a.cost).slice(0, 3).map((l) => `${shopName([l])} ${gbp(l.cost)}`);
        const without = allTotal - bigT;
        add({ id: 'one-offs', level: 'info', title: `One-off payments explain most of the rise`,
          body: `Spending is ${gbp(allTotal - u)} above your usual ${gbp(u)}. ${plural(big.length, 'one-off payment')} of £75 or more came to ${gbp(bigT)}: ${names.join(', ')}${big.length > 3 ? '…' : ''}. Without them you’d be at ${gbp(without)}, ${without > u ? `${gbp(without - u)} above` : `${gbp(u - without)} below`} usual.`,
          how: `Total spending against the average of ${compared}. One-off = £75 or more and not a bill or regular payment.`,
          filter: { recurring: false, min: 7500 } });
      }
    }
  }

  // 8. Recurring expenses
  const rec = applyFilter(lines, { recurring: true }, fctx);
  if (rec.length && total(rec) >= 1000) {
    const top = group(rec, (l) => l.merchant).slice(0, 4).map((g) => `${shopName(g.lines)} ${gbp2(g.pence)}`);
    add({ id: 'recurring', level: 'info', title: `${gbp(total(rec))} went on regular payments`,
      body: `${plural(pays(rec).length, 'payment')}, ${Math.round((total(rec) / allTotal) * 100)}% of your spending: ${top.join(', ')}.`,
      how: 'Bills on your list, plus payments Money HQ has seen about once a month, at a similar amount, for three months or more.',
      filter: { recurring: true } });
  }

  // 9. Buckets that keep going over budget (pay cycles only)
  if (budgets.length >= 2) {
    const recent = budgets.slice(0, 3);
    for (const b of Object.keys(recent[0].budget || {})) {
      const withBudget = recent.filter((c) => c.budget[b]);
      const over = withBudget.filter((c) => (c.actual[b] || 0) > c.budget[b]);
      if (withBudget.length >= 2 && over.length >= 2) {
        const avgOver = Math.round(over.reduce((a, c) => a + (c.actual[b] - c.budget[b]), 0) / over.length);
        const typical = Math.round(withBudget.reduce((a, c) => a + (c.actual[b] || 0), 0) / withBudget.length);
        add({ id: `budget-${b}`, level: over.length === withBudget.length ? 'act' : 'watch', title: `${b} over budget in ${over.length} of ${withBudget.length} cycles`,
          body: `By ${gbp(avgOver)} on average. Budgets were ${withBudget.map((c) => gbp(c.budget[b])).join(', ')}; you spent ${withBudget.map((c) => gbp(c.actual[b] || 0)).join(', ')} (${withBudget.map((c) => c.label).join(', ')}). Typical spend: ${gbp(typical)}.`,
          how: 'Each recent pay cycle’s budget for this bucket against what was spent from your pay (big buys from savings don’t count).',
          filter: { bucket: b, savings: false } });
      }
    }
  }

  // 11. Savings opportunities: discretionary categories above their usual
  if (B.length) {
    const ess = fctx.essential || new Set();
    const above = byCat.filter((g) => !ess.has(g.lines[0].bucket) && g.key !== 'Paid back to you')
      .map((g) => ({ key: g.key, now: g.pence, u: usual((ls) => total(ls.filter((l) => l.category === g.key))) }))
      .filter((x) => x.now - x.u >= 1000).sort((a, b) => (b.now - b.u) - (a.now - a.u)).slice(0, 3);
    if (above.length) {
      const sum = above.reduce((a, x) => a + x.now - x.u, 0);
      add({ id: 'opportunity', level: 'good', title: `Room to save: about ${gbp(sum)}`,
        body: `If ${above.map((x) => x.key).join(above.length === 2 ? ' and ' : ', ')} had been at your usual, you’d have kept ${gbp(sum)}: ${above.map((x) => `${x.key} ${gbp(x.now)} vs ${gbp(x.u)}`).join('; ')}.`,
        saving: sum, savingText: `${gbp(sum)} this period`,
        how: `Discretionary categories (not in your essential buckets) that were at least £10 above the average of ${compared}, scaled to ${days} days.`,
        filter: above.length === 1 ? { category: above[0].key } : { cats: above.map((x) => x.key).join('|') } });
    }
  }

  return out.sort((a, b) => WEIGHT[b.level] - WEIGHT[a.level] || (b.saving || Math.abs(b.pence)) - (a.saving || Math.abs(a.pence)));
}
