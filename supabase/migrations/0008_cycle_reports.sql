-- End-of-cycle review reports. When you review and close a pay cycle, its report (the figures, breakdowns and
-- narrative worked out at that moment) and your reflection and chosen improvements are kept on the cycle's row.
-- Additive only: a new empty column on an existing table, so nothing is changed or removed, and the cycles
-- table's existing own-rows RLS policies already cover it. Transactions are never moved or changed by closing.
alter table public.cycles add column report jsonb;
