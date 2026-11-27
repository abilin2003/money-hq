-- Import history (Live tracking, Phase 5). Additive only: existing rows get null.
-- details: what each import contained and what happened to it, so coverage can be shown per account:
--   { files: [{ name, bank, account, from, to, period_from, period_to, rows }],
--     counts: { linked, new, ready, possibleMatch, needsInfo, duplicates, notOnStatement } }
-- from/to are the first and last transaction dates in the file; period_from/period_to only when the bank's
-- export states its statement period.
alter table public.import_batches add column if not exists details jsonb;
