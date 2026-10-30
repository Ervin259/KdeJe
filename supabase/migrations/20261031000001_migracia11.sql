-- =====================================================================
-- KdeJe – migrácia 11: automatický prechod na nový rok
--   * návrh štátnych sviatkov na ďalší rok → potvrdí superadmin → zapíše sa do všetkých firiem
--   * nárok na dovolenku na ďalší rok sa založí sám (kópia z predošlého roka), prenos sa dopočíta
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- 1) Návrh štátnych sviatkov (generuje denná úloha od 1. 10., potvrdzuje superadmin)
create table if not exists state_holiday_drafts (
  date        date primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);
alter table state_holiday_drafts enable row level security;
drop policy if exists platform_all on state_holiday_drafts;
create policy platform_all on state_holiday_drafts for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Záznam o vykonaných úlohách (napr. kedy išiel e-mail s návrhom sviatkov)
create table if not exists platform_jobs (
  key     text primary key,
  done_at timestamptz not null default now()
);
alter table platform_jobs enable row level security;
drop policy if exists platform_all on platform_jobs;
create policy platform_all on platform_jobs for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Potvrdenie návrhu: sviatky roka sa nahradia návrhom a zapíšu do všetkých firiem
-- (vlastné voľné dni firiem ostávajú; štátny sviatok, ktorý z návrhu vypadol, sa z firiem odstráni)
create or replace function confirm_state_holidays(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  if not exists (select 1 from state_holiday_drafts where extract(year from date) = p_year) then
    raise exception 'Pre rok % nie je pripravený návrh sviatkov.', p_year;
  end if;
  delete from state_holidays where extract(year from date) = p_year;
  insert into state_holidays (date, name)
    select date, name from state_holiday_drafts where extract(year from date) = p_year;
  delete from state_holiday_drafts where extract(year from date) = p_year;

  delete from holidays h
  where h.is_state and extract(year from h.date) = p_year
    and not exists (select 1 from state_holidays s where s.date = h.date);
  insert into holidays (company_id, date, name, is_state)
    select c.id, s.date, s.name, true from companies c cross join state_holidays s
    where extract(year from s.date) = p_year
  on conflict (company_id, date) do update set name = excluded.name, is_state = true;
  get diagnostics n = row_count;

  insert into platform_jobs (key) values ('holidays-confirmed-' || p_year)
  on conflict (key) do update set done_at = now();
  return n;
end $$;
revoke execute on function confirm_state_holidays(int) from public, anon;
grant execute on function confirm_state_holidays(int) to authenticated;

-- 2) Nárok na dovolenku: príznaky pre automatický prechod
alter table vacation_years add column if not exists check_needed boolean not null default false; -- skopírovaný nárok pod 25 dní – admin má skontrolovať
alter table vacation_years add column if not exists carry_manual boolean not null default false; -- prenos zadal admin ručne – automatika ho nemení
alter table vacation_years add column if not exists carry_final  boolean not null default false; -- prenos dopočítaný po uzávierke decembra
alter table vacation_years add column if not exists auto_created boolean not null default false; -- riadok založila automatika

commit;
