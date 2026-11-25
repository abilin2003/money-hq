// Favourite tiles for quick entry, built from what you have spent on before.
import { merchantKey, dayDiff, todayIso } from './money.js';

// Returns tiles { key, name, category, account, amount, last, n }: the usual amount is the latest one.
// Pinned tiles come first, then the most used and most recent. Hidden tiles are left out.
export function quickTiles(transactions, quick = {}, today = todayIso()) {
  const pinned = quick.pinned || [];
  const hidden = quick.hidden || [];
  const byShop = new Map();
  transactions
    .filter((t) => t.kind === 'spending' && t.direction === 'out' && t.category && t.category !== 'Uncategorised')
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => {
      const key = merchantKey(t.desc);
      if (!key) return;
      const tile = byShop.get(key) || { key, n: 0 };
      tile.n += 1;
      tile.name = t.desc;
      tile.category = t.category;
      tile.account = t.account;
      tile.amount = t.amount;
      tile.last = t.date;
      byShop.set(key, tile);
    });
  const score = (x) => x.n + (dayDiff(x.last, today) <= 21 ? 2 : 0);
  return [...byShop.values()]
    .filter((x) => !hidden.includes(x.key))
    .sort((a, b) => {
      const pa = pinned.indexOf(a.key);
      const pb = pinned.indexOf(b.key);
      if (pa >= 0 || pb >= 0) return (pa < 0 ? 999 : pa) - (pb < 0 ? 999 : pb);
      return score(b) - score(a) || b.last.localeCompare(a.last);
    });
}
