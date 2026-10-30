-- =====================================================================
-- KdeJe – migrácia 9: prevádzka a oddelenie zamestnanca, odsúhlasenie
--           dochádzky už 3 dni pred koncom mesiaca
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- 1) Prevádzka a oddelenie (voľný text, výber v kalendári sa skladá z použitých hodnôt)
alter table employees add column if not exists site       text;
alter table employees add column if not exists department text;

-- 2) Odsúhlasenie mesiaca: zamestnanec (TPP) aj vedúci už 3 dni pred koncom mesiaca
--    (admin môže kedykoľvek – politika „admin“ sa nemení)
drop policy if exists own_confirm on month_confirmations;
create policy own_confirm on month_confirmations for insert to authenticated
  with check (
    employee_id = current_employee_id()
    and (select contract_type from employees where id = employee_id) = 'TPP'
    and current_date >= (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date - 3
  );
drop policy if exists mgr_confirm on month_confirmations;
create policy mgr_confirm on month_confirmations for insert to authenticated
  with check (
    manages(employee_id)
    and current_date >= (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date - 3
  );

-- 3) Euro Data Distribution – prevádzky a oddelenia podľa prílohy PO.xlsx
drop table if exists pg_temp.po;
create temp table po (meno text, site text, dept text);
insert into po values
  ('Ervín Goga', 'Bratislava', 'MAN'),
  ('Ján Kľuska', 'Bratislava', 'MNG'),
  ('Jana Ivaničová', 'Bratislava', 'OM'),
  ('Anka Bučková', 'Bratislava', 'PM'),
  ('Miroslav Loipersberger', 'Bratislava', 'SKL'),
  ('Roman Betka', 'Home', 'IT'),
  ('Denisa Míková', 'Home', 'OM'),
  ('Anka Fedorová', 'Košice', 'OM'),
  ('Slávka Rusnáková', 'Košice', 'OM'),
  ('Alena Sladká', 'Žilina', 'EKN'),
  ('Iveta Jakubíková', 'Žilina', 'EKN'),
  ('Miriam Žuchová', 'Žilina', 'EKN'),
  ('Ivana Jedináková', 'Žilina', 'OM'),
  ('Jana Přikrylová', 'Žilina', 'OM'),
  ('Daniel Poljak', 'Žilina', 'PM'),
  ('Dušan Fertáľ', 'Žilina', 'PM'),
  ('Peter Bielik', 'Žilina', 'PM'),
  ('Peter Šlopek', 'Žilina', 'PM'),
  ('Ján Lamžo', 'Žilina', 'SKL'),
  ('Michal Husárik', 'Žilina', 'SKL'),
  ('Miroslav Lamžo', 'Žilina', 'SKL'),
  ('Pavol Šmehyl', 'Žilina', 'SKL'),
  ('Peter Marušák', 'Žilina', 'SKL'),
  ('Roman Bury', 'Žilina', 'SKL');

update employees e set site = po.site, department = po.dept
from po
where e.company_id = '00000000-0000-0000-0000-000000000001' and lower(trim(e.name)) = lower(po.meno);

commit;

-- kontrola: mená z prílohy, ktoré sa v EDD nenašli (má byť prázdne)
select po.meno as nenajdene from po
where not exists (select 1 from employees e
                  where e.company_id = '00000000-0000-0000-0000-000000000001' and lower(trim(e.name)) = lower(po.meno));

