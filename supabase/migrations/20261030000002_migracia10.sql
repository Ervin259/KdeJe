-- =====================================================================
-- KdeJe – migrácia 10: odsúhlasenie mesiaca pre všetkých okrem dohodárov
-- Spustenie: Supabase → SQL Editor → vložiť CELÝ OBSAH súboru → Run.
-- =====================================================================
begin;
drop policy if exists own_confirm on month_confirmations;
create policy own_confirm on month_confirmations for insert to authenticated
  with check (
    employee_id = current_employee_id()
    and (select contract_type from employees where id = employee_id) <> 'DOH'
    and current_date >= (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date - 3
  );
commit;
