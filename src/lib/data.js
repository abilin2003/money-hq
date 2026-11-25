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

const TX_COLUMNS = 'id, date, cycle_date, amount_pence, raw_description, note, tag, kind, status, archived, source, fingerprint, account_id, category_id, transfer_pair_id';

// Everything the app needs, loaded once after sign-in. Names are joined in here rather than in every query.
export async function loadEverything() {
  const [settings, accounts, buckets, categories, cycles, budgets, rules, txs] = await Promise.all([
    supabase.from('settings').select('reserve_pence, payday_usual_day, paydays').maybeSingle().then((r) => must(r, 'load settings')),
    supabase.from('accounts').select('id, name, type').order('name').then((r) => must(r, 'load accounts')),
    supabase.from('buckets').select('id, name, colour, sort_order').order('sort_order').then((r) => must(r, 'load buckets')),
    supabase.from('categories').select('id, name, bucket_id, is_active').order('name').then((r) => must(r, 'load categories')),
    supabase.from('cycles').select('id, start_date, end_date, closed_at').order('start_date').then((r) => must(r, 'load cycles')),
    supabase.from('budgets').select('cycle_id, bucket_id, amount_pence').then((r) => must(r, 'load budgets')),
    all(() => supabase.from('rules').select('id, match, set, priority, created_from').order('id'), 'load rules'),
    all(() => supabase.from('transactions').select(TX_COLUMNS).order('date', { ascending: false }).order('id'), 'load transactions'),
  ]);
  const ref = { settings, accounts, buckets, categories, cycles, budgets, rules };
  return { ref, all: txs.map((t) => enrich(t, ref)) };
}

// Adds account, category and bucket names (and the bucket colour) to a transaction row.
export function enrich(t, ref) {
  const account = ref.accounts.find((a) => a.id === t.account_id);
  const category = ref.categories.find((c) => c.id === t.category_id);
  const bucket = category ? ref.buckets.find((b) => b.id === category.bucket_id) : null;
  return { ...t, accountName: account?.name || 'Unknown account', account: account?.name, category: category?.name || null, bucket: bucket?.name || null, colour: bucket?.colour || null };
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

export async function closeCycle(cycle) {
  return must(await supabase.from('cycles').upsert({ start_date: cycle.start, end_date: cycle.end, closed_at: new Date().toISOString() }, { onConflict: 'user_id,start_date' }).select('id, start_date, end_date, closed_at').single(), 'close the cycle');
}

export async function reopenCycle(id) {
  return must(await supabase.from('cycles').update({ closed_at: null }).eq('id', id).select('id, start_date, end_date, closed_at').single(), 'reopen the cycle');
}
