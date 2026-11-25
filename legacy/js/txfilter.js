// Searching and filtering the transactions list. Pure functions, so they can be tested without a browser.
import { addDays } from './money.js';
import { periodFor } from './paycycle.js';

// filters: { q, category, account, kind, tag, period: 'all' | 'cycle' | 'prev' | 'custom', from, to }
// context: { today, paydates }
export function filterTransactions(transactions, filters = {}, context = {}) {
  const q = String(filters.q || '').trim().toLowerCase();
  let range = null;
  if (filters.period === 'cycle' || filters.period === 'prev') {
    const current = periodFor(context.today, context.paydates);
    range = filters.period === 'cycle' ? current : periodFor(addDays(current.start, -1), context.paydates);
  } else if (filters.period === 'custom') {
    range = { start: filters.from || '0000-01-01', end: filters.to || '9999-12-31' };
  }
  return transactions
    .filter((t) => {
      if (filters.category && t.category !== filters.category) return false;
      if (filters.account && t.account !== filters.account) return false;
      if (filters.kind && t.kind !== filters.kind) return false;
      if (filters.tag && t.tag !== filters.tag) return false;
      if (range && (t.date < range.start || t.date > range.end)) return false;
      if (q && !`${t.desc} ${t.category} ${t.tag || ''} ${t.account} ${t.kind}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.desc.localeCompare(b.desc));
}

const sum = (list) => Math.round(list.reduce((a, t) => a + t.amount, 0) * 100) / 100;

// Plain totals for a list. Internal transfers, funds and unsure lines are never in the money totals.
export function summarise(transactions) {
  const of = (kind, direction) => transactions.filter((t) => t.kind === kind && t.direction === direction);
  return {
    count: transactions.length,
    spent: sum(of('spending', 'out')),
    paidBack: sum(of('payback', 'in')),
    income: sum(of('income', 'in')),
    invested: sum(of('invested', 'out')),
    internal: transactions.filter((t) => t.kind === 'internal').length,
    unsure: transactions.filter((t) => t.kind === 'unsure').length,
  };
}
