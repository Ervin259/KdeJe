"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, todayIso } from "@/lib/data";

export type SetState = { error?: string[]; ok?: string };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const numOr = (f: FormData, k: string, d: number | null) => {
  const v = str(f, k).replace(",", ".");
  if (v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "1" || f.get(k) === "true";

async function audit(text: string, employee_id: string | null = null) {
  const supabase = await createClient();
  await supabase.from("audit_log").insert({ table_name: "settings", action: "SETTINGS", after_lock: true, text, employee_id });
}
const done = () => revalidatePath("/", "layout");

// ---------- skupiny pracovného času ----------
export async function saveWorkGroup(_p: SetState, f: FormData): Promise<SetState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const id = str(f, "id");
  const flexible = str(f, "flexible") === "1";
  const row = {
    company_id: me.company_id,
    name: str(f, "name"),
    flexible,
    day_start: flexible ? null : str(f, "day_start") || null,
    day_end: flexible ? null : str(f, "day_end") || null,
    break_start: flexible ? null : str(f, "break_start") || null,
    break_min: flexible ? 0 : numOr(f, "break_min", 0),
    meal_voucher: bool(f, "meal_voucher"),
    sl_rule: str(f, "sl_rule") === "gt" ? "gt" : "gte",
    sl_min_hours: numOr(f, "sl_min_hours", 4),
    trip_no_sl_hours: numOr(f, "trip_no_sl_hours", 5),
  };
  const err: string[] = [];
  if (!row.name) err.push("Vyplňte názov skupiny.");
  if (!flexible) {
    if (!row.day_start || !row.day_end || row.day_end <= row.day_start) err.push("Koniec pracovnej doby musí byť neskôr ako začiatok.");
    else if (row.break_min && row.break_start && (row.break_start < row.day_start || row.break_start > row.day_end))
      err.push("Obed musí byť v rámci pracovnej doby.");
  }
  if (err.length) return { error: err };
  const res = id
    ? await supabase.from("work_groups").update(row).eq("id", id)
    : await supabase.from("work_groups").insert({ ...row, sort: 99 });
  if (res.error) return { error: [res.error.code === "23505" ? "Skupina s týmto názvom už existuje." : res.error.message] };
  await audit(`Skupina pracovného času „${row.name}“ ${id ? "upravená" : "pridaná"}`);
  done();
  return { ok: "Uložené" };
}

export async function deleteWorkGroup(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = str(f, "id");
  const { data: g } = await supabase.from("work_groups").select("name, is_default").eq("id", id).single();
  if (!g || g.is_default) return;
  const { data: def } = await supabase.from("work_groups").select("id").eq("is_default", true).single();
  await supabase.from("employees").update({ work_group_id: def?.id ?? null }).eq("work_group_id", id);
  await supabase.from("work_groups").delete().eq("id", id);
  await audit(`Skupina pracovného času „${g.name}“ vymazaná`);
  done();
}

// ---------- skupiny práv ----------
export async function saveRightsGroup(_p: SetState, f: FormData): Promise<SetState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const id = str(f, "id");
  const after = numOr(f, "edit_days_after_lock", 0) ?? 0;
  const row = {
    company_id: me.company_id,
    name: str(f, "name"),
    requires_approval: str(f, "requires_approval") === "1",
    lock_days: numOr(f, "lock_days", 3) ?? 3,
    can_edit_until_lock: str(f, "can_edit_until_lock") !== "0",
    edit_days_after_lock: after,
  };
  if (!row.name) return { error: ["Vyplňte názov skupiny."] };
  const res = id
    ? await supabase.from("rights_groups").update(row).eq("id", id)
    : await supabase.from("rights_groups").insert({ ...row, sort: 99 });
  if (res.error) return { error: [res.error.code === "23505" ? "Skupina s týmto názvom už existuje." : res.error.message] };
  await audit(`Skupina práv „${row.name}“ ${id ? "upravená" : "pridaná"}`);
  done();
  return { ok: "Uložené" };
}

export async function deleteRightsGroup(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = str(f, "id");
  const { data: g } = await supabase.from("rights_groups").select("name, is_default").eq("id", id).single();
  if (!g || g.is_default) return;
  const { data: def } = await supabase.from("rights_groups").select("id").eq("is_default", true).single();
  await supabase.from("employees").update({ rights_group_id: def?.id ?? null }).eq("rights_group_id", id);
  await supabase.from("rights_groups").delete().eq("id", id);
  await audit(`Skupina práv „${g.name}“ vymazaná`);
  done();
}

/** Presun zamestnanca do inej skupiny (pracovný čas alebo práva). */
export async function moveEmployee(empId: string, kind: "work" | "rights", groupId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("employees")
    .update(kind === "work" ? { work_group_id: groupId } : { rights_group_id: groupId })
    .eq("id", empId);
  done();
}

// ---------- typy, sviatky, GDPR ----------
export async function toggleType(code: string, on: boolean) {
  await requireAdmin();
  if (code === "DOV") return;
  const supabase = await createClient();
  await supabase.from("absence_types").update({ enabled: on }).eq("code", code);
  await audit(`Typ ${code} ${on ? "zapnutý" : "vypnutý"}`);
  done();
}

export async function addHoliday(f: FormData) {
  const me = await requireAdmin();
  const date = str(f, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const supabase = await createClient();
  await supabase.from("holidays").upsert({ company_id: me.company_id, date, name: str(f, "name") || "Sviatok" });
  await audit(`Sviatok ${date} pridaný`);
  done();
}

export async function deleteHoliday(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const date = str(f, "date");
  await supabase.from("holidays").delete().eq("date", date);
  await audit(`Sviatok ${date} odstránený`);
  done();
}

export async function setHideHealth(on: boolean) {
  const me = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("settings").update({ hide_health: on }).eq("company_id", me.company_id);
  await audit(`GDPR: zdravotné neprítomnosti kolegom ${on ? "skryté ako MIMO" : "zobrazené"}`);
  done();
}

/** Rýchla úprava nároku / prenosu priamo v tabuľke zamestnancov. */
export async function setVacation(empId: string, field: "entitlement" | "carry_in", value: number) {
  await requireAdmin();
  const supabase = await createClient();
  const year = Number(todayIso().slice(0, 4));
  const { data } = await supabase.from("vacation_years").select("*").eq("employee_id", empId).eq("year", year).maybeSingle();
  const row = { employee_id: empId, year, entitlement_full: data?.entitlement_full ?? value, entitlement: data?.entitlement ?? 20, carry_in: data?.carry_in ?? 0, [field]: value };
  await supabase.from("vacation_years").upsert(row);
  done();
}

// ---------- karta zamestnanca ----------
export async function saveEmployee(_p: SetState, f: FormData): Promise<SetState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const year = Number(todayIso().slice(0, 4));
  const id = str(f, "id");
  const contract = str(f, "contract_type") as "TPP" | "DOH" | "ZIV" | "SRO";
  const email = str(f, "email").toLowerCase() || null;
  const row = {
    company_id: me.company_id,
    name: str(f, "name").replace(/\s+/g, " "),
    email,
    contract_type: contract,
    firm: str(f, "firm") || null,
    date_from: str(f, "date_from") || null,
    date_to: str(f, "date_to") || null,
    active: str(f, "active") !== "0",
    work_group_id: str(f, "work_group_id") || null,
    rights_group_id: str(f, "rights_group_id") || null,
    show_in_calendar: bool(f, "show_in_calendar"),
    sees_calendar: bool(f, "sees_calendar"),
    in_stats: bool(f, "in_stats"),
    in_payroll: bool(f, "in_payroll"),
    role: bool(f, "is_admin") ? "admin" : "employee",
  };
  const err: string[] = [];
  if (!row.name) err.push("Vyplňte meno a priezvisko.");
  if (row.date_from && row.date_to && row.date_from > row.date_to) err.push("Dátum „do“ je skôr ako „od“.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err.push("E-mail nemá správny tvar.");
  if (id === me.id && row.role !== "admin") err.push("Sám sebe nemôžete odobrať práva admina.");
  if (id === me.id && !row.active) err.push("Sám seba nemôžete skryť.");
  if (err.length) return { error: err };

  let empId = id;
  if (id) {
    const res = await supabase.from("employees").update(row).eq("id", id);
    if (res.error) return { error: [dupMsg(res.error)] };
  } else {
    const res = await supabase.from("employees").insert(row).select("id").single();
    if (res.error) return { error: [dupMsg(res.error)] };
    empId = res.data.id;
  }

  // ak už existuje účet s týmto e-mailom, prepojí sa pri ďalšom prihlásení cez trigger;
  // existujúce účty prepája funkcia link_employee_accounts (migrácia 2)
  await supabase.rpc("link_employee_accounts");

  if (contract === "DOH") {
    await supabase.from("contract_hours").upsert({
      employee_id: empId,
      mode: (["fixed", "worked", "manual"].includes(str(f, "dmode")) ? str(f, "dmode") : "manual") as string,
      hours: numOr(f, "dhours", 0),
      coef: Math.max(0.1, numOr(f, "dcoef", 1) ?? 1),
      max_day: Math.max(0.5, numOr(f, "dmax", 8) ?? 8),
      max_week: numOr(f, "dweek", null) || null,
      step: str(f, "dstep") === "0.5" ? 0.5 : 1,
    });
  } else {
    const ent = numOr(f, "entitlement", 20) ?? 20;
    await supabase.from("vacation_years").upsert({
      employee_id: empId,
      year,
      entitlement_full: numOr(f, "entitlement_full", ent) ?? ent,
      entitlement: ent,
      carry_in: numOr(f, "carry_in", 0) ?? 0,
    });
  }
  const note = str(f, "note");
  if (note) await supabase.from("employee_notes").upsert({ employee_id: empId, note });
  else await supabase.from("employee_notes").delete().eq("employee_id", empId);

  await audit(`${row.name} · zamestnanec ${id ? "upravený" : "pridaný"}`, empId);
  done();
  redirect(`/nastavenia?open=emp&flash=${empId}`);
}

const dupMsg = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "Tento e-mail už má iný zamestnanec." : e.message;
