-- Keep every detail from the previous app when moving data in, so nothing is lost.
-- transactions.legacy: the original record (old id, kind, direction, bucket, detail, account) for reference.
-- cycle_summaries: the old per-bucket spending, the transaction count and the old dashboard's label.

alter table public.transactions add column legacy jsonb;

alter table public.cycle_summaries
  add column spent_by_bucket jsonb not null default '{}',
  add column tx_count int,
  add column old_label text;
