// Applies the 16 agreed categories (src/lib/categories.js) to every transaction moved from the old app.
// Each row's new category comes from its original label and bucket (kept in transactions.legacy), so it can
// be run again safely. Old categories are kept but marked inactive, so nothing is deleted.
// It signs in as you, so RLS applies. It never uses the secret key.
//
//   npm run merge-categories -- --dry-run     show what would change, write nothing
//   npm run merge-categories                  apply it
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';
import { CATEGORIES, mapCategory, bucketOfCategory } from '../src/lib/categories.js';

const dryRun = process.argv.includes('--dry-run');
process.loadEnvFile('.env.local');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || /secret|service_role/i.test(key)) throw new Error('.env.local needs the Supabase URL and the publishable key (never the secret key).');
const db = createClient(url, key, { auth: { persistSession: false } });

const email = await ask('Your Money HQ email: ');
const password = await ask('Your Money HQ password (hidden): ', true);
const { data: auth, error: authError } = await db.auth.signInWithPassword({ email: email.trim(), password });
if (authError) throw new Error(`Sign-in failed: ${authError.message}`);
const uid = auth.user.id;

const check = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
const all = async (table, columns) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await db.from(table).select(columns).order('id').range(from, from + 999), table);
    out.push(...page);
    if (page.length < 1000) return out;
  }
};

const buckets = Object.fromEntries((await all('buckets', 'id,name')).map((b) => [b.name, b.id]));
const oldCats = await all('categories', 'id,name,bucket:buckets(name)');
const oldName = Object.fromEntries(oldCats.map((c) => [c.id, c.name]));
const txs = await all('transactions', 'id,kind,status,archived,category_id,legacy');

// Work out each row's new category.
const plan = new Map(); // new category name (or '') -> [ids]
let unchanged = 0;
let bucketMoves = 0;
const noCategoryLive = [];
for (const t of txs) {
  const spendLike = ['spend', 'refund'].includes(t.kind);
  const target = spendLike && t.legacy ? mapCategory(t.legacy.detail, t.legacy.bucket) : null;
  if (!spendLike) continue; // transfers, income, investing, paybacks keep no category
  if (oldName[t.category_id] === target) { unchanged++; continue; }
  if (target && t.legacy?.bucket && bucketOfCategory[target] !== t.legacy.bucket) bucketMoves++;
  if (!target && !t.archived) noCategoryLive.push(t);
  const k = target || '';
  if (!plan.has(k)) plan.set(k, []);
  plan.get(k).push(t.id);
}

console.log(`\nTransactions: ${txs.length} (${txs.filter((t) => !t.archived).length} live)`);
for (const c of CATEGORIES) console.log(`  ${c.name.padEnd(24)} ${c.bucket.padEnd(16)} ${String((plan.get(c.name) || []).length).padStart(5)} rows to move here`);
console.log(`  ${'(no category)'.padEnd(41)} ${String((plan.get('') || []).length).padStart(5)} rows (${noCategoryLive.length} live; these show in the review inbox)`);
console.log(`Already right: ${unchanged}. Rows whose bucket changes (e.g. fuel from Essentials to Fuel): ${bucketMoves}.`);
console.log(`Old categories to mark inactive: ${oldCats.filter((c) => !bucketOfCategory[c.name]).length} (kept, not deleted)`);
if (dryRun) { console.log('\nDry run: nothing was written.'); await db.auth.signOut(); process.exit(0); }

// 1. The 16 categories, each in its bucket (existing ones with the same name are moved to the right bucket).
check(await db.from('categories').upsert(CATEGORIES.map((c) => ({ user_id: uid, name: c.name, bucket_id: buckets[c.bucket], is_active: true })), { onConflict: 'user_id,name' }), 'categories');
const catId = Object.fromEntries((await all('categories', 'id,name')).map((c) => [c.name, c.id]));

// 2. Re-label transactions, 200 at a time. Live spending rows left without a category go to the inbox.
let done = 0;
for (const [name, ids] of plan) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    check(await db.from('transactions').update({ category_id: name ? catId[name] : null }).in('id', chunk), 'transactions');
    done += chunk.length;
    process.stdout.write(`\rRe-labelled ${done} rows`);
  }
}
const toInbox = noCategoryLive.filter((t) => t.status !== 'needs_review').map((t) => t.id);
if (toInbox.length) check(await db.from('transactions').update({ status: 'needs_review' }).in('id', toInbox), 'transactions');
console.log(`\n${toInbox.length} live rows without a category sent to the review inbox.`);

// 3. Old categories: inactive, not deleted (history keeps its labels in transactions.legacy).
const stale = oldCats.filter((c) => !bucketOfCategory[c.name]).map((c) => c.id);
if (stale.length) check(await db.from('categories').update({ is_active: false }).in('id', stale), 'categories');

// 4. Check: every live spending row has one of the 16 categories or is in the inbox.
const after = await all('transactions', 'id,kind,status,archived,category:categories(name,is_active)');
const bad = after.filter((t) => !t.archived && ['spend', 'refund'].includes(t.kind) && t.status !== 'needs_review' && !(t.category && bucketOfCategory[t.category.name]));
console.log(bad.length ? `CHECK FAILED: ${bad.length} live spending rows have no new category.` : 'Check passed: every live spending row has one of the 16 categories or is waiting in the inbox.');
process.exitCode = bad.length ? 1 : 0;
await db.auth.signOut();

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}
