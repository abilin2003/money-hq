-- Statement reconciliation (Live tracking, Phase 1). Additive only: existing rows get null.
-- bank:   the original bank line, kept separately so editing how a transaction is classified never loses it:
--         { description, date, amount_pence, account, ref, fingerprint, file, imported_at }.
--         On a transaction you typed, it means a statement line was matched to it (verified).
-- review: why an imported line is waiting in the Review inbox, and what Money HQ suggests:
--         { group: 'ready' | 'match' | 'info', reason, match_id, match_why }.
alter table public.transactions add column if not exists bank jsonb;
alter table public.transactions add column if not exists review jsonb;
-- Statement fingerprints and bank references already linked to a transaction, so re-importing the same or an
-- overlapping statement never adds them again.
create index if not exists transactions_bank_fp on public.transactions ((bank->>'fingerprint')) where bank is not null;
