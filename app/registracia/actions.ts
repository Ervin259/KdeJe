"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { mailHtml, sendMail } from "@/lib/mail";

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
  const dic = str(f, "dic").replace(/\s/g, "");
  if (dic && !/^\d{10}$/.test(dic)) return { error: "DIČ má 10 číslic." };
  const icdph = str(f, "icdph").replace(/\s/g, "").toUpperCase();
  if (icdph && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(icdph)) return { error: "IČ DPH má tvar SK + 10 číslic." };
  const n = Number(str(f, "employees"));
  const supabase = await createClient();
  const row = {
    p_company: str(f, "company"),
    p_ico: ico || null,
    p_name: str(f, "name"),
    p_email: str(f, "email"),
    p_phone: str(f, "phone") || null,
    p_employees: Number.isInteger(n) && n > 0 ? n : null,
    p_note: str(f, "note") || null,
    p_dic: dic || null,
    p_icdph: icdph || null,
    p_street: str(f, "street") || null,
    p_city: str(f, "city") || null,
    p_zip: str(f, "zip") || null,
  };
  const { error } = await supabase.rpc("submit_signup", row);
  if (error) return { error: error.message };

  // upozornenie pre superadmina
  const { data: ps } = await supabase.from("platform_settings").select("notify_email").eq("id", 1).maybeSingle();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  await sendMail(
    ps?.notify_email,
    `KdeJe: nová žiadosť – ${row.p_company}`,
    mailHtml(
      "Nová žiadosť o zriadenie KdeJe",
      [
        ["Firma", row.p_company],
        ["IČO", row.p_ico],
        ["DIČ", row.p_dic],
        ["IČ DPH", row.p_icdph],
        ["Adresa", [row.p_street, [row.p_zip, row.p_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
        ["Admin", `${row.p_name} <${row.p_email}>`],
        ["Telefón", row.p_phone],
        ["Počet užívateľov", row.p_employees],
        ["Poznámka", row.p_note],
      ],
      { href: `${origin}/firmy`, label: "Otvoriť žiadosti" }
    )
  );
  return { ok: true, email: str(f, "email") };
}
