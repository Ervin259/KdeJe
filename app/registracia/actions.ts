"use server";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { ok?: boolean; error?: string; email?: string };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** Žiadosť o zriadenie služby z verejnej stránky – uloží sa a čaká na schválenie superadminom. */
export async function submitSignup(_p: SignupState, f: FormData): Promise<SignupState> {
  // pasca na roboty: skryté pole vyplní len automat
  if (str(f, "web")) return { ok: true };
  if (!f.get("consent")) return { error: "Potvrďte súhlas s obchodnými podmienkami." };
  const ico = str(f, "ico").replace(/\s/g, "");
  if (ico && !/^\d{6,8}$/.test(ico)) return { error: "IČO má 6 až 8 číslic." };
  const n = Number(str(f, "employees"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_signup", {
    p_company: str(f, "company"),
    p_ico: ico || null,
    p_name: str(f, "name"),
    p_email: str(f, "email"),
    p_phone: str(f, "phone") || null,
    p_employees: Number.isInteger(n) && n > 0 ? n : null,
    p_note: str(f, "note") || null,
  });
  if (error) return { error: error.message };
  return { ok: true, email: str(f, "email") };
}
