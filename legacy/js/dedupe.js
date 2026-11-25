// Spotting transactions that are already saved, so importing the same file twice never doubles anything.
import { merchantKey, normKey, dayDiff, r2 } from './money.js';

const descKey = (d) => merchantKey(d) || normKey(d);
const exactKey = (t) => [t.account, t.date, t.direction, r2(t.amount).toFixed(2), descKey(t.desc)].join('|');
// Hand-typed and old-dashboard entries have loose dates, accounts and wording, so they are matched more gently.
const isLoose = (t) => t.source === 'manual' || t.source === 'old-backup';
// A move between your own accounts is never the same thing as a purchase.
const compatible = (a, b) => !a.kind || !b.kind || (a.kind === 'internal') === (b.kind === 'internal');

// Returns one answer per row: false (new), 'exact' (already saved), or 'loose' (probably the same as an
// entry you typed by hand or brought from the old dashboard: same amount, a day or two apart, maybe a different
// account or wording). Each saved transaction can only be matched once, so two genuine identical purchases are
// both kept, and rows inside the same file never count as duplicates of each other.
// If rows carry a `kind`, an internal transfer is never matched with a purchase.
export function findDuplicates(rows, existing) {
  const result = rows.map(() => false);
  const used = new Set();

  // 1. Bank reference numbers (Monzo) match exactly.
  const byRef = new Map();
  existing.forEach((t, i) => { if (t.ref) byRef.set(`${t.account}|${t.ref}`, i); });
  rows.forEach((r, i) => {
    if (!r.ref) return;
    const j = byRef.get(`${r.account}|${r.ref}`);
    if (j !== undefined && !used.has(j)) { used.add(j); result[i] = 'exact'; }
  });

  // 2. Same account, date, direction, amount and shop.
  const byKey = new Map();
  existing.forEach((t, i) => {
    const k = exactKey(t);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(i);
  });
  rows.forEach((r, i) => {
    if (result[i] || r.ref) return;
    const list = byKey.get(exactKey(r));
    while (list && list.length) {
      const j = list.shift();
      if (!used.has(j)) { used.add(j); result[i] = 'exact'; break; }
    }
  });

  // 3. Hand-typed or old-dashboard entries: same amount and direction within three days. The closest wins,
  //    preferring the same shop, then the same account. The totals stay right because the amounts are equal.
  const pairs = [];
  rows.forEach((r, i) => {
    if (result[i]) return;
    existing.forEach((t, j) => {
      if (used.has(j) || !(isLoose(t) || isLoose(r)) || !compatible(t, r)) return;
      if (t.direction !== r.direction || Math.abs(r2(t.amount) - r2(r.amount)) >= 0.005) return;
      const days = Math.abs(dayDiff(t.date, r.date));
      if (days > 3) return;
      pairs.push({ i, j, score: (descKey(t.desc) === descKey(r.desc) ? 0 : 10) + (t.account === r.account ? 0 : 5) + days });
    });
  });
  pairs.sort((a, b) => a.score - b.score || a.i - b.i || a.j - b.j);
  for (const { i, j } of pairs) {
    if (result[i] || used.has(j)) continue;
    used.add(j);
    result[i] = 'loose';
  }

  return result;
}
