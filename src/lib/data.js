// Reading your data from Supabase. RLS means every query only ever returns your own rows.
import { supabase } from './supabase.js';

const must = ({ data, error }, what) => {
  if (error) throw new Error(`Couldn't load ${what}: ${error.message}`);
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

export async function loadSettings() {
  return must(await supabase.from('settings').select('reserve_pence, payday_usual_day, paydays').maybeSingle(), 'settings');
}

// Live (not archived) transactions between two dates, newest first, with account, category and bucket names.
export async function loadTransactions({ from, to } = {}) {
  return all(() => {
    let q = supabase
      .from('transactions')
      .select('id, date, cycle_date, amount_pence, raw_description, note, tag, kind, status, account:accounts(name), category:categories(name, bucket:buckets(name, colour))')
      .eq('archived', false)
      .order('date', { ascending: false })
      .order('id');
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    return q;
  }, 'transactions');
}

export async function countTransactions() {
  const live = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('archived', false);
  const archived = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('archived', true);
  if (live.error || archived.error) throw new Error(`Couldn't count transactions: ${(live.error || archived.error).message}`);
  return { live: live.count, archived: archived.count };
}
