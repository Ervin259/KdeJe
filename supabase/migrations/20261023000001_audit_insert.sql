-- KdeJe – admin smie zapisovať textové záznamy do histórie úprav
-- (schválené / zamietnuté žiadosti, ručné uzavretie mesiaca a pod.)
create policy admin_insert on audit_log for insert to authenticated
  with check (is_admin() and (employee_id is null or emp_in_my_company(employee_id)));
