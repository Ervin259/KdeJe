-- =====================================================================
-- KdeJe – migrácia 7: skúšobná doba 3 mesiace, ročné vyrovnanie počtu užívateľov
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

-- 3) Ročné vyrovnanie na ďalšej faktúre (oboma smermi, bez dobropisov)
alter table invoices add column if not exists extra_units  int not null default 0;            -- vyrovnanie v užívateľo-mesiacoch (+ doplatok / − odpočet)
alter table invoices add column if not exists extra_amount numeric(10,2) not null default 0;  -- vyrovnanie v €
alter table invoices add column if not exists extra_from   date;                              -- obdobie, za ktoré sa vyrovnáva
alter table invoices add column if not exists extra_to     date;
alter table invoices add column if not exists carry_in     numeric(10,2) not null default 0;  -- nevyčerpaný odpočet z predchádzajúcej faktúry (≤ 0)
alter table invoices add column if not exists carry_out    numeric(10,2) not null default 0;  -- odpočet, ktorý sa nezmestil, prenáša sa ďalej (≤ 0)
alter table invoices drop constraint if exists invoices_amount_check;
alter table invoices add constraint invoices_amount_check check (amount >= 0);

drop function if exists billing_extra_units(uuid,date,date,int);

-- Vyrovnanie za obdobie: Σ po 12 mesiacoch obdobia max(aktívni v mesiaci, minimum) − zaplatený počet × 12.
-- Užívateľ sa ráta v mesiaci obdobia, v ktorom bol aspoň jeden deň aktívny.
-- Kladné = doplatok, záporné = odpočet.
create or replace function billing_settlement_units(p_company uuid, p_from date, p_to date, p_paid int, p_min int)
returns int
language sql stable security definer set search_path = public as $$
  select case when not is_platform_admin() then 0 else
    coalesce(sum(greatest(n, p_min)), 0)::int - p_paid * count(*)::int end
  from (
    select (select count(*) from employees e
            where e.company_id = p_company and not e.is_external
              and coalesce(e.activated_on, e.created_at::date) <= least(s.m_end, p_to)
              and (e.deactivated_on is null or e.deactivated_on >= s.m_start)) as n
    from (
      select (p_from + make_interval(months => i))::date as m_start,
             (p_from + make_interval(months => i + 1) - interval '1 day')::date as m_end
      from generate_series(0, 11) i
      where (p_from + make_interval(months => i))::date <= p_to
    ) s
  ) x
$$;
revoke execute on function billing_settlement_units(uuid,date,date,int,int) from public, anon;
grant execute on function billing_settlement_units(uuid,date,date,int,int) to authenticated;

-- 4) Pokračovanie po skúšobnej dobe: admin firmy ho potvrdí, až potom sa vystaví prvá faktúra.
--    Bez potvrdenia je firma po skončení skúšobnej doby len na čítanie (bez faktúry).
alter table companies add column if not exists continue_confirmed_at timestamptz;
alter table companies add column if not exists continue_confirmed_by uuid;

create or replace function confirm_continue() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Len pre admina firmy'; end if;
  update companies set continue_confirmed_at = now(), continue_confirmed_by = auth.uid()
  where id = current_company_id() and continue_confirmed_at is null;
end $$;
revoke execute on function confirm_continue() from public, anon;
grant execute on function confirm_continue() to authenticated;

create or replace function company_writable(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or (
    coalesce((select status <> 'suspended'
                     -- skončená skúšobná doba bez potvrdenia pokračovania
                     and not (status = 'trial' and not billing_exempt and trial_until < current_date
                              and continue_confirmed_at is null)
              from companies where id = p_company), true)
    and not exists (
      select 1 from invoices i, platform_settings s
      where i.company_id = p_company and i.status = 'issued'
        and i.due_on + s.grace_days < current_date
    )
  )
$$;

drop function if exists platform_companies();
create or replace function platform_companies()
returns table (id uuid, name text, ico text, status text, trial_until date, paid_until date, billing_exempt boolean,
               created_at timestamptz, employees bigint, admins text,
               billing_name text, billing_street text, billing_city text, billing_zip text, billing_dic text, billing_email text,
               writable boolean, continue_confirmed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.ico, c.status, c.trial_until, c.paid_until, c.billing_exempt, c.created_at,
         (select count(*) from employees e where e.company_id = c.id and e.active and not e.is_external),
         (select string_agg(e.name || coalesce(' <' || e.email || '>', ''), ', ' order by e.name)
            from employees e where e.company_id = c.id and e.role = 'admin' and e.active),
         c.billing_name, c.billing_street, c.billing_city, c.billing_zip, c.billing_dic, c.billing_email,
         company_writable(c.id) and c.status <> 'suspended',
         c.continue_confirmed_at
  from companies c
  where is_platform_admin()
  order by c.created_at
$$;
revoke execute on function platform_companies() from public, anon;
grant execute on function platform_companies() to authenticated;

commit;
