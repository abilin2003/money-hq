// Reading and saving your data in Supabase. RLS means every query only ever touches your own rows.
import { supabase } from './supabase.js';

const must = ({ data, error }, what) => {
  if (error) throw new Error(`Couldn't ${what}: ${error.message}`);
  return data;
};

// All rows of a query, 1,000 at a time (Supabase returns at most 1,000 per request).
async function all(build, what) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await build().range(from, from + 999), what);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const TX_COLUMNS = 'id, date, cycle_date, amount_pence, raw_description, note, tag, kind, status, archived, source, fingerprint, account_id, category_id, transfer_pair_id, from_savings, legacy';

// Everything the app needs, loaded once after sign-in. Names are joined in here rather than in every query.
export async function loadEverything() {
  const [settings, accounts, buckets, categories, cycles, budgets, rules, txs, bills, funds, people, splits, snapshots, goals] = await Promise.all([
    supabase.from('settings').select('id, reserve_pence, payday_usual_day, paydays, extra').maybeSingle().then((r) => must(r, 'load settings')),
    supabase.from('accounts').select('id, name, type, institution, is_active').order('name').then((r) => must(r, 'load accounts')),
    supabase.from('buckets').select('id, name, colour, sort_order').order('sort_order').then((r) => must(r, 'load buckets')),
    supabase.from('categories').select('id, name, bucket_id, is_active').order('name').then((r) => must(r, 'load categories')),
    supabase.from('cycles').select(CYCLE_COLUMNS).order('start_date').then((r) => must(r, 'load cycles')),
    supabase.from('budgets').select('cycle_id, bucket_id, amount_pence').then((r) => must(r, 'load budgets')),
    all(() => supabase.from('rules').select('id, match, set, priority, created_from').order('id'), 'load rules'),
    all(() => supabase.from('transactions').select(TX_COLUMNS).order('date', { ascending: false }).order('id'), 'load transactions'),
    supabase.from('recurring').select(BILL_COLUMNS).order('name').then((r) => must(r, 'load bills')),
    supabase.from('sinking_funds').select(FUND_COLUMNS).order('name').then((r) => must(r, 'load sinking funds')),
    supabase.from('people').select('id, name').order('name').then((r) => must(r, 'load people')),
    supabase.from('splits').select(SPLIT_COLUMNS).then((r) => must(r, 'load splits')),
    supabase.from('balance_snapshots').select(SNAP_COLUMNS).order('date').then((r) => must(r, 'load balances')),
    supabase.from('goals').select(GOAL_COLUMNS).order('priority').then((r) => must(r, 'load goals')),
  ]);
  const ref = { settings, accounts, buckets, categories, cycles, budgets, rules, bills, funds, people, splits, snapshots, goals };
  return { ref, all: txs.map((t) => enrich(t, ref)) };
}

// Adds account, category and bucket names (and the bucket colour) to a transaction row.
export function enrich(t, ref) {
  const account = ref.accounts.find((a) => a.id === t.account_id);
  const category = ref.categories.find((c) => c.id === t.category_id);
  let bucket = category ? ref.buckets.find((b) => b.id === category.bucket_id) : null;
  // A friend's payback comes off the bucket it was for. Paybacks brought from the old app kept that bucket in
  // their original record, so use it when the payback has no category of its own.
  if (!bucket && t.kind === 'repayment' && t.legacy?.bucket) bucket = ref.buckets.find((b) => b.name === t.legacy.bucket) || null;
  return { ...t, accountType: account?.type || null, accountName: account?.name || 'Unknown account', account: account?.name, category: category?.name || null, bucket: bucket?.name || null, colour: bucket?.colour || null };
}

// Saves new imported rows (already checked for duplicates) and links transfer pairs.
// rows: [{ id, account_id, date, amount_pence, raw_description, note, kind, status, category_id, fingerprint, source, pairId }]
export async function saveImport(rows, batch) {
  const b = must(await supabase.from('import_batches').insert(batch).select('id').single(), 'save the import');
  const clean = rows.map(({ pairId, ...r }) => ({ ...r, import_batch_id: b.id }));
  const saved = [];
  for (let i = 0; i < clean.length; i += 500) {
    saved.push(...must(await supabase.from('transactions').upsert(clean.slice(i, i + 500), { onConflict: 'user_id,fingerprint', ignoreDuplicates: true }).select(TX_COLUMNS), 'save transactions'));
  }
  // Link each transfer to its other half (done after both halves exist).
  const ids = new Set(saved.map((t) => t.id));
  for (const r of rows) {
    if (r.pairId && ids.has(r.id) && ids.has(r.pairId)) must(await supabase.from('transactions').update({ transfer_pair_id: r.pairId }).eq('id', r.id), 'link transfers');
  }
  return saved.map((t) => ({ ...t, transfer_pair_id: rows.find((r) => r.id === t.id)?.pairId || null }));
}

export async function updateTransaction(id, patch) {
  return must(await supabase.from('transactions').update(patch).eq('id', id).select(TX_COLUMNS).single(), 'save the change');
}

// "Always do this for <shop>": a learned rule, tried before any rule from the old app.
export async function addLearnedRule(key, direction, set) {
  return must(await supabase.from('rules').insert({ match: { description_contains: key, direction }, set, priority: 100, created_from: 'learned' }).select('id, match, set, priority, created_from').single(), 'save the rule');
}

const CYCLE_COLUMNS = 'id, start_date, end_date, closed_at, report';

// Closing after a review: the report (figures, breakdowns, narrative and your notes) is kept on the cycle's row.
// Nothing else changes: transactions are never moved or edited by closing.
export async function closeCycleWithReport(cycle, report) {
  return must(await supabase.from('cycles').upsert({ start_date: cycle.start, end_date: cycle.end, closed_at: new Date().toISOString(), report }, { onConflict: 'user_id,start_date' }).select(CYCLE_COLUMNS).single(), 'close the cycle');
}
// Saving a refreshed version next to the original (the original is never overwritten).
export async function saveCycleReport(id, report) {
  return must(await supabase.from('cycles').update({ report }).eq('id', id).select(CYCLE_COLUMNS).single(), 'save the report');
}

export async function closeCycle(cycle) {
  return must(await supabase.from('cycles').upsert({ start_date: cycle.start, end_date: cycle.end, closed_at: new Date().toISOString() }, { onConflict: 'user_id,start_date' }).select(CYCLE_COLUMNS).single(), 'close the cycle');
}

export async function reopenCycle(id) {
  return must(await supabase.from('cycles').update({ closed_at: null }).eq('id', id).select(CYCLE_COLUMNS).single(), 'reopen the cycle');
}

// ---------------------------------------------------------------- Phase 4: budgets, plan, bills, funds
const BILL_COLUMNS = 'id, name, amount_pence, cadence, next_date, match, account_id, category_id, is_active';
const FUND_COLUMNS = 'id, name, target_pence, due_date, monthly_pence, balance_pence, balance_date, account_id';

// Makes sure the cycle has a row (so budgets can hang off it) and returns it.
export async function ensureCycle(cycle) {
  return must(await supabase.from('cycles').upsert({ start_date: cycle.start, end_date: cycle.end }, { onConflict: 'user_id,start_date' }).select(CYCLE_COLUMNS).single(), 'save the cycle');
}

// budgets: { bucket_id: pence or null }. null (or empty) removes that bucket's budget for the cycle.
export async function saveBudgets(cycleId, budgets) {
  const keep = Object.entries(budgets).filter(([, p]) => Number.isInteger(p) && p >= 0).map(([bucket_id, amount_pence]) => ({ cycle_id: cycleId, bucket_id, amount_pence }));
  const drop = Object.entries(budgets).filter(([, p]) => p === null).map(([id]) => id);
  if (keep.length) must(await supabase.from('budgets').upsert(keep, { onConflict: 'cycle_id,bucket_id' }), 'save budgets');
  if (drop.length) must(await supabase.from('budgets').delete().eq('cycle_id', cycleId).in('bucket_id', drop), 'remove budgets');
  return must(await supabase.from('budgets').select('cycle_id, bucket_id, amount_pence'), 'load budgets');
}

// Settings: reserve and the `extra` JSON (payday plans, leftover choices). Merges into what's there.
export async function saveSettings(settings, patch) {
  const next = { ...patch, extra: { ...(settings?.extra || {}), ...(patch.extra || {}) } };
  return must(await supabase.from('settings').upsert({ ...(settings?.id ? { id: settings.id } : {}), reserve_pence: settings?.reserve_pence ?? 0, ...next }, { onConflict: 'user_id' }).select('id, reserve_pence, payday_usual_day, paydays, extra').single(), 'save settings');
}

export async function saveBill(bill) {
  const { id, ...rest } = bill;
  const q = id ? supabase.from('recurring').update(rest).eq('id', id) : supabase.from('recurring').insert(rest);
  return must(await q.select(BILL_COLUMNS).single(), 'save the bill');
}

export async function saveFund(fund) {
  const { id, ...rest } = fund;
  const q = id ? supabase.from('sinking_funds').update(rest).eq('id', id) : supabase.from('sinking_funds').insert(rest);
  return must(await q.select(FUND_COLUMNS).single(), 'save the fund');
}

export async function saveCategory(cat) {
  const { id, ...rest } = cat;
  const q = id ? supabase.from('categories').update(rest).eq('id', id) : supabase.from('categories').insert(rest);
  return must(await q.select('id, name, bucket_id, is_active').single(), 'save the category');
}

// ---------------------------------------------------------------- the rest: transactions, IOUs, wealth, goals, backups
const SPLIT_COLUMNS = 'id, transaction_id, person_id, amount_pence, settled_by_transaction_id';
const SNAP_COLUMNS = 'id, account_id, date, balance_pence';
const GOAL_COLUMNS = 'id, name, target_pence, target_date, account_id, sinking_fund_id, monthly_pence, growth_rate, priority';

// A transaction typed in by hand (quick add). Its fingerprint is unique, so it never collides with a bank line;
// when the bank file arrives later, the importer matches it loosely (same account and amount, within 3 days).
export async function addTransaction(t) {
  const id = crypto.randomUUID();
  return must(await supabase.from('transactions').insert({ id, status: 'reviewed', source: 'manual', fingerprint: `manual|${id}`, ...t }).select(TX_COLUMNS).single(), 'save the transaction');
}
export async function deleteTransaction(id) {
  must(await supabase.from('transactions').delete().eq('id', id), 'delete the transaction');
}

export async function addPerson(name) {
  return must(await supabase.from('people').upsert({ name }, { onConflict: 'user_id,name' }).select('id, name').single(), 'save the person');
}
export async function addSplit(split) {
  return must(await supabase.from('splits').insert(split).select(SPLIT_COLUMNS).single(), 'save the split');
}
export async function removeSplit(id) {
  must(await supabase.from('splits').delete().eq('id', id), 'remove the split');
}
export async function settleSplit(id, txId) {
  return must(await supabase.from('splits').update({ settled_by_transaction_id: txId }).eq('id', id).select(SPLIT_COLUMNS).single(), 'link the repayment');
}

export async function addSnapshot(accountId, date, balance_pence) {
  return must(await supabase.from('balance_snapshots').upsert({ account_id: accountId, date, balance_pence }, { onConflict: 'account_id,date' }).select(SNAP_COLUMNS).single(), 'save the balance');
}
export async function saveAccount(account) {
  const { id, ...rest } = account;
  const q = id ? supabase.from('accounts').update(rest).eq('id', id) : supabase.from('accounts').insert(rest);
  return must(await q.select('id, name, type, institution, is_active').single(), 'save the account');
}
export async function saveGoal(goal) {
  const { id, ...rest } = goal;
  const q = id ? supabase.from('goals').update(rest).eq('id', id) : supabase.from('goals').insert(rest);
  return must(await q.select(GOAL_COLUMNS).single(), 'save the goal');
}
export async function deleteGoal(id) {
  must(await supabase.from('goals').delete().eq('id', id), 'delete the goal');
}

// Backups: every table, as JSON. Restore adds back anything missing (by id) and never deletes.
export const BACKUP_TABLES = ['accounts', 'buckets', 'categories', 'merchants', 'people', 'import_batches', 'cycles', 'budgets', 'cycle_summaries', 'transactions', 'splits', 'rules', 'recurring', 'sinking_funds', 'balance_snapshots', 'goals', 'settings'];
export async function exportAll() {
  const out = { app: 'money-hq', version: 2, exported: new Date().toISOString(), tables: {} };
  for (const t of BACKUP_TABLES) out.tables[t] = await all(() => supabase.from(t).select('*').order('id'), `back up ${t}`);
  return out;
}
export async function restoreAll(backup) {
  if (backup?.app !== 'money-hq' || !backup.tables) throw new Error('That isn’t a Money HQ backup.');
  const counts = {};
  for (const t of BACKUP_TABLES) {
    // transfer pairs and salary links point at other rows, so they're added after everything exists
    const rows = (backup.tables[t] || []).map(({ user_id, transfer_pair_id, salary_transaction_id, ...r }) => r);
    for (let i = 0; i < rows.length; i += 500) must(await supabase.from(t).upsert(rows.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: true }), `restore ${t}`);
    counts[t] = rows.length;
  }
  for (const r of backup.tables.transactions || []) if (r.transfer_pair_id) await supabase.from('transactions').update({ transfer_pair_id: r.transfer_pair_id }).eq('id', r.id);
  return counts;
}
