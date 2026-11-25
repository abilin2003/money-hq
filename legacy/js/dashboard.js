// The numbers behind the Dashboard tab. Pure functions, so they can be tested without a browser.
// Money in, spent and invested are worked out per calendar month, like the screenshots.
import { r2, dayDiff } from './money.js';

const monthOf = (iso) => iso.slice(0, 7); // "2026-11"
const sum = (list) => r2(list.reduce((a, t) => a + t.amount, 0));

// "2025-11" .. "2026-02" -> ["2025-11","2025-12","2026-01","2026-02"]
export function monthRange(from, to) {
  const out = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= to && out.length < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

// Which months can be trusted for averages? A month only counts if the data covers (nearly) all of it:
// the first month is left out if the data starts part-way through it, and the newest month is left out
// unless the data reaches its last few days. A half-covered month would pull every average down.
export function fullMonths(months, lastDate, firstDate) {
  let list = months.slice();
  if (!list.length) return list;
  if (firstDate && monthOf(firstDate) === list[0] && +firstDate.slice(8, 10) > 7) list = list.slice(1);
  const last = months[months.length - 1];
  const day = +lastDate.slice(8, 10);
  const daysInLast = new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 0)).getUTCDate();
  if (list.length && list[list.length - 1] === last && monthOf(lastDate) === last && day < daysInLast - 3) list = list.slice(0, -1);
  return list;
}

// filters: { accounts: [] (empty = all), from: 'YYYY-MM', to: 'YYYY-MM', pick: 'Travel' }
// Which transactions and months do the current filters select?
function scope(data, filters = {}) {
  const all = data.transactions;
  if (!all.length) return null;
  const dates = all.map((t) => t.date).sort();
  const firstMonth = monthOf(dates[0]);
  const lastMonth = monthOf(dates[dates.length - 1]);
  const from = filters.from && filters.from >= firstMonth ? filters.from : firstMonth;
  const to = filters.to && filters.to <= lastMonth ? filters.to : lastMonth;
  const accounts = filters.accounts && filters.accounts.length ? filters.accounts : null;
  const inScope = all.filter((t) => monthOf(t.date) >= from && monthOf(t.date) <= to && (!accounts || accounts.includes(t.account)));
  return { all, dates, firstMonth, lastMonth, from, to, accounts, inScope, months: monthRange(from, to) };
}

export function dashboardSummary(data, filters = {}) {
  const sc = scope(data, filters);
  if (!sc) return { empty: true };
  const { all, dates, firstMonth, lastMonth, from, to, accounts, inScope, months } = sc;
  const perMonth = months.map((month) => {
    const mt = inScope.filter((t) => monthOf(t.date) === month);
    const spent = sum(mt.filter((t) => t.kind === 'spending' && t.direction === 'out'));
    const back = sum(mt.filter((t) => t.kind === 'payback' && t.direction === 'in'));
    return {
      month,
      income: sum(mt.filter((t) => t.kind === 'income' && t.direction === 'in')),
      spent: r2(Math.max(0, spent - back)), // friends paying you back reduce spending, they are not income
      grossSpent: spent,
      paidBack: back,
      invested: sum(mt.filter((t) => t.kind === 'invested' && t.direction === 'out')),
    };
  });

  const lastDate = inScope.length ? inScope.map((t) => t.date).sort().pop() : dates[dates.length - 1];
  const firstDate = inScope.length ? inScope.map((t) => t.date).sort()[0] : dates[0];
  const full = fullMonths(months, lastDate, firstDate);
  // With at least one fully covered month, average over those. With none yet, scale what we have: the total over
  // the days the data actually covers, shown as a monthly pace (so six days of data is never called a month).
  const basis = full.length ? 'months' : 'span';
  const basisDays = basis === 'span' ? dayDiff(firstDate, lastDate) + 1 : 0;
  const n = basis === 'months' ? full.length : Math.max(basisDays / 30.44, 0.5);
  const fullRows = basis === 'months' ? perMonth.filter((p) => full.includes(p.month)) : perMonth;
  const avg = (key) => r2(fullRows.reduce((a, p) => a + p[key], 0) / n);
  const avgIncome = avg('income');
  const avgInvested = avg('invested');

  // Subscriptions: what the sorter tagged as a subscription, averaged the same way.
  const subs = inScope.filter((t) => t.kind === 'spending' && t.direction === 'out' && t.detail === 'Subscriptions' && (basis === 'span' || full.includes(monthOf(t.date))));
  const subsPerMonth = r2(sum(subs) / n);

  // Fixed bills: the monthly bills you entered.
  const fixedBills = r2((data.settings.recurring || []).filter((b) => (b.freq || 'monthly') === 'monthly').reduce((a, b) => a + (Number(b.amount) || 0), 0));

  // A category you pick (Holidays by default): the last 12 months in scope.
  const pickOptions = [...new Set(inScope.filter((t) => t.kind === 'spending' && t.direction === 'out' && t.detail).map((t) => t.detail))].sort();
  const pick = filters.pick && pickOptions.includes(filters.pick) ? filters.pick : (pickOptions.includes('Travel') ? 'Travel' : pickOptions[0] || '');
  const twelve = months.slice(-12);
  const pickTotal = sum(inScope.filter((t) => t.kind === 'spending' && t.direction === 'out' && t.detail === pick && twelve.includes(monthOf(t.date))));

  const internal = inScope.filter((t) => t.kind === 'internal').length;
  const unsure = inScope.filter((t) => t.kind === 'unsure').length;
  const accountsPresent = [...new Set(all.map((t) => t.account).filter(Boolean))].sort();

  return {
    empty: false,
    from, to, firstMonth, lastMonth, months, perMonth,
    fullMonths: full.length,
    fullList: full,
    basis, basisDays,
    cards: {
      avgIncome,
      avgSpend: avg('spent'),
      avgInvested,
      investedShare: avgIncome > 0 ? Math.round((avgInvested / avgIncome) * 100) : 0,
      fixedBills,
      subsPerMonth,
      pick, pickTotal, pickOptions,
    },
    coverage: {
      accounts: accounts || accountsPresent,
      accountsPresent,
      first: inScope.length ? inScope.map((t) => t.date).sort()[0] : null,
      last: lastDate,
      count: inScope.length,
      internal,
      unsure,
    },
  };
}

// ---------------------------------------------------------------- chart numbers

const PEOPLE = new Set(['Friends', 'Partner', 'Family (mum)', 'Family (dad)', 'Family (brother)']);

// The name shown for a category. Money sent to people is grouped, trips are called "Holidays & travel".
export function categoryLabel(detail) {
  if (!detail) return 'Uncategorised';
  if (PEOPLE.has(detail)) return 'Friends & family';
  return detail === 'Travel' ? 'Holidays & travel' : detail;
}

const gbp0 = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;

// What the Overview charts draw, plus a one-line takeaway for each.
//   spend: stacked bars, one series per category (the biggest few, then "Everything else").
//          This is what you actually paid, before friends paid you back.
//   money: money in, spent (after paybacks, the same figure as the cards) and invested, per month.
export function overviewSeries(data, filters = {}, topN = 7) {
  const sc = scope(data, filters);
  if (!sc) return { empty: true };
  const summary = dashboardSummary(data, filters);
  const { inScope, months } = sc;

  const spendTx = inScope.filter((t) => t.kind === 'spending' && t.direction === 'out');
  const isPeople = (t) => PEOPLE.has(t.detail);
  const shopTx = spendTx.filter((t) => !isPeople(t));
  const peopleTx = spendTx.filter(isPeople);

  // Money to and from friends and family is shown as ONE net bar: what you sent, minus what came back that month.
  // (Otherwise "Friends & family" would look like your biggest spend, when most of it returns to you.)
  const PEOPLE_NAME = 'Friends & family (net)';
  const backByMonth = months.map((m) => sum(inScope.filter((t) => t.kind === 'payback' && t.direction === 'in' && monthOf(t.date) === m)));
  const peopleNet = months.map((m, i) => Math.max(0, r2(sum(peopleTx.filter((t) => monthOf(t.date) === m)) - backByMonth[i])));
  const peopleTotal = r2(peopleNet.reduce((a, v) => a + v, 0));

  const totals = new Map();
  for (const t of shopTx) {
    const k = categoryLabel(t.detail);
    totals.set(k, r2((totals.get(k) || 0) + t.amount));
  }
  if (peopleTotal > 0) totals.set(PEOPLE_NAME, peopleTotal);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, topN).map(([name]) => name);
  const names = ranked.length > topN ? [...top, 'Everything else'] : top;
  const series = names.map((name) => ({
    name,
    total: name === 'Everything else' ? r2(ranked.slice(topN).reduce((a, [, v]) => a + v, 0)) : totals.get(name),
    values: months.map((m, i) => {
      if (name === PEOPLE_NAME) return peopleNet[i];
      const shops = sum(shopTx.filter((t) => monthOf(t.date) === m
        && (name === 'Everything else' ? !top.includes(categoryLabel(t.detail)) : categoryLabel(t.detail) === name)));
      return name === 'Everything else' && !top.includes(PEOPLE_NAME) ? r2(shops + peopleNet[i]) : shops;
    }),
  }));
  const monthTotals = months.map((_, i) => r2(series.reduce((a, s) => a + s.values[i], 0)));
  const grand = r2(monthTotals.reduce((a, v) => a + v, 0));

  // Takeaway for the spend chart.
  let spendTakeaway = 'There is no spending in this range yet.';
  if (grand > 0 && ranked.length) {
    const [bigName, bigTotal] = ranked[0];
    const peak = monthTotals.indexOf(Math.max(...monthTotals));
    spendTakeaway = `${bigName} is your biggest category: ${gbp0(bigTotal)}, ${Math.round((bigTotal / grand) * 100)}% of what you paid. Your highest month was ${monthLabel(months[peak])} at ${gbp0(monthTotals[peak])}.`;
  }

  const money = {
    income: summary.perMonth.map((p) => p.income),
    spent: summary.perMonth.map((p) => p.spent),
    invested: summary.perMonth.map((p) => p.invested),
    gross: summary.perMonth.map((p) => p.grossSpent),
    back: summary.perMonth.map((p) => p.paidBack),
  };
  const paid = summary.perMonth.filter((p) => p.income > 0); // months with a salary in them
  const under = paid.filter((p) => p.spent < p.income).length;
  const tIn = r2(money.income.reduce((a, v) => a + v, 0));
  const tSpent = r2(money.spent.reduce((a, v) => a + v, 0));
  const tInv = r2(money.invested.reduce((a, v) => a + v, 0));
  const moneyTakeaway = paid.length
    ? `You spent less than you earned in ${under} of ${paid.length} months. Over this range you earned ${gbp0(tIn)}, spent ${gbp0(tSpent)} and invested ${gbp0(tInv)}.`
    : 'There is no income in this range yet.';

  return {
    empty: false,
    months,
    labels: months.map(monthLabel),
    spend: { series, monthTotals, grand, takeaway: spendTakeaway },
    money: { ...money, takeaway: moneyTakeaway },
  };
}
