-- Bills: the words that identify a bill's payment in a bank description (e.g. "voxi"), so Money HQ can tell
-- whether this cycle's bill has been paid yet.
alter table public.recurring add column match text;

-- Sinking funds: how much is in each one (typed in on money day, since Monzo isn't imported) and when.
alter table public.sinking_funds
  add column balance_pence bigint not null default 0,
  add column balance_date date;
