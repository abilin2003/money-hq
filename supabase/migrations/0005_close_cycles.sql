-- Closing a pay cycle: once you've looked over a finished cycle and press "Close cycle", it's marked here
-- and the Overview moves on to the current cycle.
alter table public.cycles add column closed_at timestamptz;
