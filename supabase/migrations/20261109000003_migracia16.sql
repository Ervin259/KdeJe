-- =====================================================================
-- KdeJe – migrácia 16: nadčasy – preplatiť alebo náhradné voľno
--   • tabuľka overtime_decisions – rozhodnutie za mesiac (koľko hodín nadčasu
--     sa preplatí a koľko ide do náhradného voľna); bez záznamu platí nastavenie z karty
--   • kódy neprítomností podľa Zákonníka práce:
--       NV  = Náhradné voľno (§ 121 – čerpanie nadčasov)        (nový význam)
--       NEV = Neplatené voľno (pracovné voľno bez náhrady mzdy)  (doteraz NV)
--       NEO = Neospravedlnená neprítomnosť                      (doteraz NEP)
--       PV  = Platené voľno (pracovné voľno s náhradou mzdy)     (bez zmeny kódu)
--     existujúce záznamy, nastavenia a čakajúce žiadosti sa preradia na nové kódy
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

-- ---------- Kódy neprítomností podľa ZP ----------
-- (prípadný NAV z predbežnej verzie tejto migrácie sa zlúči do NV)

-- predlohy pre nové firmy
delete from absence_type_templates where code in ('NAV');
update absence_type_templates set code = 'NEV', name = 'Neplatené voľno'
  where code = 'NV' and not exists (select 1 from absence_type_templates where code = 'NEV');
update absence_type_templates set code = 'NEO', name = 'Neospravedlnená neprítomnosť'
  where code = 'NEP' and not exists (select 1 from absence_type_templates where code = 'NEO');
update absence_type_templates set name = 'Platené voľno' where code = 'PV';
insert into absence_type_templates (code, name, kind, parts, enabled, is_health, sort)
values ('NV', 'Náhradné voľno', 'abs', array['full','half','hrs'], true, false, 4)
on conflict (code) do update set name = excluded.name;

-- typy vo firmách: najprv nové kódy (s nastaveniami pôvodných), potom preradenie záznamov
insert into absence_types (company_id, code, name, kind, parts, enabled, is_health, sort)
select company_id, 'NEV', 'Neplatené voľno', kind, parts, enabled, is_health, sort
from absence_types t where code = 'NV' and name <> 'Náhradné voľno'
on conflict (company_id, code) do nothing;
insert into absence_types (company_id, code, name, kind, parts, enabled, is_health, sort)
select company_id, 'NEO', 'Neospravedlnená neprítomnosť', kind, parts, enabled, is_health, sort
from absence_types t where code = 'NEP'
on conflict (company_id, code) do nothing;

-- preradenie bez zápisu do Histórie úprav (nejde o zmenu dochádzky, len premenovanie kódu)
alter table entries disable trigger entries_audit;
alter table entries disable trigger entries_updated;
update entries e set type = 'NEV'
  where type = 'NV'
    and exists (select 1 from employees x join absence_types t on t.company_id = x.company_id
                where x.id = e.employee_id and t.code = 'NV' and t.name <> 'Náhradné voľno');
update entries set type = 'NEO' where type = 'NEP';
alter table entries enable trigger entries_audit;
alter table entries enable trigger entries_updated;

update requests set payload = jsonb_set(payload, '{type}', '"NEV"')
  where status = 'pending' and payload->>'type' = 'NV'
    and exists (select 1 from employees x join absence_types t on t.company_id = x.company_id
                where x.id = requests.employee_id and t.code = 'NV' and t.name <> 'Náhradné voľno');
update requests set payload = jsonb_set(payload, '{type}', '"NEO"')
  where status = 'pending' and payload->>'type' = 'NEP';

delete from absence_types where code = 'NEP';
update absence_types set name = 'Náhradné voľno', kind = 'abs', parts = array['full','half','hrs'], enabled = true, is_health = false, sort = 4
  where code = 'NV';
update absence_types set name = 'Platené voľno' where code = 'PV';
insert into absence_types (company_id, code, name, kind, parts, enabled, is_health, sort)
select c.id, 'NV', 'Náhradné voľno', 'abs', array['full','half','hrs'], true, false, 4
from companies c
on conflict (company_id, code) do nothing;

-- predbežný kód NAV (ak by existoval) → NV
alter table entries disable trigger entries_audit;
update entries set type = 'NV' where type = 'NAV';
alter table entries enable trigger entries_audit;
delete from absence_types where code = 'NAV';

commit;
