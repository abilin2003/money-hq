-- Row Level Security (docs/SPEC.md section 6).
-- Every table: RLS on, and a signed-in user can only see, add, change or delete rows where user_id = their own id.
-- Signed-out visitors (the "anon" role) get no policy at all, so they see nothing.
-- The publishable key in the browser is only safe because of this file.

do $$
declare t text;
begin
  foreach t in array array['accounts', 'buckets', 'categories', 'merchants', 'people', 'cycles', 'budgets', 'cycle_summaries',
    'import_batches', 'transactions', 'splits', 'rules', 'recurring', 'sinking_funds', 'balance_snapshots', 'goals', 'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Indexes on user_id keep the policies fast.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'buckets', 'categories', 'merchants', 'people', 'cycles', 'budgets', 'cycle_summaries',
    'import_batches', 'splits', 'rules', 'recurring', 'sinking_funds', 'balance_snapshots', 'goals']
  loop
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id', t);
  end loop;
end;
$$;
