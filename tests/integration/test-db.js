// Connection to the TEST Supabase project for real-database tests (Row Level Security and the SQL functions
// behave exactly as in production, but with made-up data only).
// Settings come from .env.test.local (never committed); see TESTING.md, "Real test database".
// Safeguards: refuses to run if the test address is the same as the app's real one in .env.local, if it's not a
// Supabase address, or if the test user's data contains anything that isn't clearly test data.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const read = (file) => {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
};

const test = read('.env.test.local');
const prod = read('.env.local');
const REQUIRED = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_PUBLISHABLE_KEY', 'TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_USER_B_EMAIL', 'TEST_USER_B_PASSWORD'];
const missing = REQUIRED.filter((k) => !test[k]);

export const configured = missing.length === 0;
export const notConfiguredReason = configured ? null : `Real-database tests skipped: .env.test.local is missing ${missing.join(', ')} (see TESTING.md).`;

const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
export function assertTestProject() {
  if (!configured) throw new Error(notConfiguredReason);
  if (/secret|service_role/i.test(test.TEST_SUPABASE_PUBLISHABLE_KEY)) throw new Error('REFUSING: the test key looks like a secret key. Use the publishable key only.');
  if (prod.VITE_SUPABASE_URL && host(test.TEST_SUPABASE_URL) === host(prod.VITE_SUPABASE_URL)) throw new Error('REFUSING: TEST_SUPABASE_URL is your real Money HQ project. Use the separate test project.');
  if (!/\.supabase\.co$/.test(host(test.TEST_SUPABASE_URL))) throw new Error('REFUSING: TEST_SUPABASE_URL is not a Supabase project address.');
}

// A signed-in client for test user 'A' or 'B'.
export async function signedIn(who = 'A') {
  assertTestProject();
  const client = createClient(test.TEST_SUPABASE_URL, test.TEST_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: test[`TEST_USER_${who}_EMAIL`], password: test[`TEST_USER_${who}_PASSWORD`] });
  if (error) throw new Error(`Couldn't sign in test user ${who}: ${error.message}`);
  return { client, user: data.user };
}

// Last line of defence: a test user's accounts must all be test accounts. If anything else is there, stop.
export async function assertOnlyTestData(client) {
  const { data, error } = await client.from('accounts').select('name');
  if (error) throw new Error(`Couldn't check the test data: ${error.message}`);
  const odd = (data || []).filter((a) => !/^TEST /.test(a.name));
  if (odd.length) throw new Error(`REFUSING: this test user has accounts that aren't test data (${odd.map((a) => a.name).join(', ')}).`);
}
