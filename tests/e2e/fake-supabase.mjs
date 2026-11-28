// A fake Supabase for automated tests: a tiny server on this computer that answers the same requests the app
// makes (sign-in, the tables, the save-a-purchase-with-IOUs function), keeping everything in memory.
// It only ever holds made-up data, it starts empty on every run, and it refuses to listen anywhere but
// 127.0.0.1. Nothing here can reach your real Supabase project.
//
// It mimics only what Money HQ uses: select / insert / update / upsert / delete with eq and in filters, order,
// limit and range, single rows, and the add_purchase_with_ious function (all or nothing, like the real one).
// It does NOT check Row Level Security or run the real SQL: see TESTING.md for what that means.
//
// Test-only endpoints (used by the browser tests): POST /__test/reset, GET /__test/state,
// POST /__test/seed, POST /__test/fail { table, method } (makes the next matching request fail).
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { seedData, TEST_USER } from './seed.mjs';

export const FAKE_MARKER = 'money-hq-fake-supabase';

// Unique keys, for upserts (on_conflict) and to refuse duplicates like the real database.
const UNIQUE = {
  transactions: [['user_id', 'fingerprint']], people: [['user_id', 'name']], accounts: [['user_id', 'name']],
  balance_snapshots: [['account_id', 'date']], cycles: [['user_id', 'start_date']], budgets: [['cycle_id', 'bucket_id']],
  settings: [['user_id']], buckets: [['user_id', 'name']], categories: [['user_id', 'name']],
};
const DEFAULTS = {
  transactions: { status: 'needs_review', archived: false, from_savings: false, cycle_date: null, note: null, tag: null, transfer_pair_id: null, fund_id: null, bank: null, review: null, import_batch_id: null, legacy: null, category_id: null, source: null },
  splits: { settled_by_transaction_id: null, due_date: null, note: null },
  accounts: { is_active: true, institution: null, import_format: 'manual' },
  sinking_funds: { balance_pence: 0, balance_date: null, account_id: null, target_pence: 0, monthly_pence: 0, due_date: null },
};

export function createFakeSupabase() {
  let db = {};
  let failNext = null;
  const reset = () => { db = structuredClone(seedData()); failNext = null; };
  reset();
  const table = (name) => (db[name] ||= []);

  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'x-fake': FAKE_MARKER, ...cors, ...extra });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range' };
  const pgError = (res, status, message, code = 'P0001') => json(res, status, { message, code, details: null, hint: null });

  // ?col=eq.value / ?col=in.(a,b) / ?col=is.null
  const filtersOf = (params) => {
    const out = [];
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const m = /^(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/s.exec(v);
      if (m) out.push([k, m[1], m[2]]);
    }
    return out;
  };
  const cast = (row, col, raw) => (typeof row[col] === 'number' ? Number(raw) : typeof row[col] === 'boolean' ? raw === 'true' : raw);
  const matches = (row, filters) => filters.every(([col, op, raw]) => {
    const v = row[col];
    if (op === 'is') return raw === 'null' ? v === null || v === undefined : String(v) === raw;
    if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).some((x) => String(v) === x);
    const c = cast(row, col, raw);
    return op === 'eq' ? String(v) === String(c) : op === 'neq' ? String(v) !== String(c) : op === 'gte' ? v >= c : op === 'lte' ? v <= c : op === 'gt' ? v > c : v < c;
  });
  const sortRows = (rows, order) => {
    if (!order) return rows;
    const keys = order.split(',').map((o) => { const [col, dir] = o.split('.'); return [col, dir === 'desc' ? -1 : 1]; });
    return [...rows].sort((a, b) => { for (const [c, d] of keys) { if (a[c] === b[c]) continue; return (a[c] > b[c] ? 1 : -1) * d; } return 0; });
  };
  const fill = (name, row) => ({ id: randomUUID(), user_id: TEST_USER.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(DEFAULTS[name] || {}), ...row });
  const conflictOf = (name, row, onConflict) => {
    const keys = onConflict ? [onConflict.split(',')] : (UNIQUE[name] || []);
    for (const cols of keys) { const hit = table(name).find((r) => cols.every((c) => r[c] === row[c])); if (hit) return hit; }
    return null;
  };

  // The save-a-purchase-with-IOUs function, with the same checks as supabase/migrations/0012: all or nothing.
  function addPurchaseWithIous({ tx, ious }) {
    const list = ious || [];
    let owed = 0;
    for (const i of list) { if (!(Number(i.amount_pence) > 0) || !String(i.name || '').trim()) throw new Error('Each person needs a name and an amount'); owed += Number(i.amount_pence); }
    if (!(Number(tx.amount_pence) < 0) || owed > -Number(tx.amount_pence)) throw new Error('What others owe can\'t be more than the purchase');
    for (const i of list) if (i.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(i.due_date)) throw new Error(`invalid input syntax for type date: "${i.due_date}"`);
    const snapshot = structuredClone(db);
    try {
      const id = tx.id || randomUUID();
      table('transactions').push(fill('transactions', { id, account_id: tx.account_id, date: tx.date, amount_pence: Number(tx.amount_pence), raw_description: tx.raw_description || '', note: tx.note || null, kind: 'spend', status: 'reviewed', category_id: tx.category_id || null, tag: tx.tag || null, from_savings: Boolean(tx.from_savings), fund_id: tx.fund_id || null, fingerprint: `manual|${id}`, source: 'manual' }));
      for (const i of list) {
        const name = String(i.name).trim();
        let p = table('people').find((x) => x.name === name);
        if (!p) { p = fill('people', { name }); table('people').push(p); }
        table('splits').push(fill('splits', { transaction_id: id, person_id: p.id, amount_pence: Number(i.amount_pence), due_date: i.due_date || null, note: i.note || null }));
      }
      return id;
    } catch (e) { db = snapshot; throw e; }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : null;
    const path = url.pathname;

    // ---- test controls
    if (path === '/__test/whoami') return json(res, 200, { fake: FAKE_MARKER });
    if (path === '/__test/reset') { reset(); return json(res, 200, { ok: true }); }
    if (path === '/__test/state') return json(res, 200, db);
    if (path === '/__test/seed') { for (const [t, rows] of Object.entries(data || {})) table(t).push(...rows.map((r) => fill(t, r))); return json(res, 200, { ok: true }); }
    if (path === '/__test/fail') { failNext = data; return json(res, 200, { ok: true }); }

    // ---- auth
    if (path === '/auth/v1/health') return json(res, 200, { name: 'GoTrue (fake)' });
    if (path === '/auth/v1/token') {
      if (data?.email !== TEST_USER.email || data?.password !== TEST_USER.password) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      const now = Math.floor(Date.now() / 1000);
      return json(res, 200, { access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'fake-refresh-token', user: { id: TEST_USER.id, email: TEST_USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
    }
    if (path === '/auth/v1/user') return json(res, 200, { id: TEST_USER.id, email: TEST_USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
    if (path === '/auth/v1/logout') return json(res, 204);

    // ---- database
    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(path);
    if (!m) return json(res, 404, { message: `Not in the fake: ${path}` });
    const [, rpc, name] = m;
    if (failNext && (!failNext.table || failNext.table === name) && (!failNext.method || failNext.method === req.method)) {
      failNext = null;
      return pgError(res, 500, 'Simulated database failure (test)');
    }
    if (rpc) {
      if (name !== 'add_purchase_with_ious') return pgError(res, 404, `No such function: ${name}`);
      try { return json(res, 200, addPurchaseWithIous(data)); } catch (e) { return pgError(res, 400, e.message); }
    }
    const params = url.searchParams;
    const filters = filtersOf(params);
    const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
    const prefer = req.headers.prefer || '';
    const wantRows = /return=representation/.test(prefer);
    const reply = (rows, status = 200) => {
      if (single) return rows.length === 1 ? json(res, status, rows[0]) : pgError(res, 406, `JSON object requested, multiple (or no) rows returned (${rows.length})`, 'PGRST116');
      return json(res, status, rows);
    };

    if (req.method === 'GET') {
      let rows = sortRows(table(name).filter((r) => matches(r, filters)), params.get('order'));
      const range = /(\d+)-(\d+)/.exec(req.headers.range || '');
      const offset = Number(params.get('offset') ?? range?.[1] ?? 0);
      const limit = params.get('limit') !== null ? Number(params.get('limit')) : range ? Number(range[2]) - Number(range[1]) + 1 : Infinity;
      rows = rows.slice(offset, offset + limit);
      return reply(rows);
    }
    if (req.method === 'POST') {
      const incoming = Array.isArray(data) ? data : [data];
      const upsert = /resolution=(merge|ignore)-duplicates/.exec(prefer);
      const out = [];
      for (const r of incoming) {
        const hit = conflictOf(name, { user_id: TEST_USER.id, ...r }, params.get('on_conflict'));
        if (hit && upsert?.[1] === 'ignore') continue;
        if (hit && upsert?.[1] === 'merge') { Object.assign(hit, r, { updated_at: new Date().toISOString() }); out.push(hit); continue; }
        if (hit) return pgError(res, 409, `duplicate key value violates unique constraint on ${name}`, '23505');
        const row = fill(name, r);
        table(name).push(row);
        out.push(row);
      }
      return wantRows ? reply(out, 201) : json(res, 201);
    }
    if (req.method === 'PATCH') {
      const rows = table(name).filter((r) => matches(r, filters));
      for (const r of rows) Object.assign(r, data, { updated_at: new Date().toISOString() });
      return wantRows ? reply(rows) : json(res, 204);
    }
    if (req.method === 'DELETE') {
      const gone = table(name).filter((r) => matches(r, filters));
      db[name] = table(name).filter((r) => !gone.includes(r));
      if (name === 'transactions') db.splits = table('splits').filter((s) => !gone.some((t) => t.id === s.transaction_id)); // on delete cascade
      return wantRows ? reply(gone) : json(res, 204);
    }
    return json(res, 405, { message: 'Method not allowed' });
  };

  return { handler, reset, state: () => db };
}

// Run on its own: node tests/e2e/fake-supabase.mjs [port]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/e2e/fake-supabase.mjs')) {
  const port = Number(process.argv[2] || 54329);
  const fake = createFakeSupabase();
  http.createServer((req, res) => fake.handler(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }))
    .listen(port, '127.0.0.1', () => console.log(`Fake Supabase (test data only) on http://127.0.0.1:${port}`));
}
