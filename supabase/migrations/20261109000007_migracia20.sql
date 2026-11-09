-- =====================================================================
-- KdeJe – migrácia 20: vlastný text e-mailu v notifikáciách
--   • notification_rules.subject, notification_rules.body – predmet a text e-mailu firmy;
--     prázdne = predvolený text aplikácie (značky {meno}, {firma}, {rok}, {zostatok}, {prenos}, {dočerpať})
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
alter table notification_rules add column if not exists subject text;
alter table notification_rules add column if not exists body    text;

select c.name, r.kind, r.subject is not null as vlastny_predmet, r.body is not null as vlastny_text
  from notification_rules r join companies c on c.id = r.company_id
 order by c.name;
