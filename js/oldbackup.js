// Bringing across a backup from the old dashboard (keys finS4, finTXS4, finHist4, finPots4).
import { parseDate, r2, makeId } from './money.js';
import { INVESTED_ACCOUNTS } from './seed.js';
import { findDuplicates } from './dedupe.js';

const OLD_TRANSFERS = ['Credit Card Repayment', 'Overdraft', 'Cash ISA withdrawal'];
const OLD_NON_SPENDING = ['Holiday Pot', 'Watch for Dad', 'Saving Challenge', 'Financial', 'Holiday Fund', 'Pots'];

// The old dashboard stored one "bucket" per transaction. In the new model that becomes a kind and a category.
function mapBucket(bucket, categoryNames) {
  if (categoryNames.includes(bucket) || bucket === 'Uncategorised') return { kind: 'spending', category: bucket };
  if (INVESTED_ACCOUNTS.includes(bucket) || bucket === 'Investment') return { kind: 'invested', category: bucket };
  if (OLD_TRANSFERS.includes(bucket) || OLD_NON_SPENDING.includes(bucket)) return { kind: 'internal', category: bucket };
  return { kind: 'unsure', category: String(bucket ?? '') };
}

function convertTx(t, categoryNames) {
  const date = parseDate(t.date);
  const amount = r2(Math.abs(Number(t.amount)));
  if (!date || !(amount > 0)) return null;
  return {
    id: makeId(),
    date,
    desc: String(t.desc ?? '').trim() || 'Unknown',
    amount,
    direction: 'out', // the old dashboard only tracked money going out
    ...mapBucket(t.bucket, categoryNames),
    account: String(t.bank ?? ''),
    ...(t.tag ? { tag: String(t.tag) } : {}),
    source: 'old-backup',
  };
}

function convertRules(rules, categoryNames) {
  const out = {};
  for (const [key, rule] of Object.entries(rules || {})) {
    const cat = rule && rule.cat;
    if (!key || !cat) continue;
    if (cat === '__skip') out[key] = { kind: 'internal', category: 'Transfer' };
    else if (INVESTED_ACCOUNTS.includes(cat)) out[key] = { kind: 'invested', category: cat };
    else if (categoryNames.includes(cat)) out[key] = { kind: 'spending', category: cat };
    else if (OLD_TRANSFERS.includes(cat)) out[key] = { kind: 'internal', category: cat };
  }
  return out;
}

// Reads an old backup object and returns it in the new shape, plus a plain summary. Changes nothing saved.
export function convertOldBackup(obj) {
  if (!obj || typeof obj !== 'object' || typeof obj.finS4 !== 'object' || obj.finS4 === null || !Array.isArray(obj.finTXS4)) {
    throw new Error("That doesn't look like a backup from the old dashboard.");
  }
  const s = obj.finS4;
  const cats = Array.isArray(s.cats) ? s.cats : [];
  const categoryNames = cats.map((c) => c.n);

  const transactions = [];
  let skipped = 0;
  const add = (list) => {
    for (const t of Array.isArray(list) ? list : []) {
      const tx = convertTx(t, categoryNames);
      if (tx) transactions.push(tx);
      else skipped++;
    }
  };
  add(obj.finTXS4);
  const currentCount = transactions.length;

  const hist = Array.isArray(obj.finHist4) ? obj.finHist4 : [];
  const closedMonths = hist.map((h, i) => ({
    id: String(h.id ?? i),
    label: String(h.label ?? ''),
    start: parseDate(h.start) ?? String(h.start ?? ''),
    end: parseDate(h.end) ?? String(h.end ?? ''),
  }));
  hist.forEach((h) => add(h.transactions));

  const pots = (Array.isArray(obj.finPots4) ? obj.finPots4 : [])
    .map((p) => ({ id: makeId('pot'), pot: String(p.pot ?? ''), type: p.type === 'out' ? 'out' : 'in', amount: r2(Math.abs(Number(p.amount))), date: parseDate(p.date) }))
    .filter((p) => p.pot && p.amount > 0 && p.date);

  // Everything not mapped below is kept as-is under "legacy", so later phases (net worth, ISAs) can use it.
  const { paydates, cats: _cats, budgets, buffer, rules, recurring, quick, pots: potDefs, ...legacy } = s;
  const settings = {
    paydates: (Array.isArray(paydates) ? paydates : []).map((d) => parseDate(d)).filter(Boolean),
    categories: cats.map((c) => ({ name: c.n, emoji: c.e || '', color: c.c || '' })),
    budgets: budgets && typeof budgets === 'object' ? { ...budgets } : {},
    buffer: Number(buffer) || 0,
    merchantRules: convertRules(rules, categoryNames),
    recurring: (Array.isArray(recurring) ? recurring : []).map((r) => ({
      id: String(r.id ?? makeId('rec')), name: r.name, amount: Number(r.amount) || 0, day: Number(r.day) || 1,
      freq: r.freq || 'monthly', month: Number(r.month) || 0, category: r.cat || '', account: r.acct || '', match: r.match || '',
    })),
    quick: { pinned: [...(quick?.pinned || [])], hidden: [...(quick?.hidden || [])] },
    potDefs: Array.isArray(potDefs) ? potDefs.map((p) => ({ ...p })) : [],
    legacy,
  };

  return {
    settings,
    transactions,
    closedMonths,
    pots,
    summary: {
      current: currentCount,
      closedTransactions: transactions.length - currentCount,
      closedMonths: closedMonths.length,
      skipped,
      potEntries: pots.length,
      rules: Object.keys(settings.merchantRules).length,
      payDates: settings.paydates.length,
    },
  };
}

// Adds a converted backup into existing data (the caller passes a copy). Nothing you already have is replaced.
export function mergeOldBackup(data, converted) {
  const st = data.settings;
  const inc = converted.settings;
  st.paydates = [...new Set([...st.paydates, ...inc.paydates])].sort();
  for (const c of inc.categories) if (!st.categories.some((x) => x.name === c.name)) st.categories.push(c);
  for (const [k, v] of Object.entries(inc.budgets)) if (st.budgets[k] === undefined) st.budgets[k] = v;
  if (!st.buffer) st.buffer = inc.buffer;
  for (const [k, v] of Object.entries(inc.merchantRules)) if (!st.merchantRules[k]) st.merchantRules[k] = v;
  if (!st.recurring.length) st.recurring = inc.recurring;
  st.quick.pinned = [...new Set([...st.quick.pinned, ...inc.quick.pinned])];
  st.quick.hidden = [...new Set([...st.quick.hidden, ...inc.quick.hidden])];
  if (!st.potDefs.length) st.potDefs = inc.potDefs;
  st.legacy = { ...inc.legacy, ...st.legacy };

  const dup = findDuplicates(converted.transactions, data.transactions);
  const fresh = converted.transactions.filter((_, i) => !dup[i]);
  data.transactions.push(...fresh);

  for (const m of converted.closedMonths) if (!data.closedMonths.some((x) => x.id === m.id)) data.closedMonths.push(m);
  const potKey = (p) => `${p.pot}|${p.type}|${p.amount}|${p.date}`;
  const have = new Set(data.pots.map(potKey));
  for (const p of converted.pots) if (!have.has(potKey(p))) { data.pots.push(p); have.add(potKey(p)); }

  return { added: fresh.length, duplicates: dup.filter(Boolean).length };
}

// How many entries from a converted backup are already saved? Changes nothing.
export function countOldDuplicates(data, converted) {
  return findDuplicates(converted.transactions, data.transactions).filter(Boolean).length;
}
