"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, todayIso } from "@/lib/data";
import { headers } from "next/headers";

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
  // štátne sviatky sa nemažú, odstrániť sa dajú len vlastné voľné dni firmy
  await supabase.from("holidays").delete().eq("date", date).eq("is_state", false);
  await audit(`Sviatok ${date} odstránený`);
  done();
}

/** Načíta štátne sviatky roka (spravuje ich superadmin pre všetky firmy). */
export async function loadStateHolidays(f: FormData) {
  await requireAdmin();
  const y = Number(str(f, "year"));
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("load_state_holidays", { p_year: y });
  await audit(`Štátne sviatky ${y} načítané (${data ?? 0})`);
  done();
  redirect(`/nastavenia?open=hol&rok=${y}`);
}

/** Aktívny / skrytý priamo v zozname zamestnancov. */
export async function setActive(empId: string, active: boolean): Promise<string | null> {
  const me = await requireAdmin();
  if (empId === me.id && !active) return "Sám seba nemôžete skryť.";
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("name").eq("id", empId).maybeSingle();
  const { error } = await supabase.from("employees").update({ active }).eq("id", empId);
  if (error) return error.message;
  await audit(`${e?.name ?? "Zamestnanec"} · ${active ? "aktívny" : "skrytý"}`, empId);
  done();
  return null;
}

// ---------- vedúci a ich ľudia ----------
/** Pridá alebo odoberie zamestnanca vedúcemu (sekcia Roly a prístupy). */
export async function setManaged(managerId: string, empId: string, on: boolean) {
  await requireAdmin();
  if (managerId === empId) return;
  const supabase = await createClient();
  if (on) await supabase.from("manager_assignments").upsert({ manager_id: managerId, employee_id: empId });
  else await supabase.from("manager_assignments").delete().eq("manager_id", managerId).eq("employee_id", empId);
  done();
}

// ---------- firma ----------
export async function saveCompany(_p: SetState, f: FormData): Promise<SetState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const row = {
    name: str(f, "name"),
    ico: str(f, "ico") || null,
    address: str(f, "address") || null,
    billing_name: str(f, "billing_name") || null,
    billing_street: str(f, "billing_street") || null,
    billing_city: str(f, "billing_city") || null,
    billing_zip: str(f, "billing_zip") || null,
    billing_dic: str(f, "billing_dic") || null,
    billing_email: str(f, "billing_email").toLowerCase() || null,
    billing_icdph: str(f, "billing_icdph").replace(/\s/g, "").toUpperCase() || null,
    billing_phone: str(f, "billing_phone") || null,
  };
  if (!row.name) return { error: ["Vyplňte názov firmy."] };
  if (row.ico && !/^\d{6,8}$/.test(row.ico.replace(/\s/g, ""))) return { error: ["IČO má 6 až 8 číslic."] };
  if (row.ico) row.ico = row.ico.replace(/\s/g, "");
  const { error } = await supabase.from("companies").update(row).eq("id", me.company_id);
  if (error) return { error: [error.message] };
  await audit("Údaje o firme upravené");
  done();
  return { ok: "Uložené" };
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
  const row = {
    employee_id: empId,
    year,
    entitlement_full: data?.entitlement_full ?? value,
    entitlement: data?.entitlement ?? 25,
    carry_in: data?.carry_in ?? 0,
    [field]: value,
    // ručná zmena: prenos už automatika neprepíše, nárok je skontrolovaný
    ...(field === "carry_in" ? { carry_manual: true } : { check_needed: false }),
  } as Record<string, unknown>;
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
    site: str(f, "site").replace(/\s+/g, " ") || null,
    department: str(f, "department").replace(/\s+/g, " ") || null,
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
    is_manager: bool(f, "is_manager"),
    is_external: bool(f, "is_external"),
  };
  // správca, ktorý nie je zamestnancom: nie je v kalendári, prehľade ani v mzdách
  if (row.is_external) Object.assign(row, { show_in_calendar: false, in_stats: false, in_payroll: false });
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

  // ľudia, ktorých vedúci spravuje
  const want = row.is_manager ? f.getAll("manages").map(String).filter((x) => x && x !== empId) : [];
  await supabase.from("manager_assignments").delete().eq("manager_id", empId);
  if (want.length) {
    const res = await supabase.from("manager_assignments").insert(want.map((employee_id) => ({ manager_id: empId, employee_id })));
    if (res.error) return { error: ["Zoznam ľudí vedúceho sa nepodarilo uložiť: " + res.error.message] };
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
    const ent = numOr(f, "entitlement", 25) ?? 25;
    const carry = numOr(f, "carry_in", 0) ?? 0;
    const { data: old } = await supabase
      .from("vacation_years")
      .select("carry_in, carry_manual")
      .eq("employee_id", empId)
      .eq("year", year)
      .maybeSingle();
    await supabase.from("vacation_years").upsert({
      employee_id: empId,
      year,
      entitlement_full: numOr(f, "entitlement_full", ent) ?? ent,
      entitlement: ent,
      carry_in: carry,
      check_needed: false,
      // prenos zmenený ručne → automatika ho už neprepíše
      carry_manual: !!old?.carry_manual || (!!old && Number(old.carry_in) !== carry),
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

// ---------- pozvánky ----------
export type InviteState = { sent?: string[]; failed?: string[]; error?: string };

/** Pošle pozvánky vybraným zamestnancom (nový účet = pozvánka, existujúci = nový prihlasovací odkaz). */
export async function inviteEmployees(_p: InviteState, f: FormData): Promise<InviteState> {
  await requireAdmin();
  const { adminClient, publicClient } = await import("@/lib/supabase/admin");
  const admin = adminClient();
  if (!admin) return { error: "Chýba premenná SUPABASE_SERVICE_ROLE_KEY vo Verceli – pozvánky sa zatiaľ nedajú posielať z aplikácie." };
  const ids = f.getAll("emp").map(String).filter(Boolean);
  if (!ids.length) return { error: "Najprv zaškrtnite zamestnancov, ktorým chcete poslať pozvánku." };

  const supabase = await createClient();
  const { data: emps } = await supabase.from("employees").select("id, name, email").in("id", ids);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const sent: string[] = [];
  const failed: string[] = [];

  for (const e of emps ?? []) {
    if (!e.email) {
      failed.push(`${e.name}: chýba e-mail`);
      continue;
    }
    const inv = await admin.auth.admin.inviteUserByEmail(e.email, { redirectTo: `${origin}/login` });
    if (!inv.error) {
      sent.push(e.name);
      continue;
    }
    // účet už existuje (napr. pozvaný skôr) → pošleme prihlasovací odkaz
    if (/already|registered|exists/i.test(inv.error.message)) {
      const otp = await publicClient().auth.signInWithOtp({
        email: e.email,
        options: { shouldCreateUser: false, emailRedirectTo: `${origin}/login` },
      });
      if (!otp.error) sent.push(`${e.name} (nový prihlasovací odkaz)`);
      else failed.push(`${e.name}: ${otp.error.message}`);
    } else failed.push(`${e.name}: ${inv.error.message}`);
  }
  await supabase.rpc("link_employee_accounts");
  if (sent.length) await audit(`Pozvánky odoslané: ${sent.join(", ")}`);
  revalidatePath("/nastavenia");
  return { sent, failed };
}

/** Admin firmy potvrdí, že chce po skúšobnej dobe pokračovať – až potom sa vystaví prvá faktúra. */
export async function confirmContinue(_p: SetState, _f: FormData): Promise<SetState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_continue");
  if (error) return { error: [error.message] };
  await audit("Potvrdené pokračovanie po skúšobnej dobe");
  // upozornenie pre superadmina – treba vystaviť prvú faktúru
  const { mailHtml, sendMail } = await import("@/lib/mail");
  const { data: ps } = await supabase.from("platform_settings").select("notify_email").eq("id", 1).maybeSingle();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  await sendMail(
    ps?.notify_email,
    `KdeJe: ${me.company_name} pokračuje – vystaviť faktúru`,
    mailHtml("Firma potvrdila pokračovanie po skúšobnej dobe", [["Firma", me.company_name], ["Potvrdil(a)", me.name]], {
      href: `${origin}/firmy`,
      label: "Vystaviť faktúru",
    })
  );
  done();
  return { ok: "Ďakujeme! Faktúru pošleme e-mailom a nájdete ju aj tu v Predplatnom." };
}

/** Admin potvrdí (prípadne upraví) automaticky skopírovaný nárok – guľôčka na kontrolu zmizne. */
export async function confirmEntitlement(empId: string, year: number, value: number) {
  await requireAdmin();
  if (!Number.isFinite(value) || value < 0 || value > 60) return;
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("name").eq("id", empId).maybeSingle();
  await supabase
    .from("vacation_years")
    .update({ entitlement: value, entitlement_full: value, check_needed: false })
    .eq("employee_id", empId)
    .eq("year", year);
  await audit(`${e?.name ?? "Zamestnanec"} · nárok na dovolenku ${year} potvrdený: ${value} dní`, empId);
  done();
}
