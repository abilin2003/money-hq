// Planned vs actual vs verified. Pure functions in whole pence.
//   verified:  a balance you typed in, recent, with nothing imported after it
//   estimated: a balance you typed in, moved on by the transactions imported since
//   unknown:   no balance typed in yet (Money HQ never guesses one)
import { dayDiff } from './dates.js';
import { normKey } from './text.js';

const FRESH_DAYS = 3;
const lastSnapshot = (accountId, snapshots) => snapshots.filter((s) => s.account_id === accountId).sort((a, b) => a.date.localeCompare(b.date)).pop() || null;

export function balanceNow(account, snapshots, txs, today) {
  const last = lastSnapshot(account.id, snapshots);
  if (!last) return { status: 'unknown', pence: null, verifiedPence: null, verifiedDate: null, since: 0 };
  const after = txs.filter((t) => t.account_id === account.id && t.date > last.date);
  const delta = after.reduce((a, t) => a + t.amount_pence, 0);
  const isCard = account.type === 'credit_card';
  const pence = isCard ? last.balance_pence - delta : last.balance_pence + delta; // a card balance is what you owe
  const status = !after.length && dayDiff(last.date, today) <= FRESH_DAYS ? 'verified' : 'estimated';
  return { status, pence, verifiedPence: last.balance_pence, verifiedDate: last.date, since: after.length };
}

// Cash in your current accounts (the money you actually spend from), minus bills still due and the reserve.
// Unknown until every current account has a balance: a partial total would look safer than it is.
export function cashPosition({ accounts, snapshots, txs, today, billsDue = 0, reserve = 0 }) {
  const spending = accounts.filter((a) => a.type === 'current' && a.is_active !== false);
  const rows = spending.map((a) => ({ account: a.name, ...balanceNow(a, snapshots, txs, today) }));
  const missing = rows.filter((r) => r.status === 'unknown').map((r) => r.account);
  if (!rows.length || missing.length) return { status: 'unknown', rows, missing, total: null, available: null };
  const total = rows.reduce((a, r) => a + r.pence, 0);
  return { status: rows.every((r) => r.status === 'verified') ? 'verified' : 'estimated', rows, missing, total, available: total - billsDue - reserve, oldest: rows.map((r) => r.verifiedDate).sort()[0] };
}

// What you owe on a credit card. With a typed-in balance: that, plus purchases since, minus repayments since.
// Without one: purchases since the last repayment Money HQ can see (an estimate; type the balance to verify).
// A repayment is money out of another account that names the card (e.g. "CAPITAL ONE"), or money into the card.
export function cardOwed(card, snapshots, txs, today) {
  const key = normKey(card.institution || card.name);
  const isRepayment = (t) => (t.account_id !== card.id && t.amount_pence < 0 && t.kind === 'transfer' && key && ` ${normKey(t.raw_description)} `.includes(` ${key} `))
    || (t.account_id === card.id && t.amount_pence > 0 && t.kind !== 'refund');
  const isPurchase = (t) => t.account_id === card.id && t.amount_pence < 0 && t.status !== 'needs_review';
  const last = lastSnapshot(card.id, snapshots);
  if (last) {
    const after = txs.filter((t) => t.date > last.date);
    const pence = last.balance_pence + after.filter(isPurchase).reduce((a, t) => a - t.amount_pence, 0) - after.filter(isRepayment).reduce((a, t) => a + Math.abs(t.amount_pence), 0);
    const fresh = !after.some((t) => isPurchase(t) || isRepayment(t)) && dayDiff(last.date, today) <= FRESH_DAYS;
    return { status: fresh ? 'verified' : 'estimated', pence: Math.max(0, pence), since: last.date };
  }
  const since = txs.filter(isRepayment).map((t) => t.date).sort().pop() || null;
  const purchases = txs.filter((t) => isPurchase(t) && (!since || t.date > since));
  return { status: purchases.length ? 'estimated' : 'unknown', pence: purchases.reduce((a, t) => a - t.amount_pence, 0), since, count: purchases.length };
}

// ---------------------------------------------------------------- the card repayment on payday
// What you put on a credit card in one pay cycle (purchases less refunds), so the repayment line in the next
// payday's plan can be worked out instead of guessed. Card lines waiting for review count: you still owe them.
// complete: the card's imported lines reach the end of that cycle (if not, a statement is probably missing).
export function cardSpendIn(card, txs, from, to) {
  const onCard = txs.filter((t) => t.account_id === card.id);
  const lines = onCard.filter((t) => t.date >= from && t.date <= to && (t.kind === 'spend' || t.kind === 'refund'));
  const lastImported = onCard.map((t) => t.date).sort().pop() || null;
  return { pence: Math.max(0, -lines.reduce((a, t) => a + t.amount_pence, 0)), count: lines.filter((t) => t.amount_pence < 0).length, from, to, lastImported, complete: Boolean(lastImported) && lastImported >= to };
}
// A payday line that repays the card: a transfer whose name mentions the card (e.g. "Capital One repayment").
export const isCardLine = (item, card) => Boolean(card) && item.kind === 'transfer' && [card.institution, card.name].filter(Boolean).some((n) => { const k = normKey(n); return k && ` ${normKey(item.name)} `.includes(` ${k} `); });
// Card lines follow the card's spending unless you typed your own amount (auto: false) or already confirmed the
// payment on Money day (then the amount you confirmed stays).
export function withCardAmounts(items, card, spend) {
  if (!card || !spend) return items;
  return items.map((it) => (isCardLine(it, card) && it.auto !== false && !it.verified ? { ...it, amount_pence: spend.pence, autoCard: true } : it));
}

// ---------------------------------------------------------------- a fund that is an account
// Some funds aren't a pot of their own: the Emergency fund is your Cash ISA. Such a fund shows the account's
// latest typed-in balance, so the same money is never typed in twice or allowed to disagree.
export function mirroredFund(fund, account, snapshots) {
  const last = lastSnapshot(account.id, snapshots);
  return { ...fund, balance_pence: last ? Math.abs(last.balance_pence) : null, balance_date: last?.date || null, mirrors: account };
}

// A sinking fund's money, kept in three parts: what you've verified (typed in), what your payday plans put in
// after that, and the expected total (verified + planned, not yet checked).
const matches = (fundName, itemName) => { const f = normKey(fundName); const i = normKey(itemName); return Boolean(f && i) && (i === f || i.includes(f) || f.includes(i)); };
export function fundStatus(fund, plans = {}, today) {
  const from = fund.balance_date || '0000-00-00';
  const starts = Object.keys(plans).sort();
  const thisPayday = starts.filter((s) => s <= today).pop();
  let planned = 0;
  let plannedThisPayday = 0;
  for (const start of starts) {
    if (start <= from) continue;
    const amount = (plans[start].items || []).filter((i) => i.kind === 'saved' && matches(fund.name, i.name)).reduce((a, i) => a + (i.amount_pence || 0), 0);
    planned += amount;
    if (start === thisPayday) plannedThisPayday = amount;
  }
  if (!fund.balance_date && thisPayday) plannedThisPayday = (plans[thisPayday].items || []).filter((i) => i.kind === 'saved' && matches(fund.name, i.name)).reduce((a, i) => a + (i.amount_pence || 0), 0);
  const verified = fund.balance_date ? { pence: fund.balance_pence || 0, date: fund.balance_date } : null;
  const status = !verified ? 'not verified' : dayDiff(verified.date, today) > 35 ? 'stale' : 'verified';
  return { status, verified, planned, plannedThisPayday, expected: (verified?.pence || 0) + planned };
}
