// Guards on the SQL files: every table gets RLS and all four policies, and money is never stored as a float.
// (The live proof that a signed-out client sees nothing is scripts/rls-check.mjs, run against Supabase.)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
const rlsList = (sql.match(/enable row level security[\s\S]*?$/m) && sql.split('-- Row Level Security')[1]) || '';
const listed = [...(rlsList.match(/foreach t in array array\[([^\]]+)\]/) || [])[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);

describe('migrations', () => {
  it('creates all the tables from the spec', () => {
    for (const t of ['accounts', 'transactions', 'merchants', 'buckets', 'categories', 'budgets', 'cycles', 'rules', 'people', 'splits',
      'recurring', 'sinking_funds', 'balance_snapshots', 'goals', 'import_batches', 'settings']) expect(tables).toContain(t);
  });
  it('turns on RLS with own-rows policies for every table it creates', () => {
    expect([...listed].sort()).toEqual([...tables].sort());
    expect(rlsList).toMatch(/enable row level security/);
    for (const verb of ['select', 'insert', 'update', 'delete']) expect(rlsList).toMatch(new RegExp(`for ${verb} to authenticated`));
  });
  it('gives every table a user_id that defaults to the signed-in user', () => {
    for (const t of tables) {
      const body = sql.split(`create table public.${t} (`)[1].split(/\n\);/)[0];
      expect(body, t).toMatch(/user_id uuid not null default auth\.uid\(\)/);
      expect(body, t).toMatch(/created_at timestamptz/);
      expect(body, t).toMatch(/updated_at timestamptz/);
    }
  });
  it('stores money only as whole pence', () => {
    expect(sql).not.toMatch(/\b(real|double precision|float)\b/i);
    for (const m of sql.matchAll(/(\w+_pence)\s+(\w+)/g)) expect(m[2], m[1]).toBe('bigint');
  });
  it('lets signed-in users use the tables, and never signed-out visitors', () => {
    expect(sql).toMatch(/grant select, insert, update, delete on all tables in schema public to authenticated/);
    expect(sql).toMatch(/revoke all on all tables in schema public from anon/);
    expect(sql).not.toMatch(/grant[^;]*to anon/i);
  });
  it('makes importing the same row twice impossible', () => {
    expect(sql).toMatch(/unique \(user_id, fingerprint\)/);
  });
});
