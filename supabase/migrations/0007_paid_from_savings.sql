-- A big buy paid out of savings or a pot (a car, a holiday) is real spending, but it isn't that pay cycle's
-- spending money. Marked transactions are shown separately and don't count against the cycle's budgets.
alter table public.transactions add column from_savings boolean not null default false;
