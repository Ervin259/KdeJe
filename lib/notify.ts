import type { SupabaseClient } from "@supabase/supabase-js";
import { Calc, balance, nf, type Emp, type Entry, type WorkGroup } from "@/lib/calc";
import { mailHtml, sendMail } from "@/lib/mail";

/**
 * Notifikácie – e-mailové upozornenia podľa pravidiel firmy (tabuľka notification_rules, migrácia 19).
 * Pravidlo vac_left: dočerpanie dovolenky do konca roka – dostane ho len ten, kto má „dočerpať“ viac ako 0
 * (zostatok po odpočítaní naplánovanej dovolenky mínus prenos do nového roka z nastavení firmy).
 * Odosiela nočná úloha v dňoch z pravidla (MM-DD) alebo admin tlačidlom „Odoslať teraz“.
 */

export type NotifKind = "vac_left";
export type NotifRule = { id: string; company_id: string; kind: NotifKind; enabled: boolean; dates: string[]; notify_admin: boolean };

export const NOTIF: Record<NotifKind, { title: string; desc: string }> = {
  vac_left: {
    title: "Dočerpanie dovolenky do konca roka",
    desc: "Zamestnanec, ktorý má dočerpať viac ako 0 dní (zostatok po odpočítaní naplánovanej dovolenky je vyšší ako prenos do nového roka), dostane e-mail s počtom dní na dočerpanie do 31. 12.",
  },
};

/** „10-01“ → „1. 10.“ */
export const mmddTxt = (s: string) => `${Number(s.slice(3, 5))}. ${Number(s.slice(0, 2))}.`;

/** „1. 10., 1.11, 15.12.“ → ["10-01", "11-01", "12-15"]; null pri chybe */
export function parseDates(txt: string): string[] | null {
  const out = new Set<string>();
  for (const part of txt.split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?$/);
    if (!m) return null;
    const d = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(2024, mo, 0)).getUTCDate()) return null;
    out.add(`${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return [...out].sort();
}

export type VacLeftRow = { id: string; name: string; email: string | null; left: number; over: number; carryMax: number };

type EmpRow = Emp & { company_id: string; is_external: boolean; email: string | null; role: string };

/** Zamestnanci firmy, ktorí majú k dnešnému dňu dočerpať viac ako 0 dní dovolenky. */
export async function vacLeftList(sb: SupabaseClient, cid: string, today: string): Promise<VacLeftRow[]> {
  const y = today.slice(0, 4);
  const from = `${y}-01-01`, to = `${y}-12-31`;
  const { data: er } = await sb
    .from("employees")
    .select("id, company_id, name, email, role, contract_type, work_group_id, work_override, date_from, date_to, active, is_external")
    .eq("company_id", cid);
  const emps = ((er ?? []) as EmpRow[]).filter(
    (e) => e.active && !e.is_external && e.contract_type !== "DOH" && (!e.date_to || e.date_to >= today) && (!e.date_from || e.date_from <= to)
  );
  if (!emps.length) return [];
  const ids = emps.map((e) => e.id);
  const [g, h, s, v, en] = await Promise.all([
    sb.from("work_groups").select("*").eq("company_id", cid),
    sb.from("holidays").select("date").eq("company_id", cid).gte("date", from).lte("date", to),
    sb.from("settings").select("carry_max").eq("company_id", cid).maybeSingle(),
    sb.from("vacation_years").select("employee_id, entitlement, carry_in").eq("year", Number(y)).in("employee_id", ids),
    loadDov(sb, ids, from, to),
  ]);
  const calc = new Calc({ holidays: (h.data ?? []).map((x) => x.date as string), groups: (g.data ?? []) as WorkGroup[], emps, today });
  const max = Number(s.data?.carry_max ?? 10);
  const out: VacLeftRow[] = [];
  for (const e of emps) {
    const vac = (v.data ?? []).find((x) => x.employee_id === e.id);
    if (!vac) continue;
    const b = balance(calc, e.id, en, { entitlement: Number(vac.entitlement), carry_in: Number(vac.carry_in) }, max);
    if (b.over > 0.001) out.push({ id: e.id, name: e.name, email: e.email, left: b.left, over: b.over, carryMax: max });
  }
  return out.sort((a, b) => b.over - a.over || a.name.localeCompare(b.name, "sk"));
}

/** Dovolenky zamestnancov v roku (orezané na rok). */
export async function loadDov(sb: SupabaseClient, ids: string[], from: string, to: string): Promise<Entry[]> {
  const out: Entry[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from("entries")
      .select("id, employee_id, type, date_from, date_to, part, time_from, time_to")
      .eq("type", "DOV")
      .in("employee_id", ids)
      .lte("date_from", to)
      .gte("date_to", from)
      .order("date_from")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const x of (data ?? []) as Entry[])
      out.push({ ...x, date_from: x.date_from < from ? from : x.date_from, date_to: x.date_to > to ? to : x.date_to });
    if (!data || data.length < 1000) break;
  }
  return out;
}

const days = (n: number) => `${nf(n)} ${n === 1 ? "deň" : n > 1 && n < 5 && Number.isInteger(n) ? "dni" : "dní"}`;

/** Odošle pravidlo vac_left: e-mail každému s dočerpaním > 0 a súhrn adminom. Výsledok zapíše do notification_log. */
export async function sendVacLeft(sb: SupabaseClient, rule: NotifRule, today: string, origin: string) {
  const y = today.slice(0, 4);
  const list = await vacLeftList(sb, rule.company_id, today);
  const { data: co } = await sb.from("companies").select("name").eq("id", rule.company_id).maybeSingle();
  const firm = (co?.name as string | undefined) ?? "";
  const log: { rule_id: string; company_id: string; sent_on: string; employee_id: string | null; email: string | null; ok: boolean; info: string }[] = [];
  let sent = 0;
  for (const r of list) {
    let ok = false;
    if (r.email) {
      ok = await sendMail(
        r.email,
        `Dočerpanie dovolenky do 31. 12. ${y}`,
        mailHtml(
          `Dovolenka – dočerpať do 31. 12. ${y}`,
          [
            ["Firma", firm],
            ["Zamestnanec", r.name],
            ["Zostatok dovolenky", days(r.left)],
            ["Do nového roka sa prenáša najviac", days(r.carryMax)],
            ["Dočerpať do 31. 12.", days(r.over)],
          ],
          { href: `${origin}/moj-prehlad`, label: "Otvoriť môj prehľad" }
        )
      );
      if (ok) sent++;
    }
    log.push({ rule_id: rule.id, company_id: rule.company_id, sent_on: today, employee_id: r.id, email: r.email, ok, info: r.email ? `dočerpať ${nf(r.over)}` : "bez e-mailu" });
  }
  let admins = 0;
  if (rule.notify_admin && list.length) {
    const { data: ad } = await sb.from("employees").select("email").eq("company_id", rule.company_id).eq("role", "admin").eq("active", true);
    const rows: [string, string][] = list.map((r) => [r.name, `dočerpať ${days(r.over)}${r.email ? "" : " (bez e-mailu – neposlané)"}`]);
    for (const a of ad ?? []) {
      if (!a.email) continue;
      const ok = await sendMail(
        a.email as string,
        `Dočerpanie dovolenky – ${list.length} ${list.length === 1 ? "zamestnanec" : list.length < 5 ? "zamestnanci" : "zamestnancov"}`,
        mailHtml(`Dočerpanie dovolenky do 31. 12. ${y} · ${firm}`, rows, { href: `${origin}/prehlad`, label: "Otvoriť Prehľad" })
      );
      if (ok) admins++;
      log.push({ rule_id: rule.id, company_id: rule.company_id, sent_on: today, employee_id: null, email: a.email as string, ok, info: `súhrn adminovi (${list.length})` });
    }
  }
  if (log.length) await sb.from("notification_log").insert(log);
  else await sb.from("notification_log").insert({ rule_id: rule.id, company_id: rule.company_id, sent_on: today, employee_id: null, email: null, ok: true, info: "nikto nemá čo dočerpať" });
  return { list: list.length, sent, admins, noEmail: list.filter((r) => !r.email).length };
}

/** Nočná úloha: pravidlá, ktoré majú dnes deň odoslania a dnes ešte neboli odoslané. */
export async function runNotifications(sb: SupabaseClient, today: string, origin: string) {
  const out: string[] = [];
  const mmdd = today.slice(5, 10);
  const { data: rules } = await sb.from("notification_rules").select("id, company_id, kind, enabled, dates, notify_admin").eq("enabled", true).contains("dates", [mmdd]);
  for (const rule of (rules ?? []) as NotifRule[]) {
    const { data: co } = await sb.from("companies").select("name, status").eq("id", rule.company_id).maybeSingle();
    if (!co || co.status === "suspended") continue;
    const { count } = await sb.from("notification_log").select("id", { count: "exact", head: true }).eq("rule_id", rule.id).eq("sent_on", today);
    if (count) continue;
    if (rule.kind === "vac_left") {
      const r = await sendVacLeft(sb, rule, today, origin);
      out.push(`Dočerpanie dovolenky (${co.name}): ${r.sent} z ${r.list} e-mailov${r.admins ? `, súhrn ${r.admins} adminom` : ""}`);
    }
  }
  return out;
}
