"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/lib/data";

export type FormState = { error?: string; needReason?: boolean; info?: string };

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

export async function saveEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireMe();
  const supabase = await createClient();

  const back = s(form, "spat") ?? "/kalendar";
  const employeeId = me.role === "admin" ? s(form, "employee_id") ?? me.id : me.id;
  const type = s(form, "type");
  const part = (s(form, "part") ?? "full") as "full" | "am" | "pm" | "hrs";
  const dateFrom = s(form, "date_from");
  let dateTo = s(form, "date_to") ?? dateFrom;
  const timeFrom = part === "hrs" ? s(form, "time_from") : null;
  const timeTo = part === "hrs" ? s(form, "time_to") : null;
  const note = s(form, "note");
  const reason = s(form, "reason");

  if (!type || !dateFrom) return { error: "Vyberte typ a dátum." };
  if (part !== "full") dateTo = dateFrom;
  if (dateTo! < dateFrom) return { error: "Dátum do nemôže byť skôr ako dátum od." };
  if (part === "hrs" && (!timeFrom || !timeTo || timeTo <= timeFrom))
    return { error: "Zadajte čas od a do (do musí byť neskôr ako od)." };

  // povolený rozsah podľa typu
  const { data: t } = await supabase.from("absence_types").select("parts, enabled").eq("code", type).single();
  if (!t?.enabled) return { error: "Tento typ neprítomnosti nie je zapnutý." };
  const need = part === "am" || part === "pm" ? "half" : part;
  if (!(t.parts as string[]).includes(need)) return { error: "Pre tento typ nie je takýto rozsah povolený." };

  const row = {
    employee_id: employeeId,
    type,
    date_from: dateFrom,
    date_to: dateTo,
    part,
    time_from: timeFrom,
    time_to: timeTo,
    note,
  };

  const { error } = await supabase.from("entries").insert(row);

  if (error) {
    // 42501 = RLS nepustila zápis (zamknuté obdobie alebo skupina so schvaľovaním) → žiadosť
    if (error.code === "42501" && me.role !== "admin" && employeeId === me.id) {
      if (!reason)
        return {
          needReason: true,
          error:
            "Toto obdobie už nemôžete meniť priamo, alebo vaše zápisy schvaľuje administrátor. Napíšte dôvod a odošle sa žiadosť.",
        };
      const { error: reqErr } = await supabase
        .from("requests")
        .insert({ employee_id: me.id, kind: "new", payload: row, reason });
      if (reqErr) return { error: "Žiadosť sa nepodarilo odoslať: " + reqErr.message };
      revalidatePath("/", "layout");
      redirect(back + (back.includes("?") ? "&" : "?") + "ziadost=1");
    }
    return { error: "Záznam sa nepodarilo uložiť: " + error.message };
  }

  revalidatePath("/", "layout");
  redirect(back);
}
