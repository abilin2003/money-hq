// One balance calculation for every account, used by the Overview, Wealth and each account's page on every
// device, so a figure is never different depending on where you look:
//   tracked balance = your latest typed-in (verified) balance + the approved lines after it, each counted once.
// Lines waiting in the inbox are reported apart. An account with no typed-in balance has no tracked balance
// (Money HQ never invents one). A credit card's balance is what you owe, and counts against net worth.
import { balanceNow, cardOwed } from './position.js';

export const DEBT_TYPES = new Set(['credit_card', 'loan']);
const ORDER = { current: 0, credit_card: 1, savings: 2, isa: 3, investment: 4, pension: 5 };

export function accountBalance(account, snapshots, txs, today) {
  const b = balanceNow(account, snapshots, txs, today);
  if (!DEBT_TYPES.has(account.type)) return { ...b, value: b.pence, isDebt: false };
  const owed = cardOwed(account, snapshots, txs, today);
  const known = owed.status !== 'unknown' || b.status !== 'unknown';
  return { ...b, status: owed.status, pence: known ? owed.pence : null, value: known ? -owed.pence : null, isDebt: true };
}

// Every active account, in a sensible order (spending accounts first, the pension last).
export function allBalances(accounts, snapshots, txs, today) {
  return accounts.filter((a) => a.is_active !== false)
    .map((a) => ({ account: a, ...accountBalance(a, snapshots, txs, today) }))
    .sort((x, y) => (ORDER[x.account.type] ?? 9) - (ORDER[y.account.type] ?? 9) || x.account.name.localeCompare(y.account.name));
}

// Net worth from the tracked balances. Verified only when every balance is; unknown accounts are named, not
// guessed. Moves between your own accounts cancel out, so they never change it.
// owedToYou: open IOUs, an asset: paying for someone moves money from your bank to "owed to you", and their
// repayment moves it back, so neither changes your net worth.
export function trackedNetWorth(rows, owedToYou = 0) {
  const known = rows.filter((r) => r.value !== null);
  const unknown = rows.filter((r) => r.value === null).map((r) => r.account.name);
  return {
    total: known.reduce((a, r) => a + r.value, 0) + owedToYou,
    owedToYou,
    status: !known.length ? 'unknown' : known.every((r) => r.status === 'verified') && !unknown.length ? 'verified' : 'estimated',
    unknown,
  };
}

// What the money in an account is for: the savings funds kept in it, and what's left over (not allocated).
// funds: sinking funds with account_id; balance: the account's tracked balance (pence or null).
export function allocationsIn(account, funds, balance) {
  const mine = funds.filter((f) => f.account_id === account.id);
  const allocated = mine.reduce((a, f) => a + (f.balance_pence || 0), 0);
  return { funds: mine, allocated, unallocated: balance === null || balance === undefined ? null : balance - allocated };
}

// The live balances grouped the way Wealth shows them. Each group says whether all its accounts are verified,
// some are worked out since (estimated), or none has a balance yet (unknown).
const GROUP_OF = (type) => (DEBT_TYPES.has(type) ? 'debt' : type === 'pension' ? 'pension' : type === 'isa' || type === 'investment' ? 'investments' : 'cash');
export function liveGroups(rows) {
  const out = {};
  for (const g of ['cash', 'investments', 'pension', 'debt']) {
    const mine = rows.filter((r) => GROUP_OF(r.account.type) === g);
    const known = mine.filter((r) => r.value !== null);
    out[g] = {
      pence: g === 'debt' ? known.reduce((a, r) => a + (r.pence || 0), 0) : known.reduce((a, r) => a + r.value, 0),
      status: !known.length ? 'unknown' : known.every((r) => r.status === 'verified') && known.length === mine.length ? 'verified' : 'estimated',
      count: mine.length,
    };
  }
  out.assets = out.cash.pence + out.investments.pence + out.pension.pence;
  out.liabilities = out.debt.pence;
  return out;
}

// An account's balance history: the balances you typed in, oldest first, plus today's live balance (typed-in
// balance + approved lines since) as the last point, so the history always ends on the figure shown everywhere
// else. Nothing is invented: no typed-in balance means no history, and no point is added when nothing has
// happened since your last balance. A card's points are what you owe (positive), a liability.
export function balanceHistory(account, snapshots, txs, today) {
  const mine = snapshots.filter((s) => s.account_id === account.id).sort((a, b) => a.date.localeCompare(b.date));
  const isDebt = DEBT_TYPES.has(account.type);
  const points = mine.map((s) => ({ date: s.date, pence: isDebt ? Math.abs(s.balance_pence) : s.balance_pence, kind: 'typed', status: 'verified' }));
  if (!mine.length) return { points: [], isDebt };
  const live = accountBalance(account, snapshots, txs, today);
  const last = points[points.length - 1];
  if (live.pence !== null && (live.pence !== last.pence || live.since > 0)) points.push({ date: today, pence: live.pence, kind: 'now', status: live.status });
  return { points, isDebt };
}
