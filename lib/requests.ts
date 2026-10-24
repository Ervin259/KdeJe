import { createClient } from "@/lib/supabase/server";
import type { Entry } from "@/lib/calc";
/** Týka sa žiadosť obdobia po uzávierke? (také vybavuje len admin) */
export async function requestLocked(r: { employee_id: string; payload: unknown; original: unknown; kind: string }) {
  const supabase = await createClient();
  const recs = [r.original as Entry | null, r.kind === "delete" ? null : (r.payload as Entry | null)];
  for (const x of recs) {
    if (!x?.date_from) continue;
    const { data } = await supabase.rpc("range_locked", {
      p_emp: r.employee_id,
      p_from: x.date_from,
      p_to: x.date_to,
      p_for_employee: false,
    });
    if (data) return true;
  }
  return false;
}
