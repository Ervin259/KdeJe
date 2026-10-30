"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { VIEW_COOKIE } from "@/lib/data";

/** Prepnutie firmy, s ktorou prihlásený pracuje (prázdne id = superadmin opúšťa firmu). */
export async function switchCompany(companyId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_company", { p_company: companyId || null });
  if (error) throw new Error(error.message);
  // vo firme, kde je prihlásený len správcom (nie zamestnancom), sa vždy otvorí pohľad admina
  if (companyId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: emp } = await supabase
      .from("employees")
      .select("is_external")
      .eq("company_id", companyId)
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    if (emp?.is_external) (await cookies()).delete(VIEW_COOKIE);
  }
  // prevádzky a oddelenia sú v každej firme iné
  const c = await cookies();
  c.delete("kj_site");
  c.delete("kj_dept");
  revalidatePath("/", "layout");
  redirect(companyId ? "/kalendar" : "/firmy");
}

/** Výber prevádzky, oddelenia a zoskupenia v hlavičke (pamätá sa na rok). */
export async function setOrgFilter(key: "kj_site" | "kj_dept" | "kj_group", value: string) {
  if (!["kj_site", "kj_dept", "kj_group"].includes(key)) return;
  const c = await cookies();
  if (value) c.set(key, value.slice(0, 80), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else c.delete(key);
  revalidatePath("/", "layout");
}
