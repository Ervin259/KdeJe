"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManage, requireMe, type Me } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import { TYPE_NAME, eachDay, fdw, nf, partTxt, toMin, type Entry, type Part } from "@/lib/calc";
import { safeBack } from "@/lib/params";

export type FormState = { error?: string[]; needReason?: boolean; reasonMsg?: string };

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

type Row = Omit<Entry, "id">;

function readRow(form: FormData, me: Me): Row {
  const part = (s(form, "part") ?? "full") as Part;
  const dateFrom = s(form, "date_from") ?? "";
  const emp = s(form, "employee_id");
  return {
    // admin za kohokoľvek, vedúci za svojich ľudí, inak len za seba
    employee_id: emp && canManage(me, emp) ? emp : me.id,
    type: s(form, "type") ?? "",
    part,
    date_from: dateFrom,
    date_to: part === "full" ? s(form, "date_to") ?? dateFrom : dateFrom,
    time_from: part === "hrs" ? s(form, "time_from") : null,
    time_to: part === "hrs" ? s(form, "time_to") : null,
    substitute_id: s(form, "substitute_id"),
    note: s(form, "note"),
  };
}

/** Validácia podľa prototypu (validate()). */
async function validate(row: Row, skipId: string | null): Promise<string[]> {
  const err: string[] = [];
  const supabase = await createClient();
  const { calc } = await loadCompany();
  if (!row.type) err.push("Vyberte typ neprítomnosti.");
  if (!row.date_from || !row.date_to) return [...err, "Vyplňte dátum od a do."];
  if (row.date_from > row.date_to) err.push("Dátum „do“ je skôr ako „od“.");

  const { data: t } = await supabase.from("absence_types").select("parts, enabled, name").eq("code", row.type).maybeSingle();
  if (!t?.enabled) err.push("Tento typ neprítomnosti nie je zapnutý.");
  const need = row.part === "am" || row.part === "pm" ? "half" : row.part;
  if (t && !(t.parts as string[]).includes(need))
    err.push(`${t.name}${(t.parts as string[]).length === 1 ? " sa zapisuje len na celé dni." : " sa nedá zapísať takto."}`);

  if (row.part === "hrs") {
    const sc = calc.sched(row.employee_id);
    if (!row.time_from || !row.time_to) err.push("Vyplňte čas od a do.");
    else if (toMin(row.time_to) <= toMin(row.time_from)) err.push("Čas „do“ musí byť neskôr ako „od“.");
    else if (toMin(row.time_from) < toMin(sc.start) || toMin(row.time_to) > toMin(sc.end))
      err.push(`Pracovný čas je ${sc.start}–${sc.end}. Zapíšte čas v tomto rozsahu.`);
    else {
      const h = calc.hoursOf(row);
      if (h <= 0 || Math.round(h * 60) % (sc.H * 15) !== 0) {
        const q = sc.H / 4;
        err.push(
          `Zapísať sa dá len 0,25 / 0,5 / 0,75 dňa, teda ${nf(q)} h, ${nf(q * 2)} h alebo ${nf(q * 3)} h. Teraz je to ${nf(h)} h.`
        );
      }
    }
  }
  if (err.length) return err;

  if (calc.work(row.date_from, row.date_to) === 0) err.push("Vybrané obdobie neobsahuje pracovný deň (víkend alebo sviatok).");

  // kolízie s inými záznamami
  const { data: others } = await supabase
    .from("entries")
    .select("id, employee_id, type, date_from, date_to, part, time_from, time_to")
    .eq("employee_id", row.employee_id)
    .lte("date_from", row.date_to)
    .gte("date_to", row.date_from);
  const clash: string[] = [];
  const [a1, a2] = calc.span(row);
  eachDay(row.date_from, row.date_to, (d) => {
    if (!calc.isWork(d)) return;
    for (const x of (others ?? []) as Entry[]) {
      if (x.id === skipId || x.date_from > d || x.date_to < d) continue;
      const [b1, b2] = calc.span(x);
      if (a1 < b2 && b1 < a2) clash.push(`${fdw(d)} už je zapísané: ${(TYPE_NAME[x.type] ?? x.type).toLowerCase()} (${partTxt(x)}).`);
    }
  });
  if (clash.length) err.push(...clash.slice(0, 3), ...(clash.length > 3 ? [`…a ďalšie ${clash.length - 3} kolízie.`] : []));
  if (row.substitute_id === row.employee_id) row.substitute_id = null;
  return err;
}

async function makeRequest(
  kind: "new" | "edit" | "delete",
  empId: string,
  row: Row | null,
  original: Entry | null,
  reason: string | null
): Promise<FormState | null> {
  if (!reason)
    return {
      needReason: true,
      reasonMsg:
        "Toto obdobie je uzamknuté alebo vaše zmeny schvaľuje administrátor. Napíšte dôvod – zmena sa uloží po schválení.",
    };
  const supabase = await createClient();
  if (original) {
    const { data: pend } = await supabase
      .from("requests")
      .select("id")
      .eq("target_entry_id", original.id)
      .eq("status", "pending")
      .limit(1);
    if (pend?.length) return { error: ["K tomuto záznamu už čaká žiadosť na admina."] };
  }
  const { error } = await supabase.from("requests").insert({
    employee_id: empId,
    kind,
    target_entry_id: original?.id ?? null,
    payload: row ?? {},
    original,
    reason,
  });
  if (error) return { error: ["Žiadosť sa nepodarilo odoslať: " + error.message] };
  return null;
}

/**
 * Admin v pohľade zamestnanca: databáza mu povolí všetko, preto pravidlá zamestnanca
 * (zamknutý / odsúhlasený mesiac, schvaľovanie) overíme tu – inak by zmena obišla schválenie.
 */
async function adminAsEmployeeMustAsk(me: Me, empId: string, ranges: [string, string][], change: boolean) {
  if (me.role === "admin" || me.realRole !== "admin" || empId !== me.id) return false;
  const supabase = await createClient();
  for (const [from, to] of ranges) {
    const { data, error } = await supabase.rpc("employee_can_write", { p_emp: empId, p_from: from, p_to: to, p_change: change });
    if (error || data !== true) return true;
  }
  return false;
}

export async function saveEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireMe();
  const admin = me.role === "admin";
  const supabase = await createClient();
  const back = safeBack(s(form, "spat") ?? undefined);
  const id = s(form, "id");
  const reason = s(form, "reason");
  const row = readRow(form, me);

  let original: Entry | null = null;
  if (id) {
    const { data } = await supabase.from("entries").select("*").eq("id", id).maybeSingle();
    if (!data) return { error: ["Záznam sa nenašiel."] };
    original = data as Entry;
    if (!admin) row.employee_id = original.employee_id;
  }

  const err = await validate(row, id);
  if (err.length) return { error: err };

  // zápis; RLS rozhodne, či smie priamo
  let ok = false;
  let dbErr: string | null = null;
  const ranges: [string, string][] = [[row.date_from, row.date_to]];
  if (original) ranges.push([original.date_from, original.date_to]);
  if (await adminAsEmployeeMustAsk(me, row.employee_id, ranges, !!id)) {
    // ok = false → žiadosť
  } else if (id) {
    const { data, error } = await supabase.from("entries").update(row).eq("id", id).select("id");
    ok = !error && !!data?.length;
    dbErr = error && error.code !== "42501" ? error.message : null;
  } else {
    const { error } = await supabase.from("entries").insert(row);
    ok = !error;
    dbErr = error && error.code !== "42501" ? error.message : null;
  }
  if (dbErr) return { error: ["Záznam sa nepodarilo uložiť: " + dbErr] };

  if (!ok) {
    if (admin) return { error: ["Záznam sa nepodarilo uložiť."] };
    const r = await makeRequest(id ? "edit" : "new", row.employee_id, row, original, reason);
    if (r) return r;
    revalidatePath("/", "layout");
    redirect(back + (back.includes("?") ? "&" : "?") + "ziadost=1");
  }

  revalidatePath("/", "layout");
  redirect(back);
}

export async function deleteEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireMe();
  const admin = me.role === "admin";
  const supabase = await createClient();
  const back = safeBack(s(form, "spat") ?? undefined);
  const id = s(form, "id");
  const reason = s(form, "reason");
  if (!id) return { error: ["Chýba záznam."] };

  const { data: original } = await supabase.from("entries").select("*").eq("id", id).maybeSingle();
  if (!original) return { error: ["Záznam sa nenašiel."] };

  const o = original as Entry;
  const ask = await adminAsEmployeeMustAsk(me, o.employee_id, [[o.date_from, o.date_to]], true);
  const { data, error } = ask ? { data: null, error: null } : await supabase.from("entries").delete().eq("id", id).select("id");
  if (error && error.code !== "42501") return { error: ["Záznam sa nepodarilo vymazať: " + error.message] };
  if (!data?.length) {
    if (admin) return { error: ["Záznam sa nepodarilo vymazať."] };
    const r = await makeRequest("delete", (original as Entry).employee_id, null, original as Entry, reason);
    if (r) return r;
    revalidatePath("/", "layout");
    redirect(back + (back.includes("?") ? "&" : "?") + "ziadost=1");
  }
  revalidatePath("/", "layout");
  redirect(back);
}

