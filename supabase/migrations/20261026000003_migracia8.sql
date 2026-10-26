-- =====================================================================
-- KdeJe – migrácia 8: fakturačné údaje pri registrácii, upozornenia superadmina
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- Predpoklad: migrácie 3–7. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- 1) Žiadosť o zriadenie: DIČ, IČ DPH a adresa sídla
alter table company_signups add column if not exists dic    text;
alter table company_signups add column if not exists icdph  text;
alter table company_signups add column if not exists street text;
alter table company_signups add column if not exists city   text;
alter table company_signups add column if not exists zip    text;

-- 2) Firma: IČ DPH a telefón na faktúru
alter table companies add column if not exists billing_icdph text;
alter table companies add column if not exists billing_phone text;
grant update (name, ico, address, billing_name, billing_street, billing_city, billing_zip, billing_dic, billing_email,
              billing_icdph, billing_phone)
  on companies to authenticated;

-- 3) Kam posielať upozornenia pre superadmina
alter table platform_settings add column if not exists notify_email text default 'admin@sigmadigital.sk';
update platform_settings set notify_email = 'admin@sigmadigital.sk' where id = 1 and notify_email is null;

-- 4) Odoslanie žiadosti s fakturačnými údajmi
drop function if exists submit_signup(text,text,text,text,text,int,text);
create or replace function submit_signup(
  p_company text, p_ico text, p_name text, p_email text,
  p_phone text default null, p_employees int default null, p_note text default null,
  p_dic text default null, p_icdph text default null,
  p_street text default null, p_city text default null, p_zip text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid; e text := lower(trim(p_email));
  t text[] := array[p_company, p_name, p_email, p_phone, p_dic, p_icdph, p_street, p_city, p_zip];
  v text;
begin
  if coalesce(trim(p_company), '') = '' or coalesce(trim(p_name), '') = '' then
    raise exception 'Vyplňte názov firmy a meno.';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail nemá správny tvar.'; end if;
  foreach v in array t loop
    if length(coalesce(v, '')) > 200 then raise exception 'Príliš dlhý text.'; end if;
  end loop;
  if length(coalesce(p_note, '')) > 2000 then raise exception 'Príliš dlhý text.'; end if;
  if (select count(*) from company_signups where admin_email = e and status = 'pending') >= 3 then
    raise exception 'Žiadosť s týmto e-mailom už čaká na vybavenie.';
  end if;
  insert into company_signups (company_name, ico, admin_name, admin_email, phone, employees_est, note,
                               dic, icdph, street, city, zip)
  values (trim(p_company),
          nullif(regexp_replace(coalesce(p_ico, ''), '\s', '', 'g'), ''),
          trim(p_name), e,
          nullif(trim(coalesce(p_phone, '')), ''), p_employees, nullif(trim(coalesce(p_note, '')), ''),
          nullif(regexp_replace(coalesce(p_dic, ''), '\s', '', 'g'), ''),
          nullif(upper(regexp_replace(coalesce(p_icdph, ''), '\s', '', 'g')), ''),
          nullif(trim(coalesce(p_street, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
          nullif(trim(coalesce(p_zip, '')), ''))
  returning id into r;
  return r;
end $$;
revoke execute on function submit_signup(text,text,text,text,text,int,text,text,text,text,text,text) from public;
grant execute on function submit_signup(text,text,text,text,text,int,text,text,text,text,text,text) to anon, authenticated;

-- 5) Schválenie: fakturačné údaje sa prenesú do firmy
create or replace function approve_signup(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s company_signups; c uuid;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  select * into s from company_signups where id = p_id for update;
  if s.id is null or s.status <> 'pending' then raise exception 'Žiadosť už bola vybavená.'; end if;
  c := create_company(s.company_name, s.admin_name, s.admin_email, s.ico,
                      coalesce((select trial_months from platform_settings where id = 1), 3));
  update companies set
    address        = nullif(concat_ws(', ', s.street, concat_ws(' ', s.zip, s.city)), ''),
    billing_name   = s.company_name,
    billing_street = s.street,
    billing_city   = s.city,
    billing_zip    = s.zip,
    billing_dic    = s.dic,
    billing_icdph  = s.icdph,
    billing_email  = s.admin_email,
    billing_phone  = s.phone
  where id = c;
  update company_signups set status = 'approved', decided_at = now(), decided_by = auth.uid(), company_id = c
  where id = p_id;
  return c;
end $$;

-- 6) Prehľad firiem pre superadmina – s IČ DPH a telefónom
drop function if exists platform_companies();
create or replace function platform_companies()
returns table (id uuid, name text, ico text, status text, trial_until date, paid_until date, billing_exempt boolean,
               created_at timestamptz, employees bigint, admins text,
               billing_name text, billing_street text, billing_city text, billing_zip text, billing_dic text, billing_email text,
               writable boolean, continue_confirmed_at timestamptz, billing_icdph text, billing_phone text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.ico, c.status, c.trial_until, c.paid_until, c.billing_exempt, c.created_at,
         (select count(*) from employees e where e.company_id = c.id and e.active and not e.is_external),
         (select string_agg(e.name || coalesce(' <' || e.email || '>', ''), ', ' order by e.name)
            from employees e where e.company_id = c.id and e.role = 'admin' and e.active),
         c.billing_name, c.billing_street, c.billing_city, c.billing_zip, c.billing_dic, c.billing_email,
         company_writable(c.id) and c.status <> 'suspended',
         c.continue_confirmed_at, c.billing_icdph, c.billing_phone
  from companies c
  where is_platform_admin()
  order by c.created_at
$$;
revoke execute on function platform_companies() from public, anon;
grant execute on function platform_companies() to authenticated;

commit;
