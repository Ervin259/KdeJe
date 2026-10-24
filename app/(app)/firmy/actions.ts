"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/data";

export type FirmState = { ok?: string; error?: string };

/** Schválenie žiadosti: založí firmu s adminom a pošle mu pozvánku. */
export async function approveSignup(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const id = String(f.get("id") ?? "");
  const supabase = await createClient();
  const { data: s } = await supabase.from("company_signups").select("company_name, admin_email").eq("id", id).maybeSingle();
  if (!s) return { error: "Žiadosť sa nenašla." };

  const { error } = await supabase.rpc("approve_signup", { p_id: id });
  if (error) return { error: error.message };

  const invite = await sendInvite(s.admin_email);
  revalidatePath("/", "layout");
  return invite
    ? { error: `Firma „${s.company_name}“ je založená, ale pozvánku sa nepodarilo poslať: ${invite}. Pošlite ju v Supabase (Authentication → Users → Invite).` }
    : { ok: `Firma „${s.company_name}“ je založená a na ${s.admin_email} odišla pozvánka.` };
}

export async function rejectSignup(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const id = String(f.get("id") ?? "");
  const reason = String(f.get("reason") ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_signups")
    .update({ status: "rejected", decided_at: new Date().toISOString(), reject_reason: reason })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Žiadosť zamietnutá." };
}

/** Opätovné poslanie pozvánky adminovi firmy. */
export async function resendInvite(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const email = String(f.get("email") ?? "");
  if (!email) return { error: "Chýba e-mail." };
  const err = await sendInvite(email);
  return err ? { error: err } : { ok: `Pozvánka odoslaná na ${email}.` };
}

/** Pozvánka (nový účet) alebo prihlasovací odkaz (účet už existuje). Vráti text chyby alebo null. */
async function sendInvite(email: string): Promise<string | null> {
  const { adminClient, publicClient } = await import("@/lib/supabase/admin");
  const admin = adminClient();
  if (!admin) return "chýba SUPABASE_SERVICE_ROLE_KEY vo Verceli";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/login` });
  if (!inv.error) return null;
  if (/already|registered|exists/i.test(inv.error.message)) {
    const otp = await publicClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/login` },
    });
    return otp.error ? otp.error.message : null;
  }
  return inv.error.message;
}
