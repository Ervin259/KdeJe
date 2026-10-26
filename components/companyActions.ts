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
  revalidatePath("/", "layout");
  redirect(companyId ? "/kalendar" : "/firmy");
}
