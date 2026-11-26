// The engine behind Analytics. Every chart and total is built from one list of "spending lines", worked out with
// exactly the same rules as summarise(), so any number can be opened up and its lines add back up to it.
//   spend      your share of a payment (minus what friends owe you)                cost > 0
//   refund     money back from a shop                                              cost < 0
//   payback    a friend paying you back, not linked to an IOU                       cost < 0
// Big buys paid from savings are lines too (fromSavings: true): they count in the total but not against budgets.
// Transfers, income, saving, investing and undecided lines are never spending.
import { merchantKey, normKey, cleanName } from './text.js';
import { addDays, dayDiff, weekday } from './dates.js';
import { paysBill } from './budget.js';

export const merchantOf = (t) => merchantKey(t.raw_description) || normKey(t.raw_description) || '(no description)';
export const NO_BUCKET_PAYBACK = 'Paid back (no bucket)';

// Merchants. A bank statement's description names the shop; a description you typed yourself ("Gift for newborn",
// "Work breakfast") says what it was for, not where. So a typed line only counts as a shop when its name matches a
// shop seen in your bank lines (e.g. "Spotify"); otherwise it's grouped as an unknown merchant. Descriptions are
// always kept and shown as they are; only the shop rankings use this.
export const UNKNOWN_MERCHANT = 'unknown merchant';
// From a bank statement: lines imported from a bank file, and the bank exports brought over from the old app
// (stored as archived "csv" lines). Your own lists and anything added by hand are typed.
export const fromBank = (t) => /^(import:|bank-statement)/.test(String(t.source || '')) || (String(t.source || '').startsWith('csv') && Boolean(t.archived));
export function merchantResolver(rows) {
  // Each shop's name as your bank statements most often spell it.
  const names = new Map();
  for (const t of rows.filter(fromBank)) { const k = merchantOf(t); const n = cleanName(t.raw_description); const m = names.get(k) || new Map(); m.set(n, (m.get(n) || 0) + 1); names.set(k, m); }
  const resolve = (t) => { const k = merchantOf(t); return fromBank(t) || names.has(k) ? k : UNKNOWN_MERCHANT; };
  resolve.nameOf = (k) => { const m = names.get(k); return m ? [...m].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0] : null; };
  return resolve;
}
// A shop's name to show: the way its bank lines most often spell it (the key above is only for grouping).
export function shopName(lines) {
  if (lines[0]?.merchant === UNKNOWN_MERCHANT) return 'Unknown merchant';
  if (lines[0]?.shop) return lines[0].shop; // the bank's spelling, not a description you typed
  const n = new Map();
  for (const l of lines) { const k = cleanName(l.t.raw_description) || l.merchant; n.set(k, (n.get(k) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] || '';
}

// merchants: optional merchantResolver(); without it the description's first word(s) are the merchant.
export function spendLines(txs, splits = {}, settled = new Set(), merchants = null) {
  const out = [];
  for (const t of txs) {
    if (t.status === 'needs_review') continue;
    const p = t.amount_pence;
    let kind; let cost;
    if (t.kind === 'spend') { kind = 'spend'; cost = -p - Math.min(splits[t.id] || 0, -p); }
    else if (t.kind === 'refund') { kind = 'refund'; cost = -p; }
    else if (t.kind === 'repayment' && !settled.has(t.id)) { kind = 'payback'; cost = -p; }
    else continue;
    out.push({ id: t.id, t, kind, cost, date: t.date, fromSavings: kind === 'spend' && Boolean(t.from_savings),
      bucket: t.bucket || (kind === 'payback' ? NO_BUCKET_PAYBACK : 'No bucket'), category: t.category || (kind === 'payback' ? 'Paid back to you' : 'No category'), merchant: merchants ? merchants(t) : merchantOf(t), shop: merchants?.nameOf ? merchants.nameOf(merchants(t)) : null });
  }
  return out;
}

export const inRange = (from, to) => (x) => x.date >= from && x.date <= to;
export const total = (lines) => lines.reduce((a, l) => a + l.cost, 0);
export const fromPay = (lines) => lines.filter((l) => !l.fromSavings);

// [{ key, pence, count, lines }] biggest first. count is the number of payments (refunds and paybacks aren't).
export function group(lines, keyOf) {
  const m = new Map();
  for (const l of lines) {
    const k = keyOf(l);
    const g = m.get(k) || { key: k, pence: 0, count: 0, lines: [] };
    g.pence += l.cost; if (l.kind === 'spend') g.count += 1; g.lines.push(l);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.pence - a.pence || a.key.localeCompare(b.key));
}

// Mondays start weeks. Every day of the range appears, spending or not.
export function byDay(lines, from, to) {
  const m = new Map(group(lines, (l) => l.date).map((g) => [g.key, g]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(m.get(d) || { key: d, pence: 0, count: 0, lines: [] });
  return out;
}
export const weekStart = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const weekdayOf = (iso) => WEEKDAYS[(weekday(iso) + 6) % 7];

// Filters: one place that decides which lines a click means, so a panel's lines always add up to the number clicked.
// f: { bucket, category, cats: 'A|B', merchant, day, week, weekday, weekend: true|false, month,
//      recurring: true|false, essential: true|false, small: pence (payments under), min: pence (payments of at least),
//      savings: true|false }
export function applyFilter(lines, f = {}, ctx = {}) {
  return lines.filter((l) => (f.bucket === undefined || l.bucket === f.bucket)
    && (f.category === undefined || l.category === f.category)
    && (f.cats === undefined || String(f.cats).split('|').includes(l.category))
    && (f.weekend === undefined || ['Sat', 'Sun'].includes(weekdayOf(l.date)) === f.weekend)
    && (f.min === undefined || (l.kind === 'spend' && l.cost >= f.min))
    && (f.merchant === undefined || l.merchant === f.merchant)
    && (f.day === undefined || l.date === f.day)
    && (f.week === undefined || weekStart(l.date) === f.week)
    && (f.weekday === undefined || weekdayOf(l.date) === f.weekday)
    && (f.month === undefined || l.date.slice(0, 7) === f.month)
    && (f.cycle === undefined || (l.date >= f.cycle.start && l.date <= f.cycle.end))
    && (f.recurring === undefined || isRecurring(l, ctx) === f.recurring)
    && (f.essential === undefined || (ctx.essential || new Set()).has(l.bucket) === f.essential)
    && (f.small === undefined || (l.kind === 'spend' && l.cost > 0 && l.cost < f.small))
    && (f.savings === undefined || l.fromSavings === f.savings));
}

// Recurring = a bill on your list, or a payment Money HQ has seen about once a month for 3+ months.
// ctx: { bills, recurringKeys: Set of merchant keys }
export function isRecurring(l, { bills = [], recurringKeys = new Set() } = {}) {
  if (l.kind !== 'spend') return false;
  return recurringKeys.has(merchantKey(l.t.raw_description)) || bills.some((b) => b.is_active !== false && paysBill(l.t, b));
}

// Two sets of lines side by side by key: [{ key, a, b, diff, linesA, linesB }] biggest change first. The diffs add
// up to total(B) − total(A), so the rows explain the whole difference.
export function compare(linesA, linesB, keyOf) {
  const m = new Map();
  const put = (l, side) => {
    const k = keyOf(l);
    const r = m.get(k) || { key: k, a: 0, b: 0, linesA: [], linesB: [] };
    r[side] += l.cost; (side === 'a' ? r.linesA : r.linesB).push(l);
    m.set(k, r);
  };
  linesA.forEach((l) => put(l, 'a'));
  linesB.forEach((l) => put(l, 'b'));
  return [...m.values()].map((r) => ({ ...r, diff: r.b - r.a })).filter((r) => r.a || r.b).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.key.localeCompare(y.key));
}

// How often you spend: payments, days with spending, no-spend days, average and typical (median) payment.
export function frequency(lines, from, to) {
  const pays = lines.filter((l) => l.kind === 'spend' && l.cost > 0);
  const days = dayDiff(from, to) + 1;
  const spendDays = new Set(pays.map((l) => l.date)).size;
  const sorted = pays.map((l) => l.cost).sort((a, b) => a - b);
  return { payments: pays.length, days, spendDays, noSpendDays: days - spendDays, perDay: pays.length / days,
    average: pays.length ? Math.round(sorted.reduce((a, v) => a + v, 0) / pays.length) : 0, median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0 };
}

// Money in and where it went, for a set of transactions in the period (net of withdrawals, like everywhere else).
export function flows(txs) {
  const out = { income: 0, incomeBy: new Map(), saved: 0, invested: 0 };
  for (const t of txs) {
    if (t.status === 'needs_review') continue;
    if (t.kind === 'income') { out.income += t.amount_pence; const k = merchantOf(t); out.incomeBy.set(k, (out.incomeBy.get(k) || 0) + t.amount_pence); }
    else if (t.kind === 'invested') out.invested += -t.amount_pence;
    else if (t.kind === 'saved') out.saved += t.accountType === 'savings' ? t.amount_pence : -t.amount_pence;
  }
  out.incomeBy = [...out.incomeBy].map(([key, pence]) => ({ key, pence })).sort((a, b) => b.pence - a.pence);
  return out;
}
