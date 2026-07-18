-- Magpie initial migration 0001: extensions
-- Enable pg_cron (job scheduler) and pg_net (async HTTP) for later cron/edge tasks (T19).
-- T5 only ENABLES the extensions; scheduling + Vault secret land in T19.

create extension if not exists pg_cron;
create extension if not exists pg_net;
