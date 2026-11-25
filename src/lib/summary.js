// Adding up a period (a pay cycle or a month). Pure, so it can be tested without a browser.
// Rules (spec section 4): transfers are never spending or income; paybacks from friends are never income;
// lines still waiting in the review inbox aren't counted until you decide.

// txs: [{ id, amount_pence, kind, status, bucket, category, from_savings }] -> totals in pence
// (spending as positive numbers).
// splits: { txId: pence } friends owe you for a payment you made for a group. Only your share is spending
//   (rule 7); the rest is an IOU (`owedToYou`).
// settled: ids of paybacks that cleared a split IOU. Those aren't taken off spending again.
// Paybacks (rule 6) "reduce the original purchase": each comes off the bucket it was for, or the total if it has
// no bucket. A big buy paid from savings (from_savings) is kept apart in `fromSavings`, not this cycle's spending.
export function summarise(txs, splits = {}, settled = new Set()) {
  const out = { spent: 0, refunds: 0, income: 0, invested: 0, saved: 0, paidBack: 0, paidBackNetted: 0, fromSavings: 0, owedToYou: 0, waiting: 0, count: txs.length, byBucket: {}, byCategory: {} };
  const add = (t, cost) => {
    const b = t.bucket || 'No bucket';
    const c = t.category || 'No category';
    out.byBucket[b] = (out.byBucket[b] || 0) + cost;
    out.byCategory[c] = (out.byCategory[c] || 0) + cost;
  };
  for (const t of txs) {
    if (t.status === 'needs_review') { out.waiting += 1; continue; }
    const p = t.amount_pence;
    if (t.kind === 'spend' && t.from_savings) { out.fromSavings += -p; continue; }
    if (t.kind === 'spend' || t.kind === 'refund') {
      const others = t.kind === 'spend' ? Math.min(splits[t.id] || 0, -p) : 0;
      out.owedToYou += others;
      const cost = -p - others; // money out is negative; a refund (money in) lowers spending
      if (t.kind === 'spend') out.spent += cost; else out.refunds += p;
      add(t, cost);
    } else if (t.kind === 'income') out.income += p;
    else if (t.kind === 'invested') out.invested += -p;
    else if (t.kind === 'saved') out.saved += -p;
    else if (t.kind === 'repayment') {
      out.paidBack += p;
      if (settled.has(t.id)) continue;
      out.paidBackNetted += p;
      if (t.bucket) add(t, -p);
    }
  }
  out.netSpent = out.spent - out.refunds - out.paidBackNetted;
  return out;
}

// Ranked [name, pence] list, biggest first, leaving out zero and negative totals.
export const ranked = (obj) => Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

// "2026-11" -> "November 2026"
export const monthName = (ym) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
