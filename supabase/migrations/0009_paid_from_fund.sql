-- Which savings fund paid for a purchase (e.g. flights out of the Bulgaria holiday fund). Goes with
-- from_savings (0007): marked purchases count in total spending but not against the cycle's budgets.
-- Additive only: existing rows get null, and deleting a fund just clears the link.
alter table public.transactions add column if not exists fund_id uuid references public.sinking_funds (id) on delete set null;
create index if not exists transactions_fund on public.transactions (fund_id) where fund_id is not null;
