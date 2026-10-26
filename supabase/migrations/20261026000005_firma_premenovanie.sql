-- KdeJe – superadmin: pri premenovaní firmy opraviť aj pole „Firma“ u jej zamestnancov
create or replace function rename_company_firm(p_company uuid, p_old text, p_new text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_platform_admin() then return 0; end if;
  update employees set firm = p_new where company_id = p_company and firm = p_old;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function rename_company_firm(uuid,text,text) from public, anon;
grant execute on function rename_company_firm(uuid,text,text) to authenticated;
