-- =====================================================================
-- KdeJe – migrácia 13: vlastné zoznamy Typ vzťahu, Prevádzka a Oddelenie
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- 1) Typ vzťahu (predtým „pracovný pomer“) už nie je pevný zoznam – stĺpec je text.
--    Pohľad a politika, ktoré stĺpec používajú, sa musia dočasne zrušiť a znova vytvoriť.
drop policy if exists own_confirm on month_confirmations;
drop view if exists team_calendar;

alter table employees alter column contract_type type text using contract_type::text;
-- živnosť a s.r.o. sa zlučujú do EXT
update employees set contract_type = 'EXT' where contract_type in ('ZIV', 'SRO');

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
       or exists (select 1 from employees x where x.id = me.id and x.sees_calendar));
revoke all on team_calendar from anon;
grant select on team_calendar to authenticated;

create policy own_confirm on month_confirmations for insert to authenticated
  with check (
    employee_id = current_employee_id()
    and (select contract_type from employees where id = employee_id) <> 'DOH'
    and current_date >= (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date - 3
  );

-- 2) Zoznamy hodnôt firmy (výber v karte zamestnanca)
create table if not exists org_options (
  id         bigint generated always as identity primary key,
  company_id uuid not null references companies on delete cascade,
  kind       text not null check (kind in ('contract', 'site', 'department')),
  value      text not null check (length(btrim(value)) between 1 and 60),
  unique (company_id, kind, value)
);
alter table org_options enable row level security;
drop policy if exists read on org_options;
drop policy if exists admin on org_options;
create policy read  on org_options for select to authenticated using (company_id = current_company_id());
create policy admin on org_options for all to authenticated
  using (is_admin() and company_id = current_company_id())
  with check (is_admin() and company_id = current_company_id());
drop policy if exists ro_ins on org_options;
drop policy if exists ro_upd on org_options;
drop policy if exists ro_del on org_options;
create policy ro_ins on org_options as restrictive for insert to authenticated with check (company_writable(company_id));
create policy ro_upd on org_options as restrictive for update to authenticated
  using (company_writable(company_id)) with check (company_writable(company_id));
create policy ro_del on org_options as restrictive for delete to authenticated using (company_writable(company_id));

-- naplnenie: základné typy vzťahu + doteraz použité hodnoty
insert into org_options (company_id, kind, value)
select c.id, 'contract', v from companies c cross join unnest(array['TPP', 'DOH', 'EXT']) v
on conflict do nothing;
insert into org_options (company_id, kind, value)
select distinct company_id, 'contract', contract_type from employees where contract_type is not null
on conflict do nothing;
insert into org_options (company_id, kind, value)
select distinct company_id, 'site', btrim(site) from employees where coalesce(btrim(site), '') <> ''
on conflict do nothing;
insert into org_options (company_id, kind, value)
select distinct company_id, 'department', btrim(department) from employees where coalesce(btrim(department), '') <> ''
on conflict do nothing;

-- nová firma dostane základné typy vzťahu
create or replace function seed_org_options() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into org_options (company_id, kind, value)
  select new.id, 'contract', v from unnest(array['TPP', 'DOH', 'EXT']) v
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists seed_org_options on companies;
create trigger seed_org_options after insert on companies for each row execute function seed_org_options();

-- 3) Premenovanie hodnoty – zmení ju aj u všetkých zamestnancov firmy (TPP a DOH sa nemenia)
create or replace function rename_org_option(p_kind text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := current_company_id();
begin
  if not is_admin() then raise exception 'Len pre admina firmy'; end if;
  if not company_writable(c) then raise exception 'Firma je v režime len na čítanie'; end if;
  p_new := btrim(regexp_replace(p_new, '\s+', ' ', 'g'));
  if p_new = '' or length(p_new) > 60 then raise exception 'Názov musí mať 1 až 60 znakov'; end if;
  if p_kind = 'contract' and p_old in ('TPP', 'DOH') then raise exception 'TPP a DOH sa nedajú premenovať'; end if;
  if p_old = p_new then return; end if;
  if exists (select 1 from org_options where company_id = c and kind = p_kind and value = p_new) then
    raise exception 'Hodnota „%“ už v zozname je', p_new;
  end if;
  update org_options set value = p_new where company_id = c and kind = p_kind and value = p_old;
  if p_kind = 'contract' then
    update employees set contract_type = p_new where company_id = c and contract_type = p_old;
  elsif p_kind = 'site' then
    update employees set site = p_new where company_id = c and site = p_old;
  elsif p_kind = 'department' then
    update employees set department = p_new where company_id = c and department = p_old;
  end if;
end $$;
revoke execute on function rename_org_option(text, text, text) from public, anon;
grant execute on function rename_org_option(text, text, text) to authenticated;

commit;
