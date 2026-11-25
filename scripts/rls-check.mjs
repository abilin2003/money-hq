// Proves that a signed-out visitor can't read or add anything (docs/SPEC.md section 6).
// It uses only the publishable key from .env.local, exactly like a stranger loading the public site would.
// Run with: npm run rls-check
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

process.loadEnvFile('.env.local');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be in .env.local');
if (/secret|service_role/i.test(key)) throw new Error('That looks like a secret key. Use the publishable key only.');

// Every table the migrations create.
const sql = ['0001_schema.sql'].map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')).join('\n');
const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Only a real permission refusal counts as a pass. Any other error (a wrong key, no internet, a missing table,
// or an insert failing on a required column after the permission checks) means the check didn't really run.
export const refused = (res) => Boolean(res.error) && (res.error.code === '42501' || /permission denied|row-level security/i.test(res.error.message));

let failures = 0;
for (const table of tables) {
  const read = await anon.from(table).select('*').limit(1);
  const add = await anon.from(table).insert({});
  const readOk = refused(read) || (!read.error && read.data.length === 0);
  const addOk = refused(add);
  const why = (res) => (res.error ? (refused(res) ? 'refused' : `NOT TESTED (${res.error.message})`) : null);
  console.log(`${readOk && addOk ? 'OK' : 'FAIL'}  ${table}: read ${why(read) || `${read.data.length} rows`}, add ${why(add) || 'ALLOWED'}`);
  if (!readOk || !addOk) failures++;
}
console.log(failures ? `\n${failures} problem(s). Do not put real data in until this passes.` : `\nAll ${tables.length} tables: a signed-out visitor sees nothing and can add nothing.`);
process.exitCode = failures ? 1 : 0;
