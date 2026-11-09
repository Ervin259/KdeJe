"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManage, requireMe, type Me } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { attHours, checkAttendance, checkDoh, computeDay, type Att } from "@/lib/attendance";
import { brigPeriod, checkLimits, limits, loadDohHours } from "@/lib/dohLimits";
import { safeBack } from "@/lib/params";

export type AttState = { error?: string[]; needReason?: boolean; reasonMsg?: string };

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

function readAtt(f: FormData, me: Me): Att {
  const emp = s(f, "employee_id");
  const bmin = Number(s(f, "break_min") ?? 0);
  return {
    employee_id: emp && canManage(me, emp) ? emp : me.id,
    day: s(f, "day") ?? "",
    arrive: s(f, "arrive") ?? "",
    leave: s(f, "leave") ?? "",
    break_min: Number.isFinite(bmin) ? Math.max(0, Math.round(bmin)) : 0,
    break_start: bmin > 0 ? s(f, "break_start") : null,
    note: s(f, "note"),
  };
}

/** Žiadosť o úpravu dochádzky (uzamknuté obdobie alebo schvaľovanie). */
async function request(kind: "new" | "edit" | "delete", a: Att | null, original: Att | null, empId: string, reason: string | null): Promise<AttState | null> {
  if (!reason)
    return {
      needReason: true,
      reasonMsg: "Toto obdobie je uzamknuté alebo vaše zmeny schvaľuje administrátor. Napíšte dôvod – úprava sa uloží po schválení.",
    };
  const supabase = await createClient();
  const day = (a ?? original)!.day;
  const { data: pend } = await supabase
    .from("requests")
    .select("id")
    .eq("employee_id", empId)
    .eq("target", "attendance")
    .eq("status", "pending")
    .eq("payload->>day", day)
    .limit(1);
  if (pend?.length) return { error: ["K dochádzke v tento deň už čaká žiadosť."] };
  const withRange = (x: Att | null) => (x ? { ...x, date_from: x.day, date_to: x.day } : null);
  const { error } = await supabase.from("requests").insert({
    employee_id: empId,
    kind,
    target: "attendance",
    payload: withRange(a) ?? { employee_id: empId, day, date_from: day, date_to: day },
    original: withRange(original),
    reason,
  });
  if (error) return { error: ["Žiadosť sa nepodarilo odoslať: " + error.message] };
  return null;
}

/** Admin v pohľade zamestnanca podlieha pravidlám zamestnanca (ako pri neprítomnostiach). */
async function adminAsEmployeeMustAsk(me: Me, empId: string, day: string, change: boolean) {
  if (me.role === "admin" || me.realRole !== "admin" || empId !== me.id) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("employee_can_write", { p_emp: empId, p_from: day, p_to: day, p_change: change });
  return !!error || data !== true;
}

export async function saveAttendance(_p: AttState, f: FormData): Promise<AttState> {
  const me = await requireMe();
  const supabase = await createClient();
  const back = safeBack(s(f, "spat") ?? undefined);
  const reason = s(f, "reason");
  const a = readAtt(f, me);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day)) return { error: ["Chýba deň."] };

  const { calc, emps } = await loadCompany();
  const w = calc.group(a.employee_id);
  const entries = await loadEntries(a.day, a.day);
  const info = computeDay(calc, a.employee_id, a.day, entries, null);
  let err: string[];
  const emp = emps.find((e) => e.id === a.employee_id);
  if (emp?.contract_type === "DOH") {
    const { data: ch } = await supabase.from("contract_hours").select("kind, max_day, max_week, max_month").eq("employee_id", a.employee_id).maybeSingle();
    const lim = limits(ch);
    err = checkDoh(a, info, lim.day);
    if (!err.length) {
      // týždeň, mesiac, rok a obdobie brigádnika s novým zápisom
      const bp = brigPeriod(emp.date_from, emp.date_to, a.day);
      const from = [`${a.day.slice(0, 4)}-01-01`, bp.from].sort()[0];
      const to = [`${a.day.slice(0, 4)}-12-31`, bp.to].sort()[1];
      const h = (await loadDohHours([a.employee_id], from, to)).get(a.employee_id) ?? {};
      h[a.day] = attHours(a);
      err = checkLimits(h, a.day, lim, emp);
    }
  } else err = checkAttendance(w, a, info);
  if (err.length) return { error: err };

  const { data: old } = await supabase.from("attendance").select("*").eq("employee_id", a.employee_id).eq("day", a.day).maybeSingle();
  const original = (old as Att | null) ?? null;

  let ok = false;
  if (!(await adminAsEmployeeMustAsk(me, a.employee_id, a.day, !!original))) {
    const { data, error } = await supabase.from("attendance").upsert(a, { onConflict: "employee_id,day" }).select("id");
    if (error && error.code !== "42501") return { error: ["Dochádzku sa nepodarilo uložiť: " + error.message] };
    ok = !error && !!data?.length;
  }
  if (!ok) {
    if (me.role === "admin") return { error: ["Dochádzku sa nepodarilo uložiť."] };
    if (f.has("reason") && !reason) return { needReason: true, error: ["Napíšte dôvod žiadosti."] };
    const r = await request(original ? "edit" : "new", a, original, a.employee_id, reason);
    if (r) return r;
    revalidatePath("/", "layout");
    redirect(back + (back.includes("?") ? "&" : "?") + "ziadost=1");
  }
  revalidatePath("/", "layout");
  redirect(back);
}

/** Vrátiť deň na predvolené časy (zmazať úpravu). */
export async function resetAttendance(_p: AttState, f: FormData): Promise<AttState> {
  const me = await requireMe();
  const supabase = await createClient();
  const back = safeBack(s(f, "spat") ?? undefined);
  const reason = s(f, "reason");
  const a = readAtt(f, me);
  const { data: old } = await supabase.from("attendance").select("*").eq("employee_id", a.employee_id).eq("day", a.day).maybeSingle();
  if (!old) redirect(back);
  const ask = await adminAsEmployeeMustAsk(me, a.employee_id, a.day, true);
  const { data, error } = ask ? { data: null, error: null } : await supabase.from("attendance").delete().eq("id", old.id).select("id");
  if (error && error.code !== "42501") return { error: ["Úpravu sa nepodarilo vymazať: " + error.message] };
  if (!data?.length) {
    if (me.role === "admin") return { error: ["Úpravu sa nepodarilo vymazať."] };
    if (f.has("reason") && !reason) return { needReason: true, error: ["Napíšte dôvod žiadosti."] };
    const r = await request("delete", null, old as Att, a.employee_id, reason);
    if (r) return r;
    revalidatePath("/", "layout");
    redirect(back + (back.includes("?") ? "&" : "?") + "ziadost=1");
  }
  revalidatePath("/", "layout");
  redirect(back);
}
