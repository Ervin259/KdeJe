-- =====================================================================
-- KdeJe – počiatočné dáta (firma, skupiny, typy, sviatky 2026, zamestnanci)
-- Spúšťa sa po schéme. Záznamy z Outlooku (CSV) a počiatočné stavy
-- dovolenky (ps.csv) naimportuje samostatný migračný skript.
-- =====================================================================

-- Pevné ID firmy, aby sa naň dalo odkazovať v ďalších skriptoch
insert into companies (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Euro Data Distribution s.r.o.');

insert into settings (company_id, hide_health, carry_mode, carry_max, lek_limit, remind_from) values
  ('00000000-0000-0000-0000-000000000001', false, 'all', 10, 7, 10);

-- ---------- Skupiny pracovného času ----------
insert into work_groups (company_id, name, is_default, flexible, day_start, day_end, break_start, break_min,
                         meal_voucher, sl_rule, sl_min_hours, trip_no_sl_hours, sort) values
  ('00000000-0000-0000-0000-000000000001', 'TPP',          true,  false, '08:30', '17:00', '12:30', 30, true,  'gte', 4, 5,    1),
  ('00000000-0000-0000-0000-000000000001', 'Živnosť',      false, false, '08:30', '17:00', '12:30', 30, false, 'gte', 4, null, 2),
  ('00000000-0000-0000-0000-000000000001', 'S.r.o.',       false, false, '08:30', '17:00', '12:30', 30, false, 'gte', 4, null, 3),
  ('00000000-0000-0000-0000-000000000001', 'Dohoda Fix',   false, false, '10:00', '13:00', null,     0, false, 'gte', 4, null, 4),
  ('00000000-0000-0000-0000-000000000001', 'Dohoda Flexi', false, true,  null,    null,    null,     0, false, 'gte', 4, null, 5);

-- ---------- Skupiny práv ----------
insert into rights_groups (company_id, name, is_default, requires_approval, lock_days,
                           can_edit_until_lock, edit_days_after_lock, sort) values
  ('00000000-0000-0000-0000-000000000001', 'Bez schvaľovania počas mesiaca', true,  false, 3, true, 0, 1),
  ('00000000-0000-0000-0000-000000000001', 'So schvaľovaním počas mesiaca',  false, true,  3, true, 0, 2),
  ('00000000-0000-0000-0000-000000000001', 'Rozšírené úpravy',               false, false, 3, true, 5, 3);

-- ---------- Typy neprítomností ----------
insert into absence_types (code, name, kind, parts, enabled, is_health, sort) values
  ('DOV', 'Dovolenka',                    'abs',  array['full','half'],       true,  false, 1),
  ('PAR', 'Lekár § 141',                  'abs',  array['full','half','hrs'], true,  true,  2),
  ('OČR', 'OČR',                          'abs',  array['full','half'],       true,  true,  3),
  ('PV',  'Platené voľno',                'abs',  array['full','half','hrs'], true,  true,  4),
  ('PN',  'PN',                           'abs',  array['full'],              true,  true,  5),
  ('SCT', 'Služobná cesta tuzemská',      'sc',   array['full','half','hrs'], true,  false, 6),
  ('SCZ', 'Služobná cesta zahraničná',    'sc',   array['full','half','hrs'], true,  false, 7),
  ('HO',  'Home office',                  'work', array['full','half','hrs'], true,  false, 8),
  ('NV',  'Neplatené voľno',              'abs',  array['full','half'],       false, false, 9),
  ('NEP', 'Neprítomnosť neospravedlnená', 'abs',  array['full'],              false, false, 10);

-- ---------- Sviatky 2026 (1. 9., 15. 9., 28. 10. a 17. 11. sú v 2026 pracovné) ----------
insert into holidays (company_id, date, name) values
  ('00000000-0000-0000-0000-000000000001', '2026-01-01', 'Deň vzniku Slovenskej republiky'),
  ('00000000-0000-0000-0000-000000000001', '2026-01-06', 'Zjavenie Pána (Traja králi)'),
  ('00000000-0000-0000-0000-000000000001', '2026-04-03', 'Veľký piatok'),
  ('00000000-0000-0000-0000-000000000001', '2026-04-06', 'Veľkonočný pondelok'),
  ('00000000-0000-0000-0000-000000000001', '2026-05-01', 'Sviatok práce'),
  ('00000000-0000-0000-0000-000000000001', '2026-05-08', 'Deň víťazstva nad fašizmom'),
  ('00000000-0000-0000-0000-000000000001', '2026-07-05', 'Sviatok sv. Cyrila a Metoda'),
  ('00000000-0000-0000-0000-000000000001', '2026-08-29', 'Výročie SNP'),
  ('00000000-0000-0000-0000-000000000001', '2026-11-01', 'Sviatok všetkých svätých'),
  ('00000000-0000-0000-0000-000000000001', '2026-12-24', 'Štedrý deň'),
  ('00000000-0000-0000-0000-000000000001', '2026-12-25', 'Prvý sviatok vianočný'),
  ('00000000-0000-0000-0000-000000000001', '2026-12-26', 'Druhý sviatok vianočný');

-- ---------- Zamestnanci (22) ----------
-- E-maily okrem admina doplňte pred spustením – podľa nich sa účet pri prvom
-- prihlásení prepojí so zamestnancom. Dátumy od–do a firmu doplní import.
with c as (select '00000000-0000-0000-0000-000000000001'::uuid as id),
     rg as (select id from rights_groups where is_default),
     wg as (select name, id from work_groups),
     src(name, ctype, wgroup, role, email) as (values
       ('Peter Bielik',            'TPP', 'TPP',          'employee', null),
       ('Anka Bučková',            'TPP', 'TPP',          'employee', null),
       ('Anka Fedorová',           'TPP', 'TPP',          'employee', null),
       ('Dušan Fertáľ',            'TPP', 'TPP',          'employee', null),
       ('Ervín Goga',              'TPP', 'TPP',          'admin',    'ervin.goga@gmail.com'),
       ('Ivana Jedináková',        'TPP', 'TPP',          'employee', null),
       ('Ján Kľuska',              'TPP', 'TPP',          'employee', null),
       ('Daniel Poljak',           'TPP', 'TPP',          'employee', null),
       ('Jana Přikrylová',         'TPP', 'TPP',          'employee', null),
       ('Slávka Rusnáková',        'TPP', 'TPP',          'employee', null),
       ('Peter Šlopek',            'TPP', 'TPP',          'employee', null),
       ('Miriam Žuchová',          'TPP', 'TPP',          'employee', null),
       ('Roman Bury',              'ZIV', 'Živnosť',      'employee', null),
       ('Jana Ivaničová',          'ZIV', 'Živnosť',      'employee', null),
       ('Peter Marušák',           'ZIV', 'Živnosť',      'employee', null),
       ('Pavol Šmehyl',            'ZIV', 'Živnosť',      'employee', null),
       ('Michal Husárik',          'SRO', 'S.r.o.',       'employee', null),
       ('Ján Lamžo',               'SRO', 'S.r.o.',       'employee', null),
       ('Miroslav Lamžo',          'SRO', 'S.r.o.',       'employee', null),
       ('Denisa Míková',           'DOH', 'Dohoda Flexi', 'employee', null),
       ('Miroslav Loipersberger',  'DOH', 'Dohoda Fix',   'employee', null),
       ('Roman Betka',             'DOH', 'Dohoda Flexi', 'employee', null)
     )
insert into employees (company_id, name, contract_type, work_group_id, rights_group_id, role, email, in_payroll)
select c.id, s.name, s.ctype::contract_type, wg.id, (select id from rg), s.role::app_role, s.email,
       s.ctype not in ('ZIV','SRO')            -- živnosť a s.r.o. sa mzdárkam neposielajú
from src s cross join c join wg on wg.name = s.wgroup;

-- ---------- Dohody ----------
insert into contract_hours (employee_id, mode, hours, coef, step)
select e.id, v.mode::dohoda_mode, v.hours, v.coef, 1
from (values
  ('Denisa Míková',          'fixed',  40::numeric, null::numeric),
  ('Miroslav Loipersberger', 'worked', null,        2),
  ('Roman Betka',            'fixed',  15,          null)
) v(name, mode, hours, coef)
join employees e on e.name = v.name;

-- ---------- Nárok na dovolenku 2026 (bez dohodárov) ----------
-- 20 dní predvolene; 25-dňové nároky a prenosy z 2025 doplní import z ps.csv
insert into vacation_years (employee_id, year, entitlement_full, entitlement, carry_in)
select id, 2026, 20, 20, 0 from employees where contract_type <> 'DOH';

-- ---------- Január – september 2026 odsúhlasené pri importe ----------
insert into month_confirmations (employee_id, year, month, confirmed_by)
select e.id, 2026, m, null
from employees e cross join generate_series(1, 9) m
where e.contract_type = 'TPP';
