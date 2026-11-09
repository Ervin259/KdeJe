-- =====================================================================
-- KdeJe – migrácia 16: nadčasy – preplatiť alebo náhradné voľno
--   • tabuľka overtime_decisions – rozhodnutie za mesiac (koľko hodín nadčasu
--     sa preplatí a koľko ide do náhradného voľna); bez záznamu platí nastavenie z karty
--   • nový typ neprítomnosti NAV = Náhradné voľno (čerpanie nadčasov, § 121 ZP)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

create table if not exists overtime_decisions (
  employee_id uuid not null references employees on delete cascade,
  month       date not null check (extract(day from month) = 1),   -- prvý deň mesiaca
  pay_h       numeric(6,2) not null default 0 check (pay_h >= 0),  -- preplatiť (hodiny)
  nv_h        numeric(6,2) not null default 0 check (nv_h >= 0),   -- do náhradného voľna (hodiny)
  note        text,
  decided_by  uuid default auth.uid(),
  decided_at  timestamptz not null default now(),
  primary key (employee_id, month)
);

alter table overtime_decisions enable row level security;
drop policy if exists own_read on overtime_decisions;
drop policy if exists mgr_read on overtime_decisions;
drop policy if exists mgr_write on overtime_decisions;
drop policy if exists admin on overtime_decisions;
-- zamestnanec rozhodnutie len vidí; rozhoduje vedúci za svojich a admin
create policy own_read  on overtime_decisions for select to authenticated using (employee_id = current_employee_id());
create policy mgr_read  on overtime_decisions for select to authenticated using (manages(employee_id));
create policy mgr_write on overtime_decisions for all to authenticated
  using (manages(employee_id) and employee_id <> current_employee_id())
  with check (manages(employee_id) and employee_id <> current_employee_id());
create policy admin on overtime_decisions for all to authenticated
  using (is_admin() and emp_in_my_company(employee_id)) with check (is_admin() and emp_in_my_company(employee_id));

-- režim len na čítanie (neuhradená faktúra)
drop policy if exists ro_ins on overtime_decisions;
drop policy if exists ro_upd on overtime_decisions;
drop policy if exists ro_del on overtime_decisions;
create policy ro_ins on overtime_decisions as restrictive for insert to authenticated
  with check (company_writable((select company_id from employees where id = employee_id)));
create policy ro_upd on overtime_decisions as restrictive for update to authenticated
  using (company_writable((select company_id from employees where id = employee_id)))
  with check (company_writable((select company_id from employees where id = employee_id)));
create policy ro_del on overtime_decisions as restrictive for delete to authenticated
  using (company_writable((select company_id from employees where id = employee_id)));

-- Náhradné voľno ako typ neprítomnosti (pre nové firmy aj všetky existujúce)
insert into absence_type_templates (code, name, kind, parts, enabled, is_health, sort)
values ('NAV', 'Náhradné voľno', 'abs', array['full','half','hrs'], true, false, 4)
on conflict (code) do nothing;

insert into absence_types (company_id, code, name, kind, parts, enabled, is_health, sort)
select c.id, 'NAV', 'Náhradné voľno', 'abs', array['full','half','hrs'], true, false, 4
from companies c
on conflict (company_id, code) do nothing;

commit;
