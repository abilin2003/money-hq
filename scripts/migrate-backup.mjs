// Moves your data from the previous app's backups into Supabase, then checks nothing was lost.
//   Live data:  the fresh-start backup (the November cycle).
//   Archive:    the full 12-month backup, rows dated before the fresh start only, marked archived.
// It signs in as you (your password is typed here and never stored), so the database's RLS rules apply.
// It never uses the secret key. Safe to run again: rows already there are skipped.
//
//   npm run migrate -- --dry-run     read and convert only, write nothing
//   npm run migrate                  move the data
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { planCategories, convertTransactions, convertHistory, convertCycles, convertSettings, totals, ACCOUNTS, BUCKETS } from '../src/lib/legacy-import.js';
import { todayLondon } from '../src/lib/dates.js';
import { formatPence } from '../src/lib/money.js';

const LIVE_FILE = 'data/money-hq-backup-fresh-start-2026-11-24.json';
const ARCHIVE_FILE = 'data/money-hq-backup-2026-11-23-full.json';
const BUDGET_CYCLES = ['2026-10-26', '2026-11-24']; // the November cycle and the current one
const dryRun = process.argv.includes('--dry-run');
const today = todayLondon();

// ---------------------------------------------------------------- read and convert (no network)
const load = (f) => {
  if (!existsSync(f)) throw new Error(`Can't find ${f}`);
  const b = JSON.parse(readFileSync(f, 'utf8'));
  return b.data || b;
};
const live = load(LIVE_FILE);
const full = load(ARCHIVE_FILE);
const liveStart = live.transactions.map((t) => t.date).sort()[0];
const archiveTx = full.transactions.filter((t) => t.date < liveStart);
const skippedOverlap = full.transactions.length - archiveTx.length;

const cats = planCategories([...live.transactions, ...archiveTx]);
const liveRows = convertTransactions(live.transactions, { archived: false, nameFor: cats.nameFor });
const archiveRows = convertTransactions(archiveTx, { archived: true, nameFor: cats.nameFor });
const allRows = [...liveRows, ...archiveRows];
const unmapped = allRows.filter((r) => !r.account);
if (unmapped.length) throw new Error(`${unmapped.length} rows have an account I don't recognise: ${[...new Set(unmapped.map((r) => r.legacy.account))].join(', ')}`);
const seen = new Set();
for (const r of allRows) { if (seen.has(r.fingerprint)) throw new Error(`Duplicate fingerprint ${r.fingerprint}`); seen.add(r.fingerprint); }

const conv = convertSettings(live.settings, live.pots || [], today);
const history = convertHistory(live.history || []);
const cycles = convertCycles(conv.settings.paydays);
const before = totals(allRows);

console.log(`\nLive (fresh start): ${liveRows.length} transactions, ${liveStart} to ${liveRows.map((r) => r.date).sort().pop()}`);
console.log(`Archive (12 months): ${archiveRows.length} transactions before ${liveStart}; ${skippedOverlap} later rows left out so the November cycle isn't counted twice`);
console.log(`Categories: ${cats.categories.size} | cycles: ${cycles.length} | old cycle summaries: ${history.length} | bills: ${conv.recurring.length} | sinking funds: ${conv.sinkingFunds.length} | rules: ${conv.rules.length}`);
console.log(`Needs review: ${allRows.filter((r) => r.status === 'needs_review').length} (live ${liveRows.filter((r) => r.status === 'needs_review').length})`);
for (const n of conv.notes) console.log(`Note: ${n}`);
printTotals('Before (from the backup files)', before);

if (dryRun) { console.log('\nDry run: nothing was written.'); process.exit(0); }

// ---------------------------------------------------------------- safety copies
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('data/safety-copies', { recursive: true });
for (const f of [LIVE_FILE, ARCHIVE_FILE]) copyFileSync(f, `data/safety-copies/${stamp}-${f.split('/').pop()}`);
console.log(`\nSafety copies saved in data/safety-copies/ (never uploaded).`);

// ---------------------------------------------------------------- sign in as you
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
console.log('Signed in.');

const check = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
const upsert = async (table, rows, onConflict) => (rows.length ? check(await db.from(table).upsert(rows.map((r) => ({ user_id: uid, ...r })), { onConflict, ignoreDuplicates: true }).select(), table) : []);
const all = async (table, columns) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await db.from(table).select(columns).order('id').range(from, from + 999), table);
    out.push(...page);
    if (page.length < 1000) return out;
  }
};
const isEmpty = async (table) => {
  const res = await db.from(table).select('id', { count: 'exact', head: true });
  if (res.error) throw new Error(`${table}: ${res.error.message}`);
  return res.count === 0;
};

// Structure first: accounts, buckets, categories.
await upsert('accounts', ACCOUNTS, 'user_id,name');
await upsert('buckets', BUCKETS, 'user_id,name');
const accountId = Object.fromEntries((await all('accounts', 'id,name')).map((a) => [a.name, a.id]));
const bucketId = Object.fromEntries((await all('buckets', 'id,name')).map((b) => [b.name, b.id]));
await upsert('categories', [...cats.categories].map(([name, bucket]) => ({ name, bucket_id: bucketId[bucket] })), 'user_id,name');
const categoryId = Object.fromEntries((await all('categories', 'id,name')).map((c) => [c.name, c.id]));

// Cycles, budgets, old summaries, settings.
await upsert('cycles', cycles, 'user_id,start_date');
const cycleId = Object.fromEntries((await all('cycles', 'id,start_date')).map((c) => [c.start_date, c.id]));
const budgetRows = BUDGET_CYCLES.filter((c) => cycleId[c]).flatMap((c) => Object.entries(conv.budgets).filter(([b]) => bucketId[b]).map(([b, pence]) => ({ cycle_id: cycleId[c], bucket_id: bucketId[b], amount_pence: pence })));
await upsert('budgets', budgetRows, 'cycle_id,bucket_id');
await upsert('cycle_summaries', history, 'user_id,start_date');
await upsert('settings', [conv.settings], 'user_id');

// Bills, sinking funds and rules have no natural key, so they are only added the first time.
if (await isEmpty('recurring')) await upsert('recurring', conv.recurring.map(({ account, legacy, ...r }) => ({ ...r, account_id: accountId[account] || null })));
if (await isEmpty('sinking_funds')) await upsert('sinking_funds', conv.sinkingFunds.map(({ account, ...f }) => ({ ...f, account_id: accountId[account] || null })));
if (await isEmpty('rules')) for (let i = 0; i < conv.rules.length; i += 500) await upsert('rules', conv.rules.slice(i, i + 500));

// Transactions, 500 at a time. The fingerprint stops anything being added twice.
const txRows = allRows.map(({ account, category, ...r }) => ({ ...r, account_id: accountId[account], category_id: category ? categoryId[category] : null }));
let added = 0;
for (let i = 0; i < txRows.length; i += 500) {
  added += (await upsert('transactions', txRows.slice(i, i + 500), 'user_id,fingerprint')).length;
  process.stdout.write(`\rTransactions: ${Math.min(i + 500, txRows.length)} of ${txRows.length} sent, ${added} new`);
}
console.log('');

// ---------------------------------------------------------------- check: what's in Supabase now
const nameOf = Object.fromEntries(Object.entries(accountId).map(([n, id]) => [id, n]));
const stored = (await all('transactions', 'id,account_id,amount_pence,kind,archived')).map((t) => ({ ...t, account: nameOf[t.account_id] }));
const after = totals(stored);
printTotals('After (read back from Supabase)', after);
const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
const diffs = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
if (diffs.length) {
  console.log(`\nMISMATCH in ${diffs.length} group(s):`);
  for (const k of diffs) console.log(`  ${k}: before ${JSON.stringify(before[k])}, after ${JSON.stringify(after[k])}`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${keys.length} groups match to the penny: ${stored.length} transactions (${stored.filter((t) => !t.archived).length} live, ${stored.filter((t) => t.archived).length} archived).`);
}
await db.auth.signOut();

// ---------------------------------------------------------------- helpers
function printTotals(title, t) {
  console.log(`\n${title}:`);
  for (const [k, v] of Object.entries(t)) console.log(`  ${k.padEnd(48)} ${String(v.count).padStart(5)}   ${formatPence(v.pence).padStart(12)}`);
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}
