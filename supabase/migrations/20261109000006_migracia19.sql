-- =====================================================================
-- KdeJe – migrácia 19: Notifikácie (pravidlá e-mailových upozornení)
--   • notification_rules – pravidlá každej firmy zvlášť: druh, zapnuté, dátumy odoslania (MM-DD), voliteľne súhrn adminom
--     prvé pravidlo: vac_left = dočerpanie dovolenky do konca roka (len tým, ktorí majú dočerpať viac ako 0)
--   • notification_log – čo sa komu a kedy poslalo (ochrana pred dvojitým odoslaním, prehľad v Nastaveniach)
--   • každá firma dostane pravidlo vac_left zapnuté s dátumami 1. 10., 1. 11., 1. 12.; nová firma tiež
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

create table if not exists notification_rules (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies on delete cascade,
  kind         text not null,
  enabled      boolean not null default true,
  dates        text[] not null default '{}',          -- dni odoslania v roku vo formáte MM-DD
  notify_admin boolean not null default false,        -- voliteľne súhrn adminom firmy
  updated_at   timestamptz not null default now(),
  unique (company_id, kind)
);
do $$ begin
  alter table notification_rules add constraint notification_rules_kind_chk check (kind in ('vac_left'));
exception when duplicate_object then null; end $$;

create table if not exists notification_log (
  id          bigint generated always as identity primary key,
  rule_id     uuid not null references notification_rules on delete cascade,
  company_id  uuid not null references companies on delete cascade,
  sent_on     date not null,
  employee_id uuid references employees on delete set null,  -- prázdne = súhrn adminovi
  email       text,
  ok          boolean not null default true,
  info        text,
  created_at  timestamptz not null default now()
);
create index if not exists notification_log_rule_day on notification_log (rule_id, sent_on);

alter table notification_rules enable row level security;
alter table notification_log   enable row level security;

drop policy if exists admin on notification_rules;
create policy admin on notification_rules for all to authenticated
  using (is_admin() and company_id = current_company_id())
  with check (is_admin() and company_id = current_company_id());
drop policy if exists ro_ins on notification_rules;
drop policy if exists ro_upd on notification_rules;
create policy ro_ins on notification_rules as restrictive for insert to authenticated with check (company_writable(company_id));
create policy ro_upd on notification_rules as restrictive for update to authenticated
  using (company_writable(company_id)) with check (company_writable(company_id));

drop policy if exists admin_read on notification_log;
create policy admin_read on notification_log for select to authenticated
  using (is_admin() and company_id = current_company_id());
-- zápis do logu len cez service_role (nočná úloha, tlačidlo Odoslať teraz)

-- predvolené pravidlo pre existujúce firmy
insert into notification_rules (company_id, kind, enabled, dates, notify_admin)
select id, 'vac_left', true, array['10-01', '11-01', '12-01'], false from companies
on conflict (company_id, kind) do nothing;

-- nová firma dostane predvolené pravidlo
create or replace function seed_notification_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_rules (company_id, kind, enabled, dates, notify_admin)
  values (new.id, 'vac_left', true, array['10-01', '11-01', '12-01'], false)
  on conflict (company_id, kind) do nothing;
  return new;
end $$;
drop trigger if exists seed_notification_rules on companies;
create trigger seed_notification_rules after insert on companies for each row execute function seed_notification_rules();

commit;

select c.name, r.kind, r.enabled, r.dates, r.notify_admin
  from notification_rules r join companies c on c.id = r.company_id
 order by c.name;
