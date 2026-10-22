-- KdeJe – migrácia 2
-- 1) admin smie zapisovať textové záznamy do histórie úprav
--    (schválené / zamietnuté žiadosti, uzavretie mesiaca, zmeny nastavení)
-- 2) funkcia na prepojenie existujúcich účtov so zamestnancami podľa e-mailu
--    (keď admin doplní e-mail až po tom, čo sa človek prvýkrát prihlásil)

drop policy if exists admin_insert on audit_log;
create policy admin_insert on audit_log for insert to authenticated
  with check (is_admin() and (employee_id is null or emp_in_my_company(employee_id)));

create or replace function link_employee_accounts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then return 0; end if;
  update employees e set user_id = u.id
  from auth.users u
  where e.user_id is null
    and e.email is not null
    and lower(e.email) = lower(u.email)
    and e.company_id = current_company_id()
    and not exists (select 1 from employees x where x.user_id = u.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function link_employee_accounts() from public, anon;
grant execute on function link_employee_accounts() to authenticated;
