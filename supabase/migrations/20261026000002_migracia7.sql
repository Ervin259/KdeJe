-- =====================================================================
-- KdeJe – migrácia 7: skúšobná doba 3 mesiace, doúčtovanie pridaných užívateľov
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- Predpoklad: migrácie 3–6. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- 1) Skúšobná doba 3 mesiace (platí pre nové firmy; existujúcim sa nemení)
alter table platform_settings alter column trial_months set default 3;
update platform_settings set trial_months = 3 where id = 1;

create or replace function approve_signup(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s company_signups; c uuid;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  select * into s from company_signups where id = p_id for update;
  if s.id is null or s.status <> 'pending' then raise exception 'Žiadosť už bola vybavená.'; end if;
  c := create_company(s.company_name, s.admin_name, s.admin_email, s.ico,
                      coalesce((select trial_months from platform_settings where id = 1), 3));
  update company_signups set status = 'approved', decided_at = now(), decided_by = auth.uid(), company_id = c
  where id = p_id;
  return c;
end $$;

-- 2) Odkedy a dokedy bol užívateľ aktívny (podklad pre doúčtovanie)
alter table employees add column if not exists activated_on   date;
alter table employees add column if not exists deactivated_on date;
update employees set activated_on = created_at::date where activated_on is null;
update employees set deactivated_on = updated_at::date where not active and deactivated_on is null;

create or replace function track_active() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.activated_on := coalesce(new.activated_on, current_date);
    if not new.active then new.deactivated_on := coalesce(new.deactivated_on, current_date); end if;
  elsif new.active is distinct from old.active then
    if new.active then
      new.activated_on := current_date;
      new.deactivated_on := null;
    else
      new.deactivated_on := current_date;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists employees_track_active on employees;
create trigger employees_track_active before insert or update of active on employees
  for each row execute function track_active();

-- 3) Doúčtovanie na faktúre
alter table invoices add column if not exists extra_units  int not null default 0;          -- užívateľo-mesiace nad zaplatený počet
alter table invoices add column if not exists extra_amount numeric(10,2) not null default 0;
alter table invoices add column if not exists extra_from   date;
alter table invoices add column if not exists extra_to     date;

-- Užívateľo-mesiace nad zaplatený počet v období: za každý mesiac
-- max(0, počet aktívnych v tom mesiaci − zaplatený počet).
-- Užívateľ sa ráta v mesiaci, v ktorom bol aspoň jeden deň aktívny.
create or replace function billing_extra_units(p_company uuid, p_from date, p_to date, p_paid int) returns int
language sql stable security definer set search_path = public as $$
  select case when not is_platform_admin() then 0 else coalesce(sum(greatest(0, n - p_paid)), 0)::int end
  from (
    select m, (select count(*) from employees e
               where e.company_id = p_company and not e.is_external
                 and coalesce(e.activated_on, e.created_at::date) <= (m + interval '1 month - 1 day')::date
                 and (e.deactivated_on is null or e.deactivated_on >= m)) as n
    from generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') g(m)
  ) x
$$;
revoke execute on function billing_extra_units(uuid,date,date,int) from public, anon;
grant execute on function billing_extra_units(uuid,date,date,int) to authenticated;

commit;
