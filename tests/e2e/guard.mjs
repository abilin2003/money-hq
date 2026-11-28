// Production safeguards for automated tests. Tests may only ever talk to the fake Supabase on this computer.
import { FAKE_MARKER } from './fake-supabase.mjs';

// Any hosted Supabase project (including the real one) is never a valid test target.
const PRODUCTION = [/supabase\.co/i, /supabase\.in/i];

export async function assertSafeTarget(url) {
  const u = new URL(url);
  if (PRODUCTION.some((re) => re.test(url))) throw new Error(`REFUSING TO TEST: ${url} looks like a real Supabase project. Tests only run against the fake on 127.0.0.1.`);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error(`REFUSING TO TEST: ${u.hostname} is not this computer.`);
  const res = await fetch(`${u.origin}/__test/whoami`).catch(() => null);
  const body = res && (await res.json().catch(() => null));
  if (body?.fake !== FAKE_MARKER) throw new Error(`REFUSING TO TEST: ${u.origin} isn't the fake Supabase (no test marker).`);
}

export const isProductionUrl = (url) => PRODUCTION.some((re) => re.test(url));
