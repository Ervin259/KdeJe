-- =====================================================================
-- KdeJe – migrácia 6: jeden účet vo viacerých firmách, oddelený superadmin
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- Predpoklad: migrácie 3–5. Dá sa spustiť aj opakovane.
--
-- PRED SPUSTENÍM: v Supabase → Authentication → Users → Add user / Invite
-- vytvorte používateľa admin@sigmadigital.sk. Ak ešte neexistuje, migrácia
-- superadmina nezmení (egoga@eurodata.sk zostane superadminom) a stačí ju
-- po vytvorení účtu spustiť znova.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) Jeden prihlasovací účet môže byť zamestnancom/adminom vo viacerých firmách
-- ---------------------------------------------------------------------
alter table employees drop constraint if exists employees_user_id_key;
create unique index if not exists employees_company_user on employees(company_id, user_id) where user_id is not null;
create index if not exists employees_user on employees(user_id);

-- Správca firmy, ktorý nie je jej zamestnancom (napr. majiteľ viacerých firiem):
-- nie je v kalendári, prehľade, mzdách ani v počte zamestnancov na faktúre.
alter table employees add column if not exists is_external boolean not null default false;

-- Firma, s ktorou používateľ práve pracuje (prepínač v hlavičke)
create table if not exists user_active_company (
  user_id    uuid primary key references auth.users on delete cascade,
  company_id uuid references companies on delete cascade,
  updated_at timestamptz not null default now()
);
alter table user_active_company enable row level security;
drop policy if exists own_read on user_active_company;
create policy own_read on user_active_company for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2) Pomocné funkcie podľa zvolenej firmy
-- ---------------------------------------------------------------------
create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.company_id from user_active_company a
      where a.user_id = auth.uid()
        and (is_platform_admin()
             or exists (select 1 from employees e
                        where e.user_id = auth.uid() and e.company_id = a.company_id and e.active))),
    (select e.company_id from employees e
      where e.user_id = auth.uid() and e.active
      order by (e.role = 'admin') desc, e.created_at
      limit 1))
$$;

create or replace function current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees
  where user_id = auth.uid() and active and company_id = current_company_id()
  limit 1
$$;

-- Admin zvolenej firmy; superadmin je adminom firmy, do ktorej vstúpil
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees
                 where user_id = auth.uid() and active and role = 'admin' and company_id = current_company_id())
      or (is_platform_admin() and current_company_id() is not null)
$$;

-- Prepnutie firmy (člen firmy alebo superadmin; null = superadmin opúšťa firmu)
create or replace function set_active_company(p_company uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Neprihlásený'; end if;
  if p_company is not null and not is_platform_admin()
     and not exists (select 1 from employees where user_id = auth.uid() and company_id = p_company and active) then
    raise exception 'Do tejto firmy nemáte prístup.';
  end if;
  insert into user_active_company (user_id, company_id, updated_at) values (auth.uid(), p_company, now())
  on conflict (user_id) do update set company_id = excluded.company_id, updated_at = now();
end $$;

-- Firmy, do ktorých má prihlásený prístup (pre prepínač)
create or replace function my_companies()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, e.role::text
  from employees e join companies c on c.id = e.company_id
  where e.user_id = auth.uid() and e.active
  order by c.name
$$;

-- ---------------------------------------------------------------------
-- 3) Prepájanie účtov podľa e-mailu – už bez obmedzenia na jednu firmu
-- ---------------------------------------------------------------------
create or replace function link_employee_accounts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then return 0; end if;
  update employees e set user_id = u.id
  from auth.users u
  where e.user_id is null
    and e.email is not null
    and lower(e.email) = lower(u.email)
    and e.company_id = current_company_id();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function create_company(
  p_name text, p_admin_name text, p_admin_email text, p_ico text default null, p_trial_months int default 12
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; wg uuid; rg uuid;
begin
  -- superadmin v aplikácii, alebo priamo v Supabase SQL Editore (tam auth.uid() je prázdne)
  if auth.uid() is not null and not is_platform_admin() then raise exception 'Len pre superadmina'; end if;

  insert into companies (name, ico, status, trial_until)
  values (p_name, p_ico, 'trial', (current_date + make_interval(months => p_trial_months))::date)
  returning id into c;

  insert into settings (company_id) values (c);

  insert into work_groups (company_id, name, is_default, flexible, day_start, day_end, break_start, break_min,
                           meal_voucher, sl_rule, sl_min_hours, trip_no_sl_hours, sort)
  values (c, 'Štandard', true, false, '08:00', '16:30', '12:00', 30, true, 'gte', 4, 5, 1)
  returning id into wg;

  insert into rights_groups (company_id, name, is_default, requires_approval, lock_days,
                             can_edit_until_lock, edit_days_after_lock, sort)
  values (c, 'Bez schvaľovania počas mesiaca', true, false, 3, true, 0, 1)
  returning id into rg;

  insert into absence_types (company_id, code, name, kind, parts, enabled, is_health, sort)
  select c, code, name, kind, parts, enabled, is_health, sort from absence_type_templates;

  insert into holidays (company_id, date, name, is_state)
  select c, date, name, true from state_holidays where date >= date_trunc('year', current_date);

  insert into employees (company_id, name, email, contract_type, role, work_group_id, rights_group_id)
  values (c, p_admin_name, lower(p_admin_email), 'TPP', 'admin', wg, rg);

  -- ak už účet s týmto e-mailom existuje a nie je prepojený, prepojí sa hneď
  update employees e set user_id = u.id
  from auth.users u
  where e.company_id = c and e.user_id is null and lower(u.email) = lower(p_admin_email);

  return c;
end $$;

-- Schválenie žiadosti: ten istý e-mail môže byť adminom ďalšej firmy
create or replace function approve_signup(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s company_signups; c uuid;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  select * into s from company_signups where id = p_id for update;
  if s.id is null or s.status <> 'pending' then raise exception 'Žiadosť už bola vybavená.'; end if;
  c := create_company(s.company_name, s.admin_name, s.admin_email, s.ico, 12);
  update company_signups set status = 'approved', decided_at = now(), decided_by = auth.uid(), company_id = c
  where id = p_id;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- 4) Počet zamestnancov pre fakturáciu bez externých správcov
-- ---------------------------------------------------------------------
drop function if exists platform_companies();
create or replace function platform_companies()
returns table (id uuid, name text, ico text, status text, trial_until date, paid_until date, billing_exempt boolean,
               created_at timestamptz, employees bigint, admins text,
               billing_name text, billing_street text, billing_city text, billing_zip text, billing_dic text, billing_email text,
               writable boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.ico, c.status, c.trial_until, c.paid_until, c.billing_exempt, c.created_at,
         (select count(*) from employees e where e.company_id = c.id and e.active and not e.is_external),
         (select string_agg(e.name || coalesce(' <' || e.email || '>', ''), ', ' order by e.name)
            from employees e where e.company_id = c.id and e.role = 'admin' and e.active),
         c.billing_name, c.billing_street, c.billing_city, c.billing_zip, c.billing_dic, c.billing_email,
         company_writable(c.id) and c.status <> 'suspended'
  from companies c
  where is_platform_admin()
  order by c.created_at
$$;

-- ---------------------------------------------------------------------
-- 5) Superadmin = admin@sigmadigital.sk (egoga@eurodata.sk zostáva adminom firmy)
-- ---------------------------------------------------------------------
do $$
declare sa uuid;
begin
  select id into sa from auth.users where lower(email) = 'admin@sigmadigital.sk';
  if sa is null then
    raise notice 'Účet admin@sigmadigital.sk zatiaľ neexistuje – superadmin sa nezmenil. Vytvorte ho a spustite migráciu znova.';
  else
    insert into platform_admins (user_id) values (sa) on conflict do nothing;
    delete from platform_admins where user_id in (select id from auth.users where lower(email) = 'egoga@eurodata.sk');
  end if;
end $$;

revoke execute on function set_active_company(uuid), my_companies(), platform_companies() from public, anon;
grant execute on function set_active_company(uuid), my_companies(), platform_companies() to authenticated;

commit;
