-- =====================================================================
-- KdeJe – migrácia 15: úpravy dochádzky (príchod, odchod, prestávka) na konkrétny deň
--   • tabuľka attendance – ukladajú sa len odchýlky od nastaveného pracovného času
--   • rovnaké pravidlá zápisu ako pri neprítomnostiach (uzávierka, schvaľovanie, vedúci, admin)
--   • žiadosti (requests) môžu byť aj o úpravu dochádzky (target = 'attendance')
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

create table if not exists attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees on delete cascade,
  day         date not null,
  arrive      time not null,                          -- príchod
  leave       time not null,                          -- odchod
  break_start time,                                   -- začiatok prestávky (prázdne = bez prestávky)
  break_min   int not null default 0 check (break_min between 0 and 240),
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, day),
  check (leave > arrive)
);
create index if not exists attendance_day on attendance (day);

drop trigger if exists attendance_updated on attendance;
create trigger attendance_updated before update on attendance for each row execute function set_updated_at();

-- audit (rovnako ako pri neprítomnostiach; po uzávierke → História úprav)
create or replace function audit_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare r attendance; locked boolean;
begin
  r := coalesce(new, old);
  locked := range_locked(r.employee_id, r.day, r.day, false);
  insert into audit_log(employee_id, table_name, action, row_id, after_lock, old_data, new_data)
  values (r.employee_id, 'attendance', tg_op, r.id, locked,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
drop trigger if exists attendance_audit on attendance;
create trigger attendance_audit after insert or update or delete on attendance
  for each row execute function audit_attendance();

-- RLS: vlastné, vedúci za svojich, admin za všetkých (ako entries)
alter table attendance enable row level security;
drop policy if exists own_read   on attendance;
drop policy if exists own_insert on attendance;
drop policy if exists own_update on attendance;
drop policy if exists own_delete on attendance;
drop policy if exists mgr_read   on attendance;
drop policy if exists mgr_insert on attendance;
drop policy if exists mgr_update on attendance;
drop policy if exists mgr_delete on attendance;
drop policy if exists admin      on attendance;
create policy own_read   on attendance for select to authenticated using (employee_id = current_employee_id());
create policy own_insert on attendance for insert to authenticated
  with check (employee_can_write(employee_id, day, day, false));
create policy own_update on attendance for update to authenticated
  using (employee_can_write(employee_id, day, day, true)) with check (employee_can_write(employee_id, day, day, true));
create policy own_delete on attendance for delete to authenticated
  using (employee_can_write(employee_id, day, day, true));
create policy mgr_read   on attendance for select to authenticated using (manages(employee_id));
create policy mgr_insert on attendance for insert to authenticated with check (manager_can_write(employee_id, day, day));
create policy mgr_update on attendance for update to authenticated
  using (manager_can_write(employee_id, day, day)) with check (manager_can_write(employee_id, day, day));
create policy mgr_delete on attendance for delete to authenticated using (manager_can_write(employee_id, day, day));
create policy admin on attendance for all to authenticated
  using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

-- režim len na čítanie (neuhradená faktúra) ako pri ostatných tabuľkách
drop policy if exists ro_ins on attendance;
drop policy if exists ro_upd on attendance;
drop policy if exists ro_del on attendance;
create policy ro_ins on attendance as restrictive for insert to authenticated
  with check (company_writable((select company_id from employees where id = employee_id)));
create policy ro_upd on attendance as restrictive for update to authenticated
  using (company_writable((select company_id from employees where id = employee_id)))
  with check (company_writable((select company_id from employees where id = employee_id)));
create policy ro_del on attendance as restrictive for delete to authenticated
  using (company_writable((select company_id from employees where id = employee_id)));

-- žiadosti aj o úpravu dochádzky
alter table requests add column if not exists target text not null default 'entry';
do $$ begin
  alter table requests add constraint requests_target_chk check (target in ('entry', 'attendance'));
exception when duplicate_object then null; end $$;

commit;
