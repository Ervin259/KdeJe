-- =====================================================================
-- KdeJe – migrácia 12: záznam spustení dennej úlohy (prehľad v záložke Firmy)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;
create table if not exists job_runs (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  source  text not null default 'cron',   -- cron = nočné spustenie, manual = tlačidlo
  ok      boolean not null default true,
  log     text                            -- čo úloha urobila (prázdne = nebolo čo robiť) alebo chyba
);
create index if not exists job_runs_at on job_runs (ran_at desc);
alter table job_runs enable row level security;
drop policy if exists platform_read on job_runs;
create policy platform_read on job_runs for select to authenticated using (is_platform_admin());
commit;
