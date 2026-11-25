// Turns backups from the previous app (IndexedDB, amounts in pounds) into rows for Supabase (pence).
// Pure functions: no network. scripts/migrate-backup.mjs does the uploading and the before/after check.
// Nothing is dropped: anything without a proper home goes into a `legacy` field or settings.extra.legacy.
import { parsePence } from './money.js';
import { addFingerprints } from './fingerprint.js';
import { cycleName } from './cycles.js';
import { addDays } from './dates.js';

// The accounts from spec section 2 (as agreed in Phase 0).
export const ACCOUNTS = [
  { name: 'Ulster Bank', type: 'current', institution: 'Ulster Bank', import_format: 'ulster' },
  { name: 'Revolut', type: 'current', institution: 'Revolut', import_format: 'revolut' },
  { name: 'Revolut Pockets', type: 'savings', institution: 'Revolut', import_format: 'revolut' },
  { name: 'Capital One', type: 'credit_card', institution: 'Capital One', import_format: 'capital_one' },
  { name: 'Monzo savings', type: 'savings', institution: 'Monzo', import_format: 'manual' },
  { name: 'Trading 212 Cash ISA', type: 'isa', institution: 'Trading 212', import_format: 'manual' },
  { name: 'Trading 212 Stocks and Shares ISA', type: 'isa', institution: 'Trading 212', import_format: 'manual' },
  { name: 'Workplace pension', type: 'pension', institution: null, import_format: 'manual' },
];
const ACCOUNT_MAP = { 'Ulster Bank': 'Ulster Bank', Revolut: 'Revolut', 'Credit Card': 'Capital One', Monzo: 'Monzo savings' };
export const accountFor = (old) => ACCOUNT_MAP[old] || null;

// Buckets from spec section 3, with the spec's colours. Fuel is new: fuel used to sit in Essentials.
export const BUCKETS = [
  { name: 'Essentials', description: 'Subscriptions and bills billed to Ulster', colour: '#7AA2FF' },
  { name: 'Groceries', description: 'Food shopping', colour: '#5BD6A0' },
  { name: 'Personal Upkeep', description: 'Things for me: haircuts, skincare and similar', colour: '#B79CFF' },
  { name: 'Life Fund', description: 'Spending on my girlfriend, friends and family', colour: '#F7B955' },
  { name: 'Fun', description: 'Eating out, takeaways, padel, golf, cricket, cinema, nights out', colour: '#F472B6' },
  { name: 'Fuel', description: 'Fuel on the Capital One card', colour: '#4FC9E0' },
].map((b, i) => ({ ...b, sort_order: i + 1 }));
const BUCKET_NAMES = new Set(BUCKETS.map((b) => b.name));
// Categories that always belong to one bucket, whatever the old app said.
const FIXED_BUCKET = { Fuel: 'Fuel' };

// Old kind + direction -> new kind and review status.
export function newKind(t) {
  const out = t.direction === 'out';
  switch (t.kind) {
    case 'spending': return { kind: out ? 'spend' : 'refund', status: 'reviewed' };
    case 'income': return { kind: out ? 'spend' : 'income', status: 'reviewed' };
    case 'invested': return { kind: 'invested', status: 'reviewed' };
    case 'payback': return { kind: out ? 'spend' : 'repayment', status: 'reviewed' };
    case 'internal': return { kind: 'transfer', status: 'reviewed' };
    case 'fund': return { kind: 'saved', status: 'reviewed' };
    default: return { kind: out ? 'spend' : 'repayment', status: 'needs_review' }; // 'unsure': left for you to decide
  }
}

// Spending categories come from the old "detail" names. A category belongs to one bucket: the bucket most of its
// rows used. Rows from a different bucket get "Name (Bucket)", so no row changes bucket silently.
// (Phase 2 merges these into about 15 categories, with your OK.)
export function planCategories(transactions) {
  const counts = new Map(); // detail -> Map(bucket -> n)
  for (const t of transactions) {
    if (!t.detail || !BUCKET_NAMES.has(bucketOf(t))) continue;
    const m = counts.get(t.detail) || new Map();
    m.set(bucketOf(t), (m.get(bucketOf(t)) || 0) + 1);
    counts.set(t.detail, m);
  }
  const home = new Map();
  for (const [detail, m] of counts) home.set(detail, FIXED_BUCKET[detail] || [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  const categories = new Map(); // name -> bucket
  const nameFor = (t) => {
    if (!t.detail) return null;
    const b = bucketOf(t);
    if (!home.has(t.detail)) return null;
    const name = !BUCKET_NAMES.has(b) || home.get(t.detail) === b || FIXED_BUCKET[t.detail] ? t.detail : `${t.detail} (${b})`;
    categories.set(name, name === t.detail ? home.get(t.detail) : b);
    return name;
  };
  return { nameFor, categories };
}
// Old "category" was the bucket for spending; fuel moves to its own bucket.
const bucketOf = (t) => (FIXED_BUCKET[t.detail] || t.category || '');

// Transactions -> rows (without ids; the script fills in account_id and category_id from the names).
export function convertTransactions(transactions, { archived, nameFor }) {
  const rows = transactions.map((t) => {
    const pence = parsePence(t.amount);
    if (pence === null || pence < 0) throw new Error(`Transaction ${t.id} has an unreadable amount`);
    const { kind, status } = newKind(t);
    const isSpendLike = ['spend', 'refund', 'repayment'].includes(kind);
    return {
      account: accountFor(t.account),
      date: t.date,
      cycle_date: t.cycleDate || null,
      amount_pence: t.direction === 'out' ? -pence : pence,
      raw_description: t.desc || '',
      category: isSpendLike && t.kind !== 'payback' ? nameFor(t) : null,
      note: t.note || null,
      tag: t.tag || null,
      status,
      kind,
      archived,
      source: t.source || 'old-app',
      legacy: { id: t.id, kind: t.kind, direction: t.direction, bucket: t.category || null, detail: t.detail || null, account: t.account },
    };
  });
  return addFingerprints(rows);
}

// The old dashboard's cycles, kept as headline totals. Its labels were unreliable, so the name is worked out
// from the dates (named after the month the cycle ends in) and the old label is kept alongside.
export function convertHistory(history) {
  return history.map((h) => {
    const spentByBucket = Object.fromEntries(Object.entries(h.spent || {}).map(([b, v]) => [b, parsePence(v)]));
    return {
      start_date: h.start,
      end_date: h.end,
      label: `${cycleName({ end: h.end })} ${h.end.slice(0, 4)} cycle`,
      old_label: h.label || null,
      spent_pence: parsePence(h.spentTotal ?? Object.values(h.spent || {}).reduce((a, v) => a + v, 0)),
      spent_by_bucket: spentByBucket,
      invested_pence: parsePence(h.invested || 0),
      saved_pence: parsePence(h.saved || 0),
      income_pence: parsePence(h.plannedIncome || 0),
      tx_count: h.txCount ?? null,
      source: 'old dashboard (planned income, not actual)',
    };
  });
}

// Known paydays -> cycles. The last cycle's end is predicted until the next payday is entered.
export function convertCycles(paydates) {
  const days = [...new Set(paydates)].sort();
  return days.slice(0, -1).map((start, i) => ({ start_date: start, end_date: addDays(days[i + 1], -1), predicted_next_payday: null }));
}

// Settings, budgets, bills, pots and rules. Returns everything plus `notes` describing each judgement call.
export function convertSettings(s, pots = [], today) {
  const notes = [];
  const budgets = {};
  for (const [bucket, amount] of Object.entries(s.budgets || {})) {
    let pence = parsePence(amount);
    if (pence % 100 === 1) { notes.push(`${bucket} budget was stored as ${amount} (the float bug); loaded as £${(pence - 1) / 100}.`); pence -= 1; }
    budgets[bucket] = pence;
  }
  const recurring = (s.recurring || []).map((r) => ({
    name: r.name,
    amount_pence: parsePence(r.amount),
    cadence: r.freq === 'yearly' ? 'yearly' : 'monthly',
    next_date: nextBillDate(r, today),
    account: accountFor(r.account) || r.account || null,
    legacy: r,
  }));
  const sinkingFunds = (s.potDefs || []).map((p) => ({
    name: p.name,
    target_pence: parsePence(p.target || 0),
    monthly_pence: parsePence(p.monthly || 0),
    account: 'Monzo savings',
  }));
  const rules = [
    ...Object.entries(s.merchantRules || {}).map(([key, r]) => ({ match: { description_contains: key }, set: { legacy: r }, priority: 300, created_from: 'imported' })),
    ...(s.payerRules || []).map((r) => ({ match: { description_contains: r.match }, set: { legacy: r }, priority: 200, created_from: 'imported' })),
  ];
  const { paydates, budgets: _b, recurring: _r, potDefs: _p, merchantRules: _m, payerRules: _q, buffer, ...rest } = s;
  const settings = {
    reserve_pence: parsePence(buffer || 0),
    payday_usual_day: 24,
    paydays: [...new Set(paydates || [])].sort(),
    extra: { legacy: { settings: rest, pots, potDefs: s.potDefs || [] } },
  };
  return { budgets, recurring, sinkingFunds, rules, settings, notes };
}

function nextBillDate(r, today) {
  const day = String(Math.min(Math.max(1, r.day || 1), 28)).padStart(2, '0');
  let d = `${today.slice(0, 7)}-${day}`;
  if (r.freq === 'yearly' && r.month) d = `${today.slice(0, 4)}-${String(r.month).padStart(2, '0')}-${day}`;
  if (d < today) {
    const y = +d.slice(0, 4);
    const m = +d.slice(5, 7);
    d = r.freq === 'yearly' ? `${y + 1}-${d.slice(5)}` : (m === 12 ? `${y + 1}-01-${day}` : `${y}-${String(m + 1).padStart(2, '0')}-${day}`);
  }
  return d;
}

// Counts and pence totals per account, kind and live/archived. Used before and after the move: they must match.
export function totals(rows) {
  const out = {};
  for (const r of rows) {
    const k = `${r.archived ? 'archived' : 'live'} | ${r.account} | ${r.kind}`;
    out[k] = out[k] || { count: 0, pence: 0 };
    out[k].count += 1;
    out[k].pence += r.amount_pence;
  }
  return Object.fromEntries(Object.entries(out).sort());
}
