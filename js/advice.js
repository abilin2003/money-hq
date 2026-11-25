// Personalised insights and the automatic monthly review, written in plain words from your real numbers.
import { r2, addDays } from './money.js';
import { dashboardSummary, monthLabel } from './dashboard.js';
import { applyFilters, categoryChanges, habits, monthOf, comparisons, detectRecurring } from './analytics.js';
import { budgetStatus, goalForecast, accountsSummary, cashflow, owedSummary, annualCost } from './finance.js';

const gbp = (n) => `£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`;

// Each insight: { level: 'good' | 'watch' | 'act' | 'info', title, body }.
export function insights(data, today) {
  const out = [];
  const dash = dashboardSummary(data, {});
  if (dash.empty) return [{ level: 'info', title: 'Nothing to say yet', body: 'Bring your transactions in and this page will start spotting patterns.' }];
  const spend = applyFilters(data, { type: 'spending' });
  const lastFull = dash.perMonth.filter((p) => dash.fullList.includes(p.month));
  const a = lastFull[lastFull.length - 1];
  const b = lastFull[lastFull.length - 2];

  // Spending up or down vs the previous period.
  if (a && b && b.spent > 0) {
    const pct = Math.round(((a.spent - b.spent) / b.spent) * 100);
    if (Math.abs(pct) >= 10) out.push({ level: pct > 0 ? 'watch' : 'good', title: `Spending ${pct > 0 ? 'rose' : 'fell'} ${Math.abs(pct)}% in ${monthLabel(a.month)}`, body: `You spent ${gbp(a.spent)} after paybacks, against ${gbp(b.spent)} the month before.` });
  }
  // A category taking a bigger share of income.
  if (a && b) {
    const ch = categoryChanges(spend, a.month, b.month).find((c) => c.change > 30 && c.name !== 'Friends & family');
    if (ch) out.push({ level: 'watch', title: `${ch.name} grew by ${gbp(ch.change)}`, body: `${gbp(ch.now)} in ${monthLabel(a.month)} against ${gbp(ch.before)} the month before.${a.income > 0 ? ` That is ${Math.round((ch.now / a.income) * 100)}% of your income.` : ''}` });
  }
  // Small purchases adding up.
  const hab = habits(spend, dash.months);
  const small = hab.find((h) => h.id === 'small');
  if (small && small.perMonth >= 20) out.push({ level: 'info', title: `Small purchases add up to ${gbp(small.perMonth)} a month`, body: `${small.count} purchases under £5, about ${gbp(small.perYear)} a year. No single one matters, but together they are a real number.` });
  // A budget likely to be exceeded.
  const bs = budgetStatus(data, today);
  for (const bk of bs.buckets.filter((x) => x.willExceed && x.over <= 0.005 && x.net > 0).slice(0, 2)) {
    out.push({ level: 'watch', title: `${bk.name} is on course to go over`, body: `At this pace you will spend about ${gbp(bk.projected)} against a ${gbp(bk.budget)} budget by payday.` });
  }
  for (const bk of bs.buckets.filter((x) => x.over > 0.005).slice(0, 2)) {
    out.push({ level: bk.over > bk.budget * 0.5 ? 'act' : 'watch', title: `${bk.name} is ${gbp(bk.over)} over budget`, body: `${gbp(bk.net)} spent of ${gbp(bk.budget)} this pay cycle.` });
  }
  // Goals behind schedule.
  for (const g of data.goals) {
    const f = goalForecast(g, today);
    if (f.status === 'behind') out.push({ level: 'watch', title: `${g.name} is behind schedule`, body: `At ${gbp(g.monthly)} a month it finishes ${f.projected}; you need about ${gbp(f.required)} a month to hit ${g.targetDate}.` });
    else if (f.status === 'stalled') out.push({ level: 'watch', title: `${g.name} has no monthly contribution`, body: 'Add a monthly amount and I can show you when it will be reached.' });
    else if (f.monthsLeft !== null && f.monthsLeft <= 3 && f.status !== 'done') out.push({ level: 'info', title: `${g.name} is approaching its date`, body: `${gbp(f.remaining)} still to go, ${f.monthsLeft} month${f.monthsLeft === 1 ? '' : 's'} left.` });
  }
  // Recurring costs.
  const rec = detectRecurring(data).filter((r) => !r.alreadyEntered).slice(0, 3);
  if (rec.length) out.push({ level: 'info', title: `${rec.length} repeating payment${rec.length === 1 ? '' : 's'} not on your bills list`, body: `${rec.map((r) => `${r.name} (${gbp(r.amount)})`).join(', ')}. Add them under Planning to see them in your calendar.` });
  const billsMonthly = (data.settings.recurring || []).filter((x) => !x.cancelled).reduce((acc, x) => acc + annualCost(x) / 12, 0);
  if (a && a.income > 0 && billsMonthly > a.income * 0.25) out.push({ level: 'watch', title: 'Recurring costs are a big share of your income', body: `${gbp(billsMonthly)} a month is ${Math.round((billsMonthly / a.income) * 100)}% of what you earn.` });
  // A future bill causing a shortfall.
  const cf = cashflow(data, today, 45);
  if (cf.available && cf.shortfall) out.push({ level: 'act', title: 'A shortfall is possible', body: `Your current-account balance could go below zero around ${cf.shortfall.date}. Move money in or move a payment.` });
  // Surplus to redirect.
  if (bs.totals.left > 50 && data.goals.length) {
    const g = data.goals.slice().sort((x, y) => (x.priority || 3) - (y.priority || 3))[0];
    out.push({ level: 'good', title: `${gbp(bs.totals.left)} is unspent in your budgets`, body: `If it stays unspent, you could move some to ${g.name}.` });
  }
  const owed = owedSummary(data.owed, today);
  if (owed.outstanding > 0) out.push({ level: 'info', title: `${gbp(owed.outstanding)} is owed to you`, body: `${owed.count} payment${owed.count === 1 ? '' : 's'} still outstanding.` });
  return out.length ? out : [{ level: 'good', title: 'Nothing needs your attention', body: 'Your spending, budgets and goals look steady right now.' }];
}

// A written summary of the last full month: spending, saving, investing, net worth, wins and what to improve.
export function monthlyReview(data, today) {
  const dash = dashboardSummary(data, {});
  if (dash.empty) return null;
  const full = dash.fullList;
  if (!full.length) return null;
  const m = full[full.length - 1];
  const p = dash.perMonth.find((x) => x.month === m);
  const prev = dash.perMonth.find((x) => x.month === full[full.length - 2]);
  const spend = applyFilters(data, { type: 'spending' });
  const changes = full.length > 1 ? categoryChanges(spend, m, full[full.length - 2]) : [];
  const top = categoryChanges(spend, m, '0000-00').slice(0, 3);
  const wins = [];
  const improve = [];
  if (p.invested > 0) wins.push(`You invested ${gbp(p.invested)}${p.income > 0 ? `, ${Math.round((p.invested / p.income) * 100)}% of your income` : ''}.`);
  if (p.income > 0 && p.spent < p.income) wins.push(`You spent ${gbp(p.income - p.spent)} less than you earned.`);
  if (prev && p.spent < prev.spent) wins.push(`Spending fell by ${gbp(prev.spent - p.spent)} compared with ${monthLabel(prev.month)}.`);
  const up = changes.find((c) => c.change > 30 && c.name !== 'Friends & family');
  if (up) improve.push(`${up.name} rose by ${gbp(up.change)}.`);
  if (prev && p.spent > prev.spent * 1.1) improve.push(`Spending rose by ${gbp(p.spent - prev.spent)} on the month before.`);
  const hab = habits(applyFilters(data, { type: 'spending', from: `${m}-01`, to: `${m}-31` }), [m]).filter((h) => h.id !== 'small').sort((x, y) => y.total - x.total)[0];
  if (hab && hab.total > 30) improve.push(`${hab.name} cost ${gbp(hab.total)}.`);
  const nw = accountsSummary(data.accounts);
  return {
    month: m, label: monthLabel(m),
    lines: [
      `In ${monthLabel(m)} you earned ${gbp(p.income)}, spent ${gbp(p.spent)} (after friends paid back ${gbp(p.paidBack)}) and invested ${gbp(p.invested)}.`,
      top.length ? `Your biggest categories were ${top.map((c) => `${c.name} (${gbp(c.now)})`).join(', ')}.` : '',
      nw.count ? `Your net worth stands at ${gbp(nw.netWorth)}${nw.netWorth < 0 ? ' (negative)' : ''}, as of the balances you entered.` : 'Enter your account balances to include net worth here.',
    ].filter(Boolean),
    wins: wins.length ? wins : ['Nothing stood out as a clear win this month.'],
    improve: improve.length ? improve : ['Nothing needs fixing.'],
  };
}

export { comparisons, monthOf, addDays, r2 };
