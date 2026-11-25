// Adding up a period (a pay cycle or a month). Pure, so it can be tested without a browser.
// Rules (spec section 4): transfers are never spending or income; paybacks from friends are never income;
// lines still waiting in the review inbox aren't counted until you decide.

// txs: [{ id, amount_pence, kind, status, bucket, category }] -> totals in pence (spending as positive numbers).
// splits: { txId: pence } that friends owe you for a payment you made for a group. Only your share is spending
// (spec rule 7); the rest is an IOU (`owedToYou`).
export function summarise(txs, splits = {}) {
  const out = { spent: 0, refunds: 0, income: 0, invested: 0, saved: 0, paidBack: 0, owedToYou: 0, waiting: 0, count: txs.length, byBucket: {}, byCategory: {} };
  for (const t of txs) {
    if (t.status === 'needs_review') { out.waiting += 1; continue; }
    const p = t.amount_pence;
    if (t.kind === 'spend' || t.kind === 'refund') {
      const others = t.kind === 'spend' ? Math.min(splits[t.id] || 0, -p) : 0;
      out.owedToYou += others;
      const cost = -p - others; // money out is negative; a refund (money in) lowers spending
      if (t.kind === 'spend') out.spent += cost; else out.refunds += p;
      const b = t.bucket || 'No bucket';
      const c = t.category || 'No category';
      out.byBucket[b] = (out.byBucket[b] || 0) + cost;
      out.byCategory[c] = (out.byCategory[c] || 0) + cost;
    } else if (t.kind === 'income') out.income += p;
    else if (t.kind === 'invested') out.invested += -p;
    else if (t.kind === 'saved') out.saved += -p;
    else if (t.kind === 'repayment') out.paidBack += p;
  }
  out.netSpent = out.spent - out.refunds;
  return out;
}

// Ranked [name, pence] list, biggest first, leaving out zero and negative totals.
export const ranked = (obj) => Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

// "2026-11" -> "November 2026"
export const monthName = (ym) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
