-- =====================================================================
-- KdeJe – migrácia 5: fakturácia predplatného
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- Predpoklad: migrácie 3 a 4. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) ÚDAJE DODÁVATEĽA A PRAVIDLÁ FAKTURÁCIE (jeden riadok, mení superadmin)
--    Verejne čitateľné – zobrazujú sa v obchodných podmienkach.
-- ---------------------------------------------------------------------
create table if not exists platform_settings (
  id               int primary key default 1 check (id = 1),
  supplier_name    text,          -- obchodné meno
  supplier_address text,          -- sídlo / miesto podnikania
  supplier_ico     text,
  supplier_dic     text,
  supplier_register text,         -- zápis v registri (napr. Živnostenský register OÚ …)
  supplier_email   text,
  supplier_phone   text,
  iban             text,
  price_month      numeric(6,2) not null default 1,     -- € za zamestnanca mesačne
  min_employees    int not null default 5,              -- minimum na firmu
  trial_months     int not null default 12,
  due_days         int not null default 14,             -- splatnosť faktúry
  grace_days       int not null default 14,             -- po splatnosti → len na čítanie
  delete_after_days int not null default 90,            -- po obmedzení → možné vymazanie
  vat_payer        boolean not null default false,
  updated_at       timestamptz not null default now()
);
insert into platform_settings (id) values (1) on conflict do nothing;

alter table platform_settings enable row level security;
drop policy if exists read on platform_settings;
create policy read on platform_settings for select to anon, authenticated using (true);
drop policy if exists platform_all on platform_settings;
create policy platform_all on platform_settings for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
grant select on platform_settings to anon;

-- ---------------------------------------------------------------------
-- 2) FAKTURAČNÉ ÚDAJE FIRMY
-- ---------------------------------------------------------------------
alter table companies add column if not exists billing_name   text;
alter table companies add column if not exists billing_street text;
alter table companies add column if not exists billing_city   text;
alter table companies add column if not exists billing_zip    text;
alter table companies add column if not exists billing_dic    text;
alter table companies add column if not exists billing_email  text;
alter table companies add column if not exists paid_until     date;     -- uhradené obdobie do
alter table companies add column if not exists billing_exempt boolean not null default false;

-- Euro Data Distribution (vlastná firma) sa nefakturuje – superadmin môže zmeniť
update companies set billing_exempt = true where id = '00000000-0000-0000-0000-000000000001';

-- Admin firmy smie meniť aj fakturačné údaje (stav, obdobie a výnimku nie)
grant update (name, ico, address, billing_name, billing_street, billing_city, billing_zip, billing_dic, billing_email)
  on companies to authenticated;

-- ---------------------------------------------------------------------
-- 3) FAKTÚRY
-- ---------------------------------------------------------------------
create table if not exists invoices (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies on delete cascade,
  vs          text not null unique,                 -- variabilný symbol
  issued_on   date not null default current_date,
  due_on      date not null,
  period_from date not null,
  period_to   date not null,
  employees   int  not null,                        -- počet aktívnych zamestnancov pri vystavení
  billed_qty  int  not null,                        -- účtovaný počet (aspoň minimum)
  months      int  not null default 12,
  unit_price  numeric(6,2) not null,                -- € za zamestnanca mesačne
  amount      numeric(10,2) not null,
  status      text not null default 'issued',
  paid_on     date,
  exported_at timestamptz,                          -- kedy išla do Pohody
  note        text,
  created_at  timestamptz not null default now(),
  check (status in ('issued','paid','cancelled')),
  check (period_to >= period_from)
);
create index if not exists invoices_company on invoices(company_id, issued_on desc);

alter table invoices enable row level security;
drop policy if exists admin_read on invoices;
create policy admin_read on invoices for select to authenticated
  using (is_admin() and company_id = current_company_id());
drop policy if exists platform_all on invoices;
create policy platform_all on invoices for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Úhrada faktúry: predplatné sa predĺži do konca fakturovaného obdobia
create or replace function mark_invoice_paid(p_id uuid, p_paid_on date default current_date) returns void
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  update invoices set status = 'paid', paid_on = p_paid_on where id = p_id and status = 'issued' returning * into i;
  if i.id is null then raise exception 'Faktúra nie je otvorená.'; end if;
  update companies set status = 'active', paid_until = greatest(coalesce(paid_until, i.period_to), i.period_to)
  where id = i.company_id;
end $$;

create or replace function set_company_exempt(p_company uuid, p_exempt boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Len pre superadmina'; end if;
  update companies set billing_exempt = p_exempt where id = p_company;
end $$;

-- ---------------------------------------------------------------------
-- 4) REŽIM LEN NA ČÍTANIE (neuhradená faktúra po splatnosti + ochranná lehota,
--    alebo firma pozastavená superadminom). Čítanie a export fungujú ďalej.
-- ---------------------------------------------------------------------
create or replace function company_writable(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or (
    coalesce((select status <> 'suspended' from companies where id = p_company), true)
    and not exists (
      select 1 from invoices i, platform_settings s
      where i.company_id = p_company and i.status = 'issued'
        and i.due_on + s.grace_days < current_date
    )
  )
$$;

create or replace function emp_company_writable(p_emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select company_writable((select company_id from employees where id = p_emp))
$$;

-- Reštriktívne politiky: k existujúcim právam pridajú podmienku „firma nie je obmedzená“
do $$
declare t text; expr text;
begin
  foreach t in array array['work_groups','rights_groups','holidays','settings','absence_types','employees','month_status'] loop
    expr := 'company_writable(company_id)';
    execute format('drop policy if exists ro_ins on %I', t);
    execute format('drop policy if exists ro_upd on %I', t);
    execute format('drop policy if exists ro_del on %I', t);
    execute format('create policy ro_ins on %I as restrictive for insert to authenticated with check (%s)', t, expr);
    execute format('create policy ro_upd on %I as restrictive for update to authenticated using (%s) with check (%s)', t, expr, expr);
    execute format('create policy ro_del on %I as restrictive for delete to authenticated using (%s)', t, expr);
  end loop;
  foreach t in array array['entries','requests','month_confirmations','vacation_years','contract_hours',
                           'contract_hours_days','employee_notes','manager_assignments'] loop
    expr := 'emp_company_writable(employee_id)';
    execute format('drop policy if exists ro_ins on %I', t);
    execute format('drop policy if exists ro_upd on %I', t);
    execute format('drop policy if exists ro_del on %I', t);
    execute format('create policy ro_ins on %I as restrictive for insert to authenticated with check (%s)', t, expr);
    execute format('create policy ro_upd on %I as restrictive for update to authenticated using (%s) with check (%s)', t, expr, expr);
    execute format('create policy ro_del on %I as restrictive for delete to authenticated using (%s)', t, expr);
  end loop;
end $$;

-- Prehľad firiem pre superadmina – rozšírený o fakturáciu
drop function if exists platform_companies();
create or replace function platform_companies()
returns table (id uuid, name text, ico text, status text, trial_until date, paid_until date, billing_exempt boolean,
               created_at timestamptz, employees bigint, admins text,
               billing_name text, billing_street text, billing_city text, billing_zip text, billing_dic text, billing_email text,
               writable boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.ico, c.status, c.trial_until, c.paid_until, c.billing_exempt, c.created_at,
         (select count(*) from employees e where e.company_id = c.id and e.active),
         (select string_agg(e.name || coalesce(' <' || e.email || '>', ''), ', ' order by e.name)
            from employees e where e.company_id = c.id and e.role = 'admin' and e.active),
         c.billing_name, c.billing_street, c.billing_city, c.billing_zip, c.billing_dic, c.billing_email,
         company_writable(c.id) and c.status <> 'suspended'
  from companies c
  where is_platform_admin()
  order by c.created_at
$$;

revoke execute on function mark_invoice_paid(uuid,date), set_company_exempt(uuid,boolean), platform_companies() from public, anon;
grant execute on function mark_invoice_paid(uuid,date), set_company_exempt(uuid,boolean), platform_companies() to authenticated;
revoke execute on function company_writable(uuid), emp_company_writable(uuid) from public, anon;
grant execute on function company_writable(uuid), emp_company_writable(uuid) to authenticated;

commit;
