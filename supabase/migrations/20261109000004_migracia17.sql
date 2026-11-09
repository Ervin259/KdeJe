-- =====================================================================
-- KdeJe – migrácia 17: druh dohody a limity hodín dohodárov
--   • contract_hours.kind – dopc (pracovná činnosť, najviac 10 h týždenne),
--     brig (brigádnická práca študentov, priemerne 20 h týždenne),
--     dovp (vykonanie práce, najviac 350 h ročne); prázdne = neurčené
--   • contract_hours.max_month – vlastný limit firmy za mesiac (nepovinný)
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run. Dá sa spustiť aj opakovane.
-- =====================================================================
begin;

alter table contract_hours add column if not exists kind text;
alter table contract_hours add column if not exists max_month numeric(5,1);
do $$ begin
  alter table contract_hours add constraint contract_hours_kind_chk check (kind in ('dopc', 'brig', 'dovp'));
exception when duplicate_object then null; end $$;

commit;
