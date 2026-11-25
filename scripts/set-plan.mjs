// Saves a payday plan from a private JSON file in data/ (pay, payday lines, bucket budgets, reserve, sinking
// Every script signs out with scope 'local': only its own session ends, never your browser or phone.
// funds), and fills in each bill's match words from the old app's bills. Signs in as you, so RLS applies.
//
//   npm run set-plan -- data/plan-2026-11-24.json
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { planTotals } from '../src/lib/budget.js';
import { formatPence } from '../src/lib/money.js';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run set-plan -- data/plan-YYYY-MM-DD.json');
const plan = JSON.parse(readFileSync(file, 'utf8'));
const t = planTotals(plan.pay_pence, plan.items, plan.budgets);
console.log(`\nPlan for the cycle starting ${plan.cycle_start}: pay ${formatPence(t.pay)}, payday lines ${formatPence(t.items)}, budgets ${formatPence(t.buckets)}, ${t.unassigned < 0 ? 'over-assigned by' : 'left to assign'} ${formatPence(Math.abs(t.unassigned))}`);

process.loadEnvFile('.env.local');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || /secret|service_role/i.test(key)) throw new Error('.env.local needs the Supabase URL and the publishable key (never the secret key).');
const db = createClient(url, key, { auth: { persistSession: false } });
const email = await ask('Your Money HQ email: ');
const password = await ask('Your Money HQ password (hidden): ', true);
const { error: authError } = await db.auth.signInWithPassword({ email: email.trim(), password });
if (authError) throw new Error(`Sign-in failed: ${authError.message}`);
const check = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

// Cycle and budgets (buckets left out of the file have no budget this cycle).
const cycle = check(await db.from('cycles').upsert({ start_date: plan.cycle_start, end_date: plan.cycle_end }, { onConflict: 'user_id,start_date' }).select('id').single(), 'cycle');
const buckets = check(await db.from('buckets').select('id,name'), 'buckets');
for (const b of buckets) {
  if (Number.isInteger(plan.budgets[b.name])) check(await db.from('budgets').upsert({ cycle_id: cycle.id, bucket_id: b.id, amount_pence: plan.budgets[b.name] }, { onConflict: 'cycle_id,bucket_id' }), 'budget');
  else check(await db.from('budgets').delete().eq('cycle_id', cycle.id).eq('bucket_id', b.id), 'budget');
}
console.log(`Budgets saved: ${buckets.map((b) => `${b.name} ${Number.isInteger(plan.budgets[b.name]) ? formatPence(plan.budgets[b.name]) : 'none'}`).join(', ')}`);

// Settings: reserve, the plan, and keep everything else in extra.
const settings = check(await db.from('settings').select('id, extra').single(), 'settings');
const extra = { ...(settings.extra || {}), plans: { ...(settings.extra?.plans || {}), [plan.cycle_start]: { pay_pence: plan.pay_pence, items: plan.items } }, leftover: settings.extra?.leftover || {} };
check(await db.from('settings').update({ reserve_pence: plan.reserve_pence ?? 0, extra }).eq('id', settings.id), 'settings');
console.log(`Plan saved (${plan.items.length} payday lines). Reserve: ${formatPence(plan.reserve_pence ?? 0)}.`);

// Sinking funds: rename old ones, add missing ones (amounts in them are typed on the Payday plan page).
for (const [from, to] of Object.entries(plan.rename_funds || {})) check(await db.from('sinking_funds').update({ name: to }).eq('name', from), 'rename fund');
const have = new Set(check(await db.from('sinking_funds').select('name'), 'funds').map((f) => f.name));
const add = (plan.funds || []).filter((n) => !have.has(n)).map((name) => ({ name, target_pence: 0, monthly_pence: 0 }));
if (add.length) check(await db.from('sinking_funds').insert(add), 'add funds');
console.log(`Sinking funds added: ${add.map((f) => f.name).join(', ') || 'none'}`);

// Bills: the old app's match words, so Money HQ can tell when each bill has been paid.
const old = settings.extra?.legacy?.recurring || [];
let matched = 0;
for (const r of old) {
  if (!r.match) continue;
  const res = check(await db.from('recurring').update({ match: r.match }).eq('name', r.name).select('id'), 'bill');
  matched += res.length;
}
console.log(`Bills with match words: ${matched} of ${old.length}.`);
await db.auth.signOut({ scope: 'local' });

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}
