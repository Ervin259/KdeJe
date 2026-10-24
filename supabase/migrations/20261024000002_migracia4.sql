-- =====================================================================
-- KdeJe – migrácia 4: žiadosti o zriadenie služby (registrácia firmy)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- Predpoklad: migrácia 3. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

create table if not exists company_signups (
  id            uuid primary key default gen_random_uuid(),
  company_name  text not null,
  ico           text,
  admin_name    text not null,
  admin_email   text not null,
  phone         text,
  employees_est int,
  note          text,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid,
  reject_reason text,
  company_id    uuid references companies on delete set null
);
alter table company_signups drop constraint if exists company_signups_status_check;
alter table company_signups add constraint company_signups_status_check
  check (status in ('pending','approved','rejected'));
create index if not exists company_signups_status on company_signups(status, created_at desc);

alter table company_signups enable row level security;
drop policy if exists platform_all on company_signups;
create policy platform_all on company_signups for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Odoslanie žiadosti z verejnej stránky (aj bez prihlásenia)
create or replace function submit_signup(
  p_company text, p_ico text, p_name text, p_email text,
  p_phone text default null, p_employees int default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid; e text := lower(trim(p_email));
begin
  if coalesce(trim(p_company), '') = '' or coalesce(trim(p_name), '') = '' then
    raise exception 'Vyplňte názov firmy a meno.';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail nemá správny tvar.'; end if;
  if length(p_company) > 200 or length(p_name) > 200 or length(e) > 200
     or length(coalesce(p_note, '')) > 2000 or length(coalesce(p_phone, '')) > 40 then
    raise exception 'Príliš dlhý text.';
  end if;
  -- ochrana pred opakovaným odosielaním
  if (select count(*) from company_signups where admin_email = e and status = 'pending') >= 3 then
    raise exception 'Žiadosť s týmto e-mailom už čaká na vybavenie.';
  end if;
  insert into company_signups (company_name, ico, admin_name, admin_email, phone, employees_est, note)
  values (trim(p_company), nullif(regexp_replace(coalesce(p_ico, ''), '\s', '', 'g'), ''), trim(p_name), e,
          nullif(trim(coalesce(p_phone, '')), ''), p_employees, nullif(trim(coalesce(p_note, '')), ''))
  returning id into r;
  return r;
end $$;

-- Schválenie žiadosti superadminom: založí firmu a admina (pozvánku pošle aplikácia)
create or replace function approve_signup(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s company_signups; c uuid;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  select * into s from company_signups where id = p_id for update;
  if s.id is null or s.status <> 'pending' then raise exception 'Žiadosť už bola vybavená.'; end if;
  if exists (select 1 from employees e join auth.users u on u.id = e.user_id where lower(u.email) = s.admin_email) then
    raise exception 'E-mail % už v KdeJe používa iný účet. Admin novej firmy potrebuje iný e-mail.', s.admin_email;
  end if;
  c := create_company(s.company_name, s.admin_name, s.admin_email, s.ico, 12);
  update company_signups set status = 'approved', decided_at = now(), decided_by = auth.uid(), company_id = c
  where id = p_id;
  return c;
end $$;

-- Prehľad firiem pre superadmina (počet aktívnych zamestnancov a admin)
create or replace function platform_companies()
returns table (id uuid, name text, ico text, status text, trial_until date, created_at timestamptz,
               employees bigint, admins text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.ico, c.status, c.trial_until, c.created_at,
         (select count(*) from employees e where e.company_id = c.id and e.active),
         (select string_agg(e.name || coalesce(' <' || e.email || '>', ''), ', ' order by e.name)
            from employees e where e.company_id = c.id and e.role = 'admin' and e.active)
  from companies c
  where is_platform_admin()
  order by c.created_at
$$;

revoke execute on function submit_signup(text,text,text,text,text,int,text) from public;
grant execute on function submit_signup(text,text,text,text,text,int,text) to anon, authenticated;
revoke execute on function approve_signup(uuid), platform_companies() from public, anon;
grant execute on function approve_signup(uuid), platform_companies() to authenticated;

commit;
