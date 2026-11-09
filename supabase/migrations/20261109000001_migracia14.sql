-- =====================================================================
-- KdeJe – migrácia 14: pracovný čas v karte zamestnanca + viditeľnosť kalendára
--   • šablóny pracovného času (work_groups) dostanú pružný čas, prestávku a nadčasy
--   • zamestnanec môže mať vlastné nastavenie (employees.work_override), inak platí šablóna
--   • kalendár vidí: len seba / všetkých / vybraných (employees.cal_scope + calendar_viewers)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- 1) Šablóny pracovného času
alter table work_groups add column if not exists daily_hours  numeric(4,2);                      -- denný fond (h); prázdne = z času od–do mínus prestávka
alter table work_groups add column if not exists core_start   time;                              -- pružný: základný čas (musí byť na pracovisku)
alter table work_groups add column if not exists core_end     time;
alter table work_groups add column if not exists arrive_from  time;                              -- pružný: voliteľný príchod od – do
alter table work_groups add column if not exists arrive_to    time;
alter table work_groups add column if not exists leave_from   time;                              -- pružný: voliteľný odchod od – do
alter table work_groups add column if not exists leave_to     time;
alter table work_groups add column if not exists flex_period  text not null default 'day';       -- pružné obdobie: day / week / 4w
alter table work_groups add column if not exists break_mode   text not null default 'fixed';     -- čas prestávky: fixed (presne od) / window (v okne od – do)
alter table work_groups add column if not exists break_from   time;
alter table work_groups add column if not exists break_to     time;
alter table work_groups add column if not exists break_len    text not null default 'fixed';     -- dĺžka: fixed (presne) / min (aspoň, dlhšia sa nadrába)
alter table work_groups add column if not exists overtime     text not null default 'none';      -- nadčasy: none / pay (preplatiť) / nv (náhradné voľno)

do $$ begin
  alter table work_groups add constraint work_groups_flex_period_chk check (flex_period in ('day', 'week', '4w'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table work_groups add constraint work_groups_break_mode_chk check (break_mode in ('fixed', 'window'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table work_groups add constraint work_groups_break_len_chk check (break_len in ('fixed', 'min'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table work_groups add constraint work_groups_overtime_chk check (overtime in ('none', 'pay', 'nv'));
exception when duplicate_object then null; end $$;

-- doterajšie flexibilné skupiny: rozumné predvolené hodnoty (fond 8 h, príchod 7–10, odchod 15–19)
update work_groups set
  daily_hours = coalesce(daily_hours, 8),
  arrive_from = coalesce(arrive_from, '07:00'), arrive_to = coalesce(arrive_to, '10:00'),
  leave_from  = coalesce(leave_from, '15:00'),  leave_to  = coalesce(leave_to, '19:00')
where flexible;

-- 2) Vlastné nastavenie zamestnanca (prázdne = podľa šablóny)
alter table employees add column if not exists work_override jsonb not null default '{}'::jsonb;

-- 3) Viditeľnosť kalendára
alter table employees add column if not exists cal_scope text not null default 'all';
do $$ begin
  alter table employees add constraint employees_cal_scope_chk check (cal_scope in ('self', 'all', 'selected'));
exception when duplicate_object then null; end $$;
-- prvé spustenie: prevziať doterajšie „vidí spoločný kalendár“
update employees set cal_scope = 'self' where not sees_calendar and cal_scope = 'all';

-- sees_calendar ostáva pre kompatibilitu = „nevidí len seba“
create or replace function sync_sees_calendar() returns trigger
language plpgsql as $$
begin
  new.sees_calendar := new.cal_scope <> 'self';
  return new;
end $$;
drop trigger if exists sync_sees_calendar on employees;
create trigger sync_sees_calendar before insert or update of cal_scope on employees
  for each row execute function sync_sees_calendar();

create table if not exists calendar_viewers (
  viewer_id  uuid not null references employees on delete cascade,   -- kto vidí
  target_id  uuid not null references employees on delete cascade,   -- koho vidí
  company_id uuid not null references companies on delete cascade,
  primary key (viewer_id, target_id)
);
alter table calendar_viewers enable row level security;
drop policy if exists own_read on calendar_viewers;
drop policy if exists admin on calendar_viewers;
create policy own_read on calendar_viewers for select to authenticated using (viewer_id = current_employee_id());
create policy admin on calendar_viewers for all to authenticated
  using (is_admin() and company_id = current_company_id())
  with check (is_admin() and company_id = current_company_id());
drop policy if exists ro_ins on calendar_viewers;
drop policy if exists ro_upd on calendar_viewers;
drop policy if exists ro_del on calendar_viewers;
create policy ro_ins on calendar_viewers as restrictive for insert to authenticated with check (company_writable(company_id));
create policy ro_upd on calendar_viewers as restrictive for update to authenticated
  using (company_writable(company_id)) with check (company_writable(company_id));
create policy ro_del on calendar_viewers as restrictive for delete to authenticated using (company_writable(company_id));

-- 4) Kalendár tímu: kto koho vidí (admin všetkých, vedúci aj svojich ľudí, inak podľa cal_scope)
drop view if exists team_calendar;
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
       or manages(en.employee_id)
       or exists (select 1 from employees x where x.id = me.id and x.cal_scope = 'all')
       or exists (select 1 from employees x
                  join calendar_viewers cv on cv.viewer_id = x.id
                  where x.id = me.id and x.cal_scope = 'selected' and cv.target_id = en.employee_id));
revoke all on team_calendar from anon;
grant select on team_calendar to authenticated;

commit;
