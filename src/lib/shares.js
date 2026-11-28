// "Who is this purchase for?": what each answer means for your share and for what others owe you. Pure, in whole
// pence, so it's tested. The whole amount always leaves your account as one purchase; only your share counts
// as your spending, and the rest becomes IOUs.
//   mine    - all yours (no IOUs)
//   payback - someone pays you back all or part of it (one IOU)
//   split   - you and others share it (an IOU per person; your share plus theirs must equal the total)

const pounds = (p) => `£${(Math.abs(p) / 100).toFixed(2)}`;

// total: the purchase in pence (> 0). Returns { myShare, ious: [{ name, amount_pence, due_date, note }] } or { error }.
export function planShares(total, mode, input = {}) {
  if (!Number.isInteger(total) || total <= 0) return { error: 'Type the amount first.' };
  if (mode === 'payback') {
    const name = String(input.name || '').trim();
    if (!name) return { error: 'Who owes you?' };
    const owed = input.owed ?? total;
    if (!Number.isInteger(owed) || owed <= 0) return { error: 'How much do they owe you?' };
    if (owed > total) return { error: `They can’t owe more than the purchase (${pounds(total)}).` };
    return { myShare: total - owed, ious: [{ name, amount_pence: owed, due_date: input.due || null, note: input.reason || null }] };
  }
  if (mode === 'split') {
    const people = (input.people || []).map((p) => ({ name: String(p.name || '').trim(), pence: p.pence }));
    if (!people.length) return { error: 'Add the people sharing it.' };
    if (people.some((p) => !p.name)) return { error: 'Give each person a name.' };
    if (people.some((p) => !Number.isInteger(p.pence) || p.pence <= 0)) return { error: 'Give each person an amount.' };
    const names = people.map((p) => p.name.toLowerCase());
    if (new Set(names).size !== names.length) return { error: 'Someone is listed twice.' };
    const mine = input.myShare;
    if (!Number.isInteger(mine) || mine < 0) return { error: 'Type your share (0 if none of it is yours).' };
    const assigned = mine + people.reduce((a, p) => a + p.pence, 0);
    if (assigned !== total) return { error: assigned < total ? `${pounds(total - assigned)} of the ${pounds(total)} isn’t assigned to anyone yet.` : `The shares come to ${pounds(assigned)}, ${pounds(assigned - total)} more than the ${pounds(total)} paid.` };
    return { myShare: mine, ious: people.map((p) => ({ name: p.name, amount_pence: p.pence, due_date: null, note: input.reason || null })) };
  }
  return { myShare: total, ious: [] };
}

// An equal split between you and n others: everyone gets the same, and any odd pennies go to you (you paid).
// Returns { mine, each: [pence for each other person] }.
export function equalSplit(total, others) {
  const n = others + 1;
  const base = Math.floor(total / n);
  return { mine: total - base * others, each: Array.from({ length: others }, () => base) };
}

// Changing a purchase that has IOUs: what's safe. An IOU that's been (partly) paid back can't be removed or
// shrunk below what was repaid, and the IOUs can't come to more than the purchase.
// splits: [{ id, amount_pence, settled_by_transaction_id }]; change: { total?, remove?: id, setAmount?: { id, pence } }
export function checkSplitChange(splits, total, change) {
  const after = splits
    .filter((s) => s.id !== change.remove)
    .map((s) => (change.setAmount && s.id === change.setAmount.id ? { ...s, amount_pence: change.setAmount.pence } : s));
  const t = change.total ?? total;
  if (change.remove && splits.find((s) => s.id === change.remove)?.settled_by_transaction_id) return { error: 'That IOU has been paid back, so it can’t be removed. Undo the repayment first.' };
  if (change.setAmount) {
    const s = splits.find((x) => x.id === change.setAmount.id);
    if (s?.settled_by_transaction_id) return { error: 'That IOU has been paid back, so its amount can’t change.' };
    if (!Number.isInteger(change.setAmount.pence) || change.setAmount.pence <= 0) return { error: 'Type an amount above £0 (or remove the IOU).' };
  }
  const owed = after.reduce((a, s) => a + s.amount_pence, 0);
  if (owed > t) return { error: `What others owe (${pounds(owed)}) would be more than the purchase (${pounds(t)}).` };
  return { ok: true, myShare: t - owed };
}
