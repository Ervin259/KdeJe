-- =====================================================================
-- KdeJe – schéma databázy pre Supabase (Postgres)
-- Krok 1: tabuľky, pomocné funkcie, uzávierky, RLS, pohľad kalendára tímu
-- Spustenie: Supabase → SQL Editor → vložiť celý súbor → Run
--            (alebo `supabase db push`, ak používate Supabase CLI)
-- =====================================================================

-- ---------- ENUMY ----------
create type contract_type  as enum ('TPP','DOH','ZIV','SRO');
create type app_role       as enum ('admin','employee');
create type entry_part     as enum ('full','am','pm','hrs');      -- celý deň / dopoludnie / popoludnie / hodiny
create type absence_kind   as enum ('abs','sc','work');           -- neprítomnosť / služobná cesta / práca (HO)
create type request_kind   as enum ('new','edit','delete');
create type request_status as enum ('pending','approved','rejected','cancelled');
create type sl_rule        as enum ('gte','gt');                  -- SL pri odpracovaní aspoň / viac ako N h
create type carry_mode     as enum ('all','max');                 -- prenos celého zostatku / max. N dní
create type dohoda_mode    as enum ('fixed','worked','manual');   -- pevne N h / odpracované ÷ koef. / ručne

-- ---------- FIRMA ----------
create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------- SKUPINY PRACOVNÉHO ČASU ----------
create table work_groups (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies on delete cascade,
  name             text not null,
  is_default       boolean not null default false,
  flexible         boolean not null default false,
  day_start        time,
  day_end          time,
  break_start      time,
  break_min        int not null default 0 check (break_min >= 0),
  meal_voucher     boolean not null default false,
  sl_rule          sl_rule not null default 'gte',
  sl_min_hours     numeric(4,2) not null default 4,
  trip_no_sl_hours numeric(4,2) default 5,          -- služobná cesta od X h = bez SL
  sort             int not null default 0,
  unique (company_id, name),
  check (flexible or (day_start is not null and day_end is not null and day_end > day_start))
);
create unique index work_groups_one_default on work_groups(company_id) where is_default;

-- ---------- SKUPINY PRÁV ----------
create table rights_groups (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies on delete cascade,
  name                 text not null,
  is_default           boolean not null default false,
  requires_approval    boolean not null default false,  -- každý zápis schvaľuje oprávnená osoba
  lock_days            int not null default 3 check (lock_days between 0 and 15),
  can_edit_until_lock  boolean not null default true,   -- false = zmeny len cez žiadosť
  edit_days_after_lock int not null default 0 check (edit_days_after_lock between 0 and 15),
  sort                 int not null default 0,
  unique (company_id, name)
);
create unique index rights_groups_one_default on rights_groups(company_id) where is_default;

-- ---------- ZAMESTNANCI ----------
create table employees (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies on delete cascade,
  user_id          uuid unique references auth.users on delete set null,
  email            text,                                -- podľa e-mailu sa pri prvom prihlásení prepojí user_id
  name             text not null,
  contract_type    contract_type not null,
  firm             text,
  date_from        date,
  date_to          date,
  active           boolean not null default true,
  work_group_id    uuid references work_groups on delete set null,
  rights_group_id  uuid references rights_groups on delete set null,
  show_in_calendar boolean not null default true,       -- zobrazuje sa v kalendári tímu
  sees_calendar    boolean not null default true,       -- vidí spoločný kalendár
  in_stats         boolean not null default true,       -- v Prehľade
  in_payroll       boolean not null default true,       -- v podkladoch pre mzdy
  role             app_role not null default 'employee',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (date_to is null or date_from is null or date_to >= date_from)
);
create unique index employees_company_email on employees(company_id, lower(email)) where email is not null;
create index employees_company on employees(company_id);

-- Poznámka k zamestnancovi je len pre admina → samostatná tabuľka (RLS na celý riadok)
create table employee_notes (
  employee_id uuid primary key references employees on delete cascade,
  note        text not null default '',
  updated_at  timestamptz not null default now()
);

-- ---------- TYPY NEPRÍTOMNOSTÍ ----------
create table absence_types (
  code      text primary key,
  name      text not null,
  kind      absence_kind not null,
  parts     text[] not null default array['full'],  -- povolené: full / half / hrs
  enabled   boolean not null default true,
  is_health boolean not null default false,         -- pri GDPR voľbe sa kolegom ukáže len „MIMO“
  sort      int not null default 0,
  check (parts <@ array['full','half','hrs']),
  check (code <> 'DOV' or enabled)                  -- dovolenka je vždy zapnutá
);

-- ---------- ZÁZNAMY V KALENDÁRI ----------
create table entries (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees on delete cascade,
  type          text not null references absence_types(code),
  date_from     date not null,
  date_to       date not null,
  part          entry_part not null default 'full',
  time_from     time,
  time_to       time,
  substitute_id uuid references employees on delete set null,
  note          text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (date_to >= date_from),
  check ((part = 'hrs') = (time_from is not null and time_to is not null)),
  check (part <> 'hrs' or (date_from = date_to and time_to > time_from)),
  check (part not in ('am','pm') or date_from = date_to)
);
create index entries_emp_dates on entries(employee_id, date_from, date_to);
create index entries_dates on entries(date_from, date_to);

-- ---------- ŽIADOSTI (zmeny v zamknutom období / so schvaľovaním) ----------
create table requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees on delete cascade,
  kind            request_kind not null,
  target_entry_id uuid references entries on delete set null,
  payload         jsonb not null default '{}',   -- nový stav záznamu
  original        jsonb,                         -- pôvodný záznam (pre prečiarknuté zobrazenie)
  reason          text not null,
  status          request_status not null default 'pending',
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  decided_by      uuid,
  decided_at      timestamptz,
  reject_reason   text
);
create index requests_status on requests(status, created_at);

-- ---------- DOVOLENKA PO ROKOCH ----------
create table vacation_years (
  employee_id      uuid not null references employees on delete cascade,
  year             int  not null,
  entitlement_full numeric(4,1) not null default 20,   -- plný ročný nárok (20 / 25)
  entitlement      numeric(4,1) not null default 20,   -- nárok v danom roku (pomerná časť pri nástupe)
  carry_in         numeric(5,2) not null default 0,    -- prenos z minulého roka
  closed           boolean not null default false,
  primary key (employee_id, year)
);

-- ---------- STAV MESIACA A ODSÚHLASENIE ----------
create table month_status (
  company_id      uuid not null references companies on delete cascade,
  year            int  not null,
  month           int  not null check (month between 1 and 12),
  closed_manually boolean not null default false,
  reopened        boolean not null default false,
  changed_by      uuid,
  changed_at      timestamptz not null default now(),
  primary key (company_id, year, month)
);

create table month_confirmations (
  employee_id  uuid not null references employees on delete cascade,
  year         int  not null,
  month        int  not null check (month between 1 and 12),
  confirmed_by uuid default auth.uid(),
  confirmed_at timestamptz not null default now(),
  primary key (employee_id, year, month)
);

-- ---------- DOHODY ----------
create table contract_hours (
  employee_id uuid primary key references employees on delete cascade,
  mode        dohoda_mode not null default 'fixed',
  hours       numeric(5,1),            -- pri 'fixed' hodiny mesačne
  coef        numeric(5,2),            -- pri 'worked' delenie koeficientom
  max_day     numeric(4,1),
  max_week    numeric(5,1),
  step        numeric(3,1) not null default 1 check (step in (0.5, 1))
);

create table contract_hours_days (
  employee_id uuid not null references employees on delete cascade,
  date        date not null,
  hours       numeric(4,1) not null check (hours >= 0),
  primary key (employee_id, date)
);

-- ---------- SVIATKY, NASTAVENIA, AUDIT ----------
create table holidays (
  company_id uuid not null references companies on delete cascade,
  date       date not null,
  name       text not null,
  primary key (company_id, date)
);

create table settings (
  company_id  uuid primary key references companies on delete cascade,
  hide_health boolean not null default false,       -- GDPR: kolegom PN/PAR/OČR/PV len ako „MIMO“
  carry_mode  carry_mode not null default 'all',
  carry_max   numeric(4,1) not null default 10,     -- odporúčaný / maximálny prenos do nového roka
  lek_limit   numeric(4,1) not null default 7,      -- lekár § 141, dní ročne
  remind_from int not null default 10 check (remind_from between 1 and 12)  -- pripomienky dočerpania od mesiaca
);

create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  employee_id uuid,
  table_name  text not null,
  action      text not null,
  row_id      uuid,
  after_lock  boolean not null default false,       -- zmena po uzávierke → „História úprav“
  old_data    jsonb,
  new_data    jsonb,
  text        text
);
create index audit_log_after_lock on audit_log(after_lock, at desc);

-- =====================================================================
-- POMOCNÉ FUNKCIE (security definer, aby RLS nevolalo samo seba)
-- =====================================================================
create function current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where user_id = auth.uid() and active limit 1
$$;

create function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from employees where user_id = auth.uid() and active limit 1
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees where user_id = auth.uid() and active and role = 'admin')
$$;

create function emp_in_my_company(p_emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees where id = p_emp and company_id = current_company_id())
$$;

-- Je mesiac pre zamestnanca zamknutý?
--   p_for_employee = false → uzávierka (podklad pre audit „po uzávierke“)
--   p_for_employee = true  → koniec okna úprav pre zamestnanca (uzávierka + „ešte N dní“)
create function month_locked(p_emp uuid, p_year int, p_month int, p_for_employee boolean default true)
returns boolean
language sql stable security definer set search_path = public as $$
  with e as (
    select e.company_id,
           coalesce(rg.lock_days, 3) as lock_days,
           coalesce(rg.edit_days_after_lock, 0) as extra
    from employees e left join rights_groups rg on rg.id = e.rights_group_id
    where e.id = p_emp
  ), ms as (
    select m.* from month_status m join e on m.company_id = e.company_id
    where m.year = p_year and m.month = p_month
  )
  select case
    when exists (select 1 from month_confirmations c
                 where c.employee_id = p_emp and c.year = p_year and c.month = p_month) then true
    when exists (select 1 from ms where closed_manually and not reopened) then true
    when exists (select 1 from ms where reopened) then false
    else current_date >
         (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date
         + (select lock_days + case when p_for_employee then extra else 0 end from e)
  end
$$;

-- Je niektorý mesiac v rozsahu dátumov zamknutý?
create function range_locked(p_emp uuid, p_from date, p_to date, p_for_employee boolean default true)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g(m)
    where month_locked(p_emp, extract(year from g.m)::int, extract(month from g.m)::int, p_for_employee)
  )
$$;

-- Smie zamestnanec priamo zapísať (p_change=false) alebo upraviť/zmazať (p_change=true) záznam?
-- Ak nie, aplikácia vytvorí žiadosť (requests).
create function employee_can_write(p_emp uuid, p_from date, p_to date, p_change boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p_emp = current_employee_id()
       and not coalesce(rg.requires_approval, false)
       and (not p_change or coalesce(rg.can_edit_until_lock, true))
       and not range_locked(p_emp, p_from, p_to, true)
    from employees e left join rights_groups rg on rg.id = e.rights_group_id
    where e.id = p_emp
  ), false)
$$;

-- =====================================================================
-- TRIGGERY
-- =====================================================================
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger employees_updated before update on employees for each row execute function set_updated_at();
create trigger entries_updated   before update on entries   for each row execute function set_updated_at();
create trigger notes_updated     before update on employee_notes for each row execute function set_updated_at();

-- Audit všetkých zmien záznamov; after_lock = zmena v už uzavretom mesiaci
create function audit_entries() returns trigger
language plpgsql security definer set search_path = public as $$
declare r entries; locked boolean;
begin
  r := coalesce(new, old);
  locked := range_locked(r.employee_id, r.date_from, r.date_to, false)
            or (tg_op = 'UPDATE' and range_locked(old.employee_id, old.date_from, old.date_to, false));
  insert into audit_log(employee_id, table_name, action, row_id, after_lock, old_data, new_data)
  values (r.employee_id, 'entries', tg_op, r.id, locked,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger entries_audit after insert or update or delete on entries
  for each row execute function audit_entries();

-- Pri prvom prihlásení prepoj účet so zamestnancom podľa e-mailu
create function link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update employees set user_id = new.id
  where user_id is null and email is not null and lower(email) = lower(new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function link_auth_user();

-- =====================================================================
-- RLS
-- =====================================================================
alter table companies           enable row level security;
alter table work_groups         enable row level security;
alter table rights_groups       enable row level security;
alter table employees           enable row level security;
alter table employee_notes      enable row level security;
alter table absence_types       enable row level security;
alter table entries             enable row level security;
alter table requests            enable row level security;
alter table vacation_years      enable row level security;
alter table month_status        enable row level security;
alter table month_confirmations enable row level security;
alter table contract_hours      enable row level security;
alter table contract_hours_days enable row level security;
alter table holidays            enable row level security;
alter table settings            enable row level security;
alter table audit_log           enable row level security;

-- Firemné číselníky: čítajú všetci z firmy, píše admin
create policy read_own_company  on companies for select to authenticated using (id = current_company_id());
create policy admin_company     on companies for update to authenticated using (is_admin() and id = current_company_id());

create policy read  on work_groups   for select to authenticated using (company_id = current_company_id());
create policy admin on work_groups   for all    to authenticated using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());
create policy read  on rights_groups for select to authenticated using (company_id = current_company_id());
create policy admin on rights_groups for all    to authenticated using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());
create policy read  on holidays      for select to authenticated using (company_id = current_company_id());
create policy admin on holidays      for all    to authenticated using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());
create policy read  on settings      for select to authenticated using (company_id = current_company_id());
create policy admin on settings      for all    to authenticated using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());
create policy read  on month_status  for select to authenticated using (company_id = current_company_id());
create policy admin on month_status  for all    to authenticated using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());

create policy read  on absence_types for select to authenticated using (true);
create policy admin on absence_types for all    to authenticated using (is_admin()) with check (is_admin());

-- Zamestnanci: zoznam vidia všetci z firmy (mená pre kalendár), mení len admin
create policy read  on employees for select to authenticated using (company_id = current_company_id());
create policy admin on employees for all    to authenticated using (is_admin() and company_id = current_company_id()) with check (is_admin() and company_id = current_company_id());

create policy admin on employee_notes for all to authenticated using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

-- Záznamy: priamo len vlastné; kolegov číta aplikácia cez pohľad team_calendar
create policy own_read   on entries for select to authenticated using (employee_id = current_employee_id());
create policy own_insert on entries for insert to authenticated
  with check (employee_can_write(employee_id, date_from, date_to, false));
create policy own_update on entries for update to authenticated
  using      (employee_can_write(employee_id, date_from, date_to, true))
  with check (employee_can_write(employee_id, date_from, date_to, true));
create policy own_delete on entries for delete to authenticated
  using (employee_can_write(employee_id, date_from, date_to, true));
create policy admin on entries for all to authenticated
  using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

-- Žiadosti: zamestnanec vytvára a vidí svoje, môže zrušiť čakajúcu; vybavuje admin
create policy own_read   on requests for select to authenticated using (employee_id = current_employee_id());
create policy own_insert on requests for insert to authenticated
  with check (employee_id = current_employee_id() and status = 'pending' and decided_by is null);
create policy own_cancel on requests for update to authenticated
  using (employee_id = current_employee_id() and status = 'pending')
  with check (employee_id = current_employee_id() and status in ('pending','cancelled') and decided_by is null);
create policy admin on requests for all to authenticated
  using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

-- Osobné údaje: vlastné číta zamestnanec, všetko admin
create policy own_read on vacation_years      for select to authenticated using (employee_id = current_employee_id());
create policy admin    on vacation_years      for all    to authenticated using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));
create policy own_read on contract_hours      for select to authenticated using (employee_id = current_employee_id());
create policy admin    on contract_hours      for all    to authenticated using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));
create policy own_read on contract_hours_days for select to authenticated using (employee_id = current_employee_id());
create policy admin    on contract_hours_days for all    to authenticated using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

-- Odsúhlasenie mesiaca: TPP sám za seba po skončení mesiaca
create policy own_read on month_confirmations for select to authenticated using (employee_id = current_employee_id());
create policy own_confirm on month_confirmations for insert to authenticated
  with check (
    employee_id = current_employee_id()
    and (select contract_type from employees where id = employee_id) = 'TPP'
    and current_date > (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
  );
create policy admin on month_confirmations for all to authenticated
  using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

create policy admin_read on audit_log for select to authenticated using (is_admin() and (employee_id is null or emp_in_my_company(employee_id)));

-- =====================================================================
-- POHĽAD: KALENDÁR TÍMU (s GDPR maskovaním)
-- Beží s právami vlastníka, filtrovanie rieši sám:
--   firma prihláseného, zobrazovaní zamestnanci, „vidí spoločný kalendár“,
--   pri zapnutom hide_health kolegom zdravotné typy len ako „MIMO“.
-- =====================================================================
create view team_calendar as
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
join absence_types t  on t.code = en.type
left join settings s  on s.company_id = e.company_id
cross join me
cross join lateral (
  select coalesce(s.hide_health, false) and t.is_health
         and en.employee_id is distinct from me.id and not me.admin as masked
) m
where e.company_id = me.company_id
  and e.active and e.show_in_calendar
  and (me.admin
       or en.employee_id = me.id
       or exists (select 1 from employees x where x.id = me.id and x.sees_calendar));

revoke all on team_calendar from anon;
grant select on team_calendar to authenticated;

-- Pomocné funkcie nevolá anonym
revoke execute on function current_employee_id(), current_company_id(), is_admin(),
  emp_in_my_company(uuid), month_locked(uuid,int,int,boolean),
  range_locked(uuid,date,date,boolean), employee_can_write(uuid,date,date,boolean) from public, anon;
grant execute on function current_employee_id(), current_company_id(), is_admin(),
  emp_in_my_company(uuid), month_locked(uuid,int,int,boolean),
  range_locked(uuid,date,date,boolean), employee_can_write(uuid,date,date,boolean) to authenticated;
