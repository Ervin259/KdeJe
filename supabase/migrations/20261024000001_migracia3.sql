-- =====================================================================
-- KdeJe – migrácia 3: viac firiem, vedúci, superadmin
-- Spustenie: Supabase → SQL Editor → vložiť celý súbor → Run.
-- Beží v jednej transakcii; ak niečo zlyhá, nezmení sa nič.
-- Euro Data Distribution (id …0001) funguje ďalej bez zmeny.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) SUPERADMIN (vývojár aplikácie)
-- ---------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
drop policy if exists own_read on platform_admins;
create policy own_read on platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- Ervín Goga = superadmin (podľa e-mailu admina Euro Data)
insert into platform_admins (user_id)
select id from auth.users where lower(email) = 'egoga@eurodata.sk'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) FIRMA: údaje, stav, skúšobná doba
-- ---------------------------------------------------------------------
alter table companies add column if not exists ico         text;
alter table companies add column if not exists address     text;
alter table companies add column if not exists status      text not null default 'trial';
alter table companies add column if not exists trial_until date;
alter table companies add column if not exists plan        text not null default 'basic';
alter table companies drop constraint if exists companies_status_check;
alter table companies add constraint companies_status_check check (status in ('trial','active','suspended'));

update companies set status = 'active' where id = '00000000-0000-0000-0000-000000000001';

-- Admin firmy smie meniť len názov, IČO a adresu; stav a skúšobnú dobu mení superadmin
revoke update on companies from authenticated;
grant update (name, ico, address) on companies to authenticated;

drop policy if exists platform_all on companies;
create policy platform_all on companies for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Stav a skúšobnú dobu mení superadmin cez funkciu (stĺpce sú pre API zamknuté)
create or replace function set_company_status(p_company uuid, p_status text, p_trial_until date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  update companies set status = p_status, trial_until = p_trial_until where id = p_company;
end $$;

-- ---------------------------------------------------------------------
-- 3) MODULY PRE FIRMU (špecifické požiadavky zákazníkov)
-- ---------------------------------------------------------------------
create table if not exists company_features (
  company_id uuid not null references companies on delete cascade,
  feature    text not null,
  enabled    boolean not null default true,
  config     jsonb not null default '{}',
  primary key (company_id, feature)
);
alter table company_features enable row level security;
drop policy if exists read on company_features;
create policy read on company_features for select to authenticated
  using (company_id = current_company_id() or is_platform_admin());
drop policy if exists platform_all on company_features;
create policy platform_all on company_features for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------
-- 4) TYPY NEPRÍTOMNOSTÍ PO FIRMÁCH
-- ---------------------------------------------------------------------
-- Predlohy pre nové firmy (spravuje superadmin)
create table if not exists absence_type_templates (
  code      text primary key,
  name      text not null,
  kind      absence_kind not null,
  parts     text[] not null default array['full'],
  enabled   boolean not null default true,
  is_health boolean not null default false,
  sort      int not null default 0
);
alter table absence_type_templates enable row level security;
drop policy if exists read on absence_type_templates;
create policy read on absence_type_templates for select to authenticated using (true);
drop policy if exists platform_all on absence_type_templates;
create policy platform_all on absence_type_templates for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

insert into absence_type_templates (code, name, kind, parts, enabled, is_health, sort)
select code, name, kind, parts, enabled, is_health, sort from absence_types
on conflict (code) do nothing;

-- company_id do absence_types, kľúč (company_id, code)
alter table entries drop constraint if exists entries_type_fkey;
alter table absence_types add column if not exists company_id uuid references companies on delete cascade;
update absence_types set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table absence_types alter column company_id set not null;
alter table absence_types drop constraint if exists absence_types_pkey;
alter table absence_types add primary key (company_id, code);

drop policy if exists read  on absence_types;
drop policy if exists admin on absence_types;
create policy read  on absence_types for select to authenticated using (company_id = current_company_id());
create policy admin on absence_types for all    to authenticated
  using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());

-- Typ záznamu musí existovať vo firme zamestnanca (náhrada za cudzí kľúč)
create or replace function check_entry_type() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from absence_types t join employees e on e.company_id = t.company_id
    where e.id = new.employee_id and t.code = new.type
  ) then
    raise exception 'Neznámy typ neprítomnosti %', new.type using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists entries_type_check on entries;
create trigger entries_type_check before insert or update of type, employee_id on entries
  for each row execute function check_entry_type();

-- ---------------------------------------------------------------------
-- 5) AUDIT PO FIRMÁCH
-- ---------------------------------------------------------------------
alter table audit_log add column if not exists company_id uuid references companies on delete cascade;
update audit_log a set company_id = coalesce(
  (select e.company_id from employees e where e.id = a.employee_id),
  '00000000-0000-0000-0000-000000000001')
where company_id is null;
alter table audit_log alter column company_id set default current_company_id();
create index if not exists audit_log_company on audit_log(company_id, at desc);

create or replace function audit_entries() returns trigger
language plpgsql security definer set search_path = public as $$
declare r entries; locked boolean;
begin
  r := coalesce(new, old);
  locked := range_locked(r.employee_id, r.date_from, r.date_to, false)
            or (tg_op = 'UPDATE' and range_locked(old.employee_id, old.date_from, old.date_to, false));
  insert into audit_log(company_id, employee_id, table_name, action, row_id, after_lock, old_data, new_data)
  values ((select company_id from employees where id = r.employee_id),
          r.employee_id, 'entries', tg_op, r.id, locked,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 6) VEDÚCI A ICH ĽUDIA
-- ---------------------------------------------------------------------
alter table employees add column if not exists is_manager boolean not null default false;

create table if not exists manager_assignments (
  manager_id  uuid not null references employees on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  primary key (manager_id, employee_id),
  check (manager_id <> employee_id)
);
create index if not exists manager_assignments_emp on manager_assignments(employee_id);
alter table manager_assignments enable row level security;

-- Spravuje prihlásený (vedúci) tohto zamestnanca?
create or replace function manages(p_emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from manager_assignments ma
    join employees m on m.id = ma.manager_id
    where ma.manager_id = current_employee_id() and m.is_manager and m.active
      and ma.employee_id = p_emp
  )
$$;

-- Smie vedúci zapisovať za zamestnanca? Len do uzávierky (po nej cez žiadosť adminovi).
create or replace function manager_can_write(p_emp uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = public as $$
  select manages(p_emp) and not range_locked(p_emp, p_from, p_to, false)
$$;

drop policy if exists read  on manager_assignments;
drop policy if exists admin on manager_assignments;
create policy read  on manager_assignments for select to authenticated
  using (emp_in_my_company(manager_id));
create policy admin on manager_assignments for all to authenticated
  using (is_admin() and emp_in_my_company(manager_id) and emp_in_my_company(employee_id))
  with check (is_admin() and emp_in_my_company(manager_id) and emp_in_my_company(employee_id));

-- Záznamy
drop policy if exists mgr_read   on entries;
drop policy if exists mgr_insert on entries;
drop policy if exists mgr_update on entries;
drop policy if exists mgr_delete on entries;
create policy mgr_read   on entries for select to authenticated using (manages(employee_id));
create policy mgr_insert on entries for insert to authenticated
  with check (manager_can_write(employee_id, date_from, date_to));
create policy mgr_update on entries for update to authenticated
  using      (manager_can_write(employee_id, date_from, date_to))
  with check (manager_can_write(employee_id, date_from, date_to));
create policy mgr_delete on entries for delete to authenticated
  using (manager_can_write(employee_id, date_from, date_to));

-- Žiadosti: vedúci ich vidí, vytvára za svojich ľudí a vybavuje tie mimo uzávierky
drop policy if exists mgr_read   on requests;
drop policy if exists mgr_insert on requests;
drop policy if exists mgr_decide on requests;
create policy mgr_read   on requests for select to authenticated using (manages(employee_id));
create policy mgr_insert on requests for insert to authenticated
  with check (manages(employee_id) and status = 'pending' and decided_by is null);
create policy mgr_decide on requests for update to authenticated
  using (manages(employee_id)) with check (manages(employee_id));

-- Odsúhlasenie mesiaca za svojich ľudí (po skončení mesiaca)
drop policy if exists mgr_confirm on month_confirmations;
drop policy if exists mgr_read    on month_confirmations;
create policy mgr_read on month_confirmations for select to authenticated using (manages(employee_id));
create policy mgr_confirm on month_confirmations for insert to authenticated
  with check (
    manages(employee_id)
    and current_date > (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
  );

-- Čítanie údajov svojich ľudí pre Prehľad
drop policy if exists mgr_read on vacation_years;
drop policy if exists mgr_read on contract_hours;
drop policy if exists mgr_read on contract_hours_days;
drop policy if exists mgr_read on employee_notes;
create policy mgr_read on vacation_years      for select to authenticated using (manages(employee_id));
create policy mgr_read on contract_hours      for select to authenticated using (manages(employee_id));
create policy mgr_read on contract_hours_days for select to authenticated using (manages(employee_id));
create policy mgr_read on employee_notes      for select to authenticated using (manages(employee_id));

-- Audit: firma vidí len svoj; vedúci zapisuje texty o svojich ľuďoch
drop policy if exists admin_read   on audit_log;
drop policy if exists admin_insert on audit_log;
drop policy if exists mgr_read     on audit_log;
drop policy if exists mgr_insert   on audit_log;
create policy admin_read   on audit_log for select to authenticated
  using (is_admin() and company_id = current_company_id());
create policy admin_insert on audit_log for insert to authenticated
  with check (is_admin() and company_id = current_company_id());
create policy mgr_read     on audit_log for select to authenticated
  using (employee_id is not null and manages(employee_id));
create policy mgr_insert   on audit_log for insert to authenticated
  with check (company_id = current_company_id() and employee_id is not null and manages(employee_id));

-- Kalendár tímu: vedúci vidí u svojich ľudí aj zdravotné typy
create or replace view team_calendar as
with me as (
  select current_employee_id() as id, current_company_id() as company_id, is_admin() as admin
)
select en.id,
       en.employee_id,
       e.name as employee_name,
       e.contract_type,
       case when masked then 'MIMO' else en.type end as type,
       en.date_from, en.date_to, en.part, en.time_from, en.time_to,
       en.substitute_id,
       case when masked then null else en.note end as note
from entries en
join employees e      on e.id = en.employee_id
join absence_types t  on t.code = en.type and t.company_id = e.company_id
left join settings s  on s.company_id = e.company_id
cross join me
cross join lateral (
  select coalesce(s.hide_health, false) and t.is_health
         and en.employee_id is distinct from me.id and not me.admin
         and not manages(en.employee_id) as masked
) m
where e.company_id = me.company_id
  and e.active and e.show_in_calendar
  and (me.admin
       or en.employee_id = me.id
       or exists (select 1 from employees x where x.id = me.id and x.sees_calendar));

revoke all on team_calendar from anon;
grant select on team_calendar to authenticated;

-- ---------------------------------------------------------------------
-- 7) ŠTÁTNE SVIATKY (spoločné pre všetky firmy, spravuje superadmin)
-- ---------------------------------------------------------------------
create table if not exists state_holidays (
  date date primary key,
  name text not null
);
alter table state_holidays enable row level security;
drop policy if exists read on state_holidays;
create policy read on state_holidays for select to authenticated using (true);
drop policy if exists platform_all on state_holidays;
create policy platform_all on state_holidays for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- 2026 podľa overeného zoznamu Euro Data; 2027 doplniť po overení
insert into state_holidays (date, name)
select date, name from holidays where company_id = '00000000-0000-0000-0000-000000000001'
  and date between '2026-01-01' and '2026-12-31'
on conflict (date) do nothing;

-- Sviatky firmy: odlíšiť štátne od vlastných voľných dní
alter table holidays add column if not exists is_state boolean not null default false;
update holidays h set is_state = true where exists (select 1 from state_holidays s where s.date = h.date);

-- Admin firmy načíta štátne sviatky roka do svojej firmy
create or replace function load_state_holidays(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then return 0; end if;
  insert into holidays (company_id, date, name, is_state)
  select current_company_id(), s.date, s.name, true from state_holidays s
  where extract(year from s.date) = p_year
  on conflict (company_id, date) do update set name = excluded.name, is_state = true;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 8) NOVÁ FIRMA (superadmin; neskôr aj registrácia)
-- ---------------------------------------------------------------------
create or replace function create_company(
  p_name text, p_admin_name text, p_admin_email text, p_ico text default null, p_trial_months int default 12
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; wg uuid; rg uuid;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;

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
  where e.company_id = c and e.user_id is null and lower(u.email) = lower(p_admin_email)
    and not exists (select 1 from employees x where x.user_id = u.id);

  return c;
end $$;

-- ---------------------------------------------------------------------
-- 9) PRÁVA NA FUNKCIE
-- ---------------------------------------------------------------------
revoke execute on function is_platform_admin(), manages(uuid), manager_can_write(uuid,date,date),
  load_state_holidays(int), create_company(text,text,text,text,int),
  set_company_status(uuid,text,date) from public, anon;
grant execute on function is_platform_admin(), manages(uuid), manager_can_write(uuid,date,date),
  load_state_holidays(int), create_company(text,text,text,text,int),
  set_company_status(uuid,text,date) to authenticated;

commit;
