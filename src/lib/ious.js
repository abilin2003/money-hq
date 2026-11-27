// Recording what a friend paid back. Pure, in whole pence, so it's tested.
//
// A repayment pays off that person's open IOUs oldest first. If it doesn't cover the next one fully, that IOU is
// split in two: the part paid (now settled) and the rest (still owed), so the totals always add up and nothing
// is lost or counted twice. Paying more than they owe is refused rather than guessed at.
// open: [{ id, amount_pence, date }] the person's unsettled IOUs; pence: amount received (> 0).
export function allocateRepayment(open, pence) {
  if (!Number.isInteger(pence) || pence <= 0) return { error: 'Type the amount they paid, e.g. 20.00.' };
  const owed = open.reduce((a, s) => a + s.amount_pence, 0);
  if (pence > owed) return { error: `That’s more than they owe (£${(owed / 100).toFixed(2)}).` };
  const sorted = [...open].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.amount_pence - b.amount_pence);
  const settle = [];
  let partial = null;
  let left = pence;
  for (const s of sorted) {
    if (left <= 0) break;
    if (s.amount_pence <= left) { settle.push(s.id); left -= s.amount_pence; } else { partial = { id: s.id, paid: left, rest: s.amount_pence - left }; left = 0; }
  }
  return { settle, partial, owedAfter: owed - pence };
}

// Money already in your records that could be this repayment: a payback not yet linked to an IOU, or money in
// still waiting in the inbox (not income, savings or investment withdrawals you've approved), recent, and no more than they owe. Their name in the description ranks first.
export function repaymentCandidates(txs, splits, person, owed, today, days = 45) {
  const used = new Set(splits.map((s) => s.settled_by_transaction_id).filter(Boolean));
  const first = String(person.name || '').toLowerCase().split(/\s+/)[0];
  const from = new Date(new Date(`${today}T12:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10);
  return txs
    .filter((t) => !t.archived && t.amount_pence > 0 && t.amount_pence <= owed && !used.has(t.id) && t.date >= from && t.date <= today && (t.kind === 'repayment' || t.status === 'needs_review'))
    .map((t) => ({ t, named: first.length > 2 && String(t.raw_description || '').toLowerCase().includes(first) }))
    .sort((a, b) => Number(b.named) - Number(a.named) || b.t.date.localeCompare(a.t.date))
    .map((x) => ({ ...x.t, named: x.named }));
}
