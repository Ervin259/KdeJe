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

// ---------- fakturácia ----------
const num = (f: FormData, k: string, d: number) => {
  const v = Number(String(f.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) && String(f.get(k) ?? "").trim() !== "" ? v : d;
};
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

/** Údaje dodávateľa a pravidlá fakturácie (zobrazujú sa aj v obchodných podmienkach). */
export async function saveSupplier(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const supabase = await createClient();
  const row = {
    id: 1,
    supplier_name: txt(f, "supplier_name"),
    supplier_address: txt(f, "supplier_address"),
    supplier_ico: txt(f, "supplier_ico"),
    supplier_dic: txt(f, "supplier_dic"),
    supplier_register: txt(f, "supplier_register"),
    supplier_email: txt(f, "supplier_email"),
    supplier_phone: txt(f, "supplier_phone"),
    iban: txt(f, "iban")?.replace(/\s+/g, " ").toUpperCase() ?? null,
    price_month: num(f, "price_month", 1),
    min_employees: Math.max(0, Math.round(num(f, "min_employees", 5))),
    trial_months: Math.max(0, Math.round(num(f, "trial_months", 12))),
    due_days: Math.max(1, Math.round(num(f, "due_days", 14))),
    grace_days: Math.max(0, Math.round(num(f, "grace_days", 14))),
    delete_after_days: Math.max(30, Math.round(num(f, "delete_after_days", 90))),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("platform_settings").upsert(row);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Uložené." };
}

/** Vystaví ročné faktúry všetkým firmám, ktorým o menej ako 30 dní končí skúšobné alebo zaplatené obdobie. */
export async function issueInvoices(_p: FirmState, _f: FormData): Promise<FirmState> {
  await requirePlatform();
  const { loadPlatformSettings, nextInvoice, addDays, settle } = await import("@/lib/billing");
  const { todayIso } = await import("@/lib/data");
  const supabase = await createClient();
  const s = await loadPlatformSettings();
  const today = todayIso();
  const [{ data: co }, { data: inv }] = await Promise.all([
    supabase.rpc("platform_companies"),
    supabase.from("invoices").select("*"),
  ]);
  const invoices = (inv ?? []) as import("@/lib/billing").Invoice[];
  const year = today.slice(0, 4);
  let seq = Math.max(0, ...invoices.filter((i) => i.vs.startsWith(year)).map((i) => Number(i.vs.slice(4)) || 0));
  const rows = [];
  for (const c of (co ?? []) as import("@/lib/billing").BillingCompany[]) {
    const n = nextInvoice(c, invoices, s, today);
    if (!n) continue;
    // ročné vyrovnanie za predchádzajúce obdobie (+ doplatok / − odpočet) a prenesený odpočet
    let extra = 0;
    if (n.prev) {
      const { data: u } = await supabase.rpc("billing_settlement_units", {
        p_company: c.id,
        p_from: n.prev.period_from,
        p_to: n.prev.period_to,
        p_paid: n.prev.billed_qty,
        p_min: s.min_employees,
      });
      extra = Number(u ?? 0);
    }
    const extraAmount = Math.round(extra * Number(n.prev?.unit_price ?? s.price_month) * 100) / 100;
    const carryIn = Number(n.prev?.carry_out ?? 0);
    const { amount, carry_out } = settle(n.amount, extraAmount, carryIn);
    seq += 1;
    rows.push({
      company_id: c.id,
      vs: `${year}${String(seq).padStart(4, "0")}`,
      issued_on: today,
      due_on: addDays(today, s.due_days),
      period_from: n.from,
      period_to: n.to,
      employees: n.employees,
      billed_qty: n.qty,
      months: 12,
      unit_price: s.price_month,
      amount,
      carry_in: carryIn,
      carry_out,
      extra_units: extra,
      extra_amount: extraAmount,
      extra_from: n.prev?.period_from ?? null,
      extra_to: n.prev?.period_to ?? null,
    });
  }
  if (!rows.length) return { ok: "Momentálne netreba vystaviť žiadnu faktúru." };
  const { error } = await supabase.from("invoices").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: `Vystavené faktúry: ${rows.length}. Stiahnite XML pre Pohodu a pošlite ich firmám.` };
}

export async function markPaid(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const supabase = await createClient();
  const paid = String(f.get("paid_on") ?? "") || new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc("mark_invoice_paid", { p_id: String(f.get("id")), p_paid_on: paid });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Uhradená." };
}

export async function cancelInvoice(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", String(f.get("id"))).eq("status", "issued");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Stornovaná." };
}

export async function setExempt(_p: FirmState, f: FormData): Promise<FirmState> {
  await requirePlatform();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_company_exempt", { p_company: String(f.get("id")), p_exempt: f.get("exempt") === "1" });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Uložené." };
}
