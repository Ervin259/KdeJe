-- =====================================================================
-- KdeJe – migrácia 21: meno a priezvisko zvlášť, prezývka, oslovenie; text notifikácie pre tykanie
--   • employees.first_name, last_name, nickname, salutation ('pan' | 'pani' | 'ty')
--   • employees.name ostáva (zobrazované celé meno) – trigger ho drží v súlade:
--       zmena mena/priezviska → name = meno + priezvisko; zmena len name (import, staré časti) → rozdelí sa
--   • doplnenie: meno = všetko okrem posledného slova, priezvisko = posledné slovo;
--     oslovenie odhadom podľa priezviska (-ová / -á = pani, inak pán) – treba skontrolovať v kartách
--   • notification_rules.body_ty – text e-mailu pre tykanie (prázdne = predvolený)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

alter table employees add column if not exists first_name text;
alter table employees add column if not exists last_name  text;
alter table employees add column if not exists nickname   text;
alter table employees add column if not exists salutation text;
do $$ begin
  alter table employees add constraint employees_salutation_chk check (salutation in ('pan', 'pani', 'ty'));
exception when duplicate_object then null; end $$;

alter table notification_rules add column if not exists body_ty text;

-- rozdelenie celého mena: posledné slovo = priezvisko
create or replace function split_name(p text, out f text, out l text)
language sql immutable as $$
  select nullif(trim(regexp_replace(trim(coalesce(p, '')), '\s*\S+$', '')), ''),
         nullif(substring(trim(coalesce(p, '')) from '(\S+)$'), '')
$$;

create or replace function employees_sync_name() returns trigger
language plpgsql as $$
declare s record;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.first_name, '') <> '' or coalesce(new.last_name, '') <> '' then
      new.name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
    else
      s := split_name(new.name);
      new.first_name := s.f; new.last_name := s.l;
    end if;
  elsif new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    new.name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  elsif new.name is distinct from old.name then
    s := split_name(new.name);
    new.first_name := s.f; new.last_name := s.l;
  end if;
  new.nickname := nullif(trim(coalesce(new.nickname, '')), '');
  return new;
end $$;
drop trigger if exists employees_sync_name on employees;
create trigger employees_sync_name before insert or update on employees
  for each row execute function employees_sync_name();

-- doplniť existujúcich (len kde ešte nie je meno ani priezvisko)
update employees e
   set first_name = s.f, last_name = s.l
  from (select id, (split_name(name)).f, (split_name(name)).l from employees) s
 where s.id = e.id and e.first_name is null and e.last_name is null;

update employees
   set salutation = case when last_name ~* '(ová|á)$' then 'pani' else 'pan' end
 where salutation is null and coalesce(is_external, false) = false;

commit;

select name, first_name, last_name, salutation from employees order by company_id, last_name, first_name;
