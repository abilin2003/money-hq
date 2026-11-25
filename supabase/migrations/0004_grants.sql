-- Table access for signed-in users. Newer Supabase projects don't grant this automatically.
-- This decides whether the signed-in role may use a table at all; the RLS policies in 0002 still decide
-- which rows (only your own). Signed-out visitors (anon) get nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- Tables added by later migrations get the same access automatically.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public revoke all on tables from anon;
