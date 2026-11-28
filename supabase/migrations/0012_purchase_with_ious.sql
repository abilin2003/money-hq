-- Purchases with IOUs (Part 2: "Who is this purchase for?"). Additive only.
-- An IOU can say when you expect to be paid back and what it was for.
alter table public.splits add column if not exists due_date date;
alter table public.splits add column if not exists note text;

-- Save a purchase and the IOUs it creates in one go: a database function runs as a single transaction, so either
-- the purchase and every IOU are saved, or none of them is (never a purchase with half its IOUs).
-- security invoker: it runs as you, so Row Level Security applies exactly as it does to the app.
-- tx: { id, account_id, date, amount_pence (negative), raw_description, note, category_id, tag, from_savings, fund_id }
-- ious: [{ name, amount_pence (positive), due_date, note }]
create or replace function public.add_purchase_with_ious(tx jsonb, ious jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  t_id uuid := coalesce(nullif(tx->>'id', '')::uuid, gen_random_uuid());
  p_id uuid;
  i jsonb;
  owed bigint := 0;
begin
  for i in select * from jsonb_array_elements(coalesce(ious, '[]'::jsonb)) loop
    if coalesce((i->>'amount_pence')::bigint, 0) <= 0 or coalesce(trim(i->>'name'), '') = '' then
      raise exception 'Each person needs a name and an amount';
    end if;
    owed := owed + (i->>'amount_pence')::bigint;
  end loop;
  if (tx->>'amount_pence')::bigint >= 0 or owed > -(tx->>'amount_pence')::bigint then
    raise exception 'What others owe can''t be more than the purchase';
  end if;

  insert into transactions (id, account_id, date, amount_pence, raw_description, note, kind, status, category_id, tag, from_savings, fund_id, fingerprint, source)
  values (t_id, (tx->>'account_id')::uuid, (tx->>'date')::date, (tx->>'amount_pence')::bigint, coalesce(tx->>'raw_description', ''), nullif(tx->>'note', ''),
          'spend', 'reviewed', nullif(tx->>'category_id', '')::uuid, nullif(tx->>'tag', ''), coalesce((tx->>'from_savings')::boolean, false), nullif(tx->>'fund_id', '')::uuid,
          'manual|' || t_id, 'manual');

  for i in select * from jsonb_array_elements(coalesce(ious, '[]'::jsonb)) loop
    insert into people (name) values (trim(i->>'name'))
      on conflict (user_id, name) do update set name = excluded.name
      returning id into p_id;
    insert into splits (transaction_id, person_id, amount_pence, due_date, note)
      values (t_id, p_id, (i->>'amount_pence')::bigint, nullif(i->>'due_date', '')::date, nullif(i->>'note', ''));
  end loop;
  return t_id;
end;
$$;
grant execute on function public.add_purchase_with_ious(jsonb, jsonb) to authenticated;
