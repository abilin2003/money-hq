// "Paid for by": this cycle's budget, or one of your savings funds. A purchase paid from savings counts in total
// spending but not against the cycle's budgets (from_savings), and fund_id says which fund it came from.
import { h } from './dom.js';

export function fundSelect(ctx, { fromSavings = false, fundId = null, label = 'Paid for by' } = {}) {
  const mirrors = ctx.ref.settings?.extra?.fund_mirrors || {};
  const nameOf = (f) => { const a = mirrors[f.id] && ctx.ref.accounts.find((x) => x.id === mirrors[f.id]); return a ? `${f.name} (${a.name})` : f.name; };
  return h('select', { class: 'input', 'aria-label': label },
    h('option', { value: '' }, 'This cycle’s budget'),
    (ctx.ref.funds || []).map((f) => h('option', { value: f.id, selected: Boolean(fromSavings) && f.id === fundId }, `Savings: ${nameOf(f)}`)),
    h('option', { value: 'savings', selected: Boolean(fromSavings) && !fundId }, 'Savings (no particular fund)'));
}

// What the picker means for the transaction. allowed: only spending can be paid from savings.
export function readFund(select, allowed = true) {
  const v = allowed ? select.value : '';
  return { from_savings: Boolean(v), fund_id: v && v !== 'savings' ? v : null };
}
