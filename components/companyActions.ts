"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Prepnutie firmy, s ktorou prihlásený pracuje (prázdne id = superadmin opúšťa firmu). */
export async function switchCompany(companyId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_company", { p_company: companyId || null });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect(companyId ? "/kalendar" : "/firmy");
}
