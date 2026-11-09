"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMe } from "@/lib/data";
import { parseHours } from "@/lib/overtime";
import { safeBack } from "@/lib/params";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Rozhodnutie o nadčase za mesiac: koľko ide do náhradného voľna, zvyšok sa preplatí. Reset = podľa karty. */
export async function saveOvertime(f: FormData) {
  const me = await requireMe();
  const emp = s(f, "emp");
  const month = s(f, "month");
  const back = safeBack(s(f, "back"), "/vykaz");
  const lead = me.role === "admin" || (me.isManager && me.managed.includes(emp) && emp !== me.id);
  if (!lead || !/^\d{4}-\d{2}$/.test(month)) redirect(back);
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (s(f, "mode") === "reset") {
    await supabase.from("overtime_decisions").delete().eq("employee_id", emp).eq("month", `${month}-01`);
  } else {
    const ot = Number(s(f, "ot")) || 0;
    const nv = parseHours(s(f, "nv"));
    if (nv === null || nv > ot + 0.001) redirect(`${back}${back.includes("?") ? "&" : "?"}oterr=${emp}`);
    const nvh = Math.round(Math.min(nv!, ot) * 100) / 100;
    const { error } = await supabase.from("overtime_decisions").upsert(
      {
        employee_id: emp,
        month: `${month}-01`,
        nv_h: nvh,
        pay_h: Math.round((ot - nvh) * 100) / 100,
        decided_by: u.user?.id ?? null,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,month" }
    );
    if (error) redirect(`${back}${back.includes("?") ? "&" : "?"}oterr=${emp}`);
  }
  revalidatePath("/vykaz");
  revalidatePath("/mzdy");
  redirect(back);
}
