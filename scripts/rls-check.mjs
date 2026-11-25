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
let failures = 0;
for (const table of tables) {
  const read = await anon.from(table).select('*').limit(1);
  const readOk = read.error ? !/does not exist|schema cache/i.test(read.error.message) : read.data.length === 0;
  const add = await anon.from(table).insert({});
  const addOk = Boolean(add.error) && !/does not exist|schema cache/i.test(add.error.message);
  if (read.error && /does not exist|schema cache/i.test(read.error.message)) {
    console.log(`?  ${table}: table not found. Have the migrations been run?`);
    failures++;
    continue;
  }
  console.log(`${readOk && addOk ? 'OK' : 'FAIL'}  ${table}: read ${read.error ? 'refused' : `${read.data.length} rows`}, add ${add.error ? 'refused' : 'ALLOWED'}`);
  if (!readOk || !addOk) failures++;
}
console.log(failures ? `\n${failures} problem(s). Do not put real data in until this passes.` : `\nAll ${tables.length} tables: a signed-out visitor sees nothing and can add nothing.`);
process.exitCode = failures ? 1 : 0;
