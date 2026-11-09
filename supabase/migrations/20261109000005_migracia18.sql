-- =====================================================================
-- KdeJe – migrácia 18: šablóny pracovného času podľa typu vzťahu
--   • work_groups.contract_type – pre ktorý typ vzťahu je šablóna (TPP, EXT, DOH…);
--     prázdne = pre všetky typy
--   • doplnenie: šablóna, ktorej všetci zamestnanci majú rovnaký typ vzťahu, dostane tento typ
--   • šablóny pre DOH a EXT: bez stravných lístkov; pre DOH aj bez nadčasov
--     (to isté vo vlastnom nastavení dohodárov a EXT v karte zamestnanca)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

alter table work_groups add column if not exists contract_type text;

-- doplniť typ vzťahu podľa zamestnancov v šablóne (len ak ešte nie je vyplnený a všetci majú rovnaký typ)
update work_groups g
   set contract_type = x.ct
  from (
    select work_group_id, min(contract_type) as ct
      from employees
     where work_group_id is not null and coalesce(is_external, false) = false
     group by work_group_id
    having count(distinct contract_type) = 1
  ) x
 where x.work_group_id = g.id
   and g.contract_type is null;

-- DOH a EXT nemajú stravné lístky, DOH nemá nadčasy
update work_groups set meal_voucher = false where contract_type in ('DOH', 'EXT') and meal_voucher;
update work_groups set overtime = 'none' where contract_type = 'DOH' and overtime <> 'none';

update employees
   set work_override = work_override - 'meal_voucher'
 where contract_type in ('DOH', 'EXT') and work_override ? 'meal_voucher';
update employees
   set work_override = work_override - 'overtime'
 where contract_type = 'DOH' and work_override ? 'overtime';

commit;

-- kontrola: šablóny a ich typ vzťahu
select g.name, g.contract_type, g.meal_voucher, g.overtime,
       (select count(*) from employees e where e.work_group_id = g.id and e.active) as zamestnancov
  from work_groups g
 order by g.company_id, g.sort, g.name;
