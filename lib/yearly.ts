import type { SupabaseClient } from "@supabase/supabase-js";
import { Calc, balance, plus, type Emp, type Entry, type WorkGroup } from "@/lib/calc";
import { skHolidays } from "@/lib/holidays";
import { mailHtml, sendMail } from "@/lib/mail";

/**
 * Denná úloha prechodu na nový rok (volá ju Vercel Cron cez /api/cron/denne, beží s kľúčom service_role):
 *  1. od 1. 10. pripraví návrh štátnych sviatkov na ďalší rok a pošle ho superadminovi na kontrolu,
 *  2. od 1. 12. založí každému nárok na dovolenku na ďalší rok (kópia plného nároku z predošlého roka),
 *  3. v decembri a januári denne prepočíta prenos zostatku; po uzávierke decembra ho uzavrie.
 * Ručné zmeny admina (nárok, prenos) sa nikdy neprepisujú.
 */
export async function runDaily(sb: SupabaseClient, today: string, origin: string) {
  const log: string[] = [];
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));

  if (m >= 10) log.push(...(await holidayDraft(sb, y + 1, origin)));
  if (m === 12) log.push(...(await ensureVacationYears(sb, y + 1)));
  if (m === 1) log.push(...(await ensureVacationYears(sb, y)));
  if (m === 12 || m === 1) log.push(...(await updateCarry(sb, m === 12 ? y + 1 : y, today)));
  return log;
}

// ---------- 1. sviatky ----------
async function holidayDraft(sb: SupabaseClient, year: number, origin: string) {
  const out: string[] = [];
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const [{ count: conf }, { count: draft }] = await Promise.all([
    sb.from("state_holidays").select("date", { count: "exact", head: true }).gte("date", from).lte("date", to),
    sb.from("state_holiday_drafts").select("date", { count: "exact", head: true }).gte("date", from).lte("date", to),
  ]);
  if (conf) return out; // už potvrdené
  if (!draft) {
    const rows = await makeHolidayDraft(sb, year);
    out.push(`Návrh sviatkov ${year}: ${rows} dní`);
  }
  // e-mail superadminovi raz za rok
  const key = `holidays-mail-${year}`;
  const { data: sent } = await sb.from("platform_jobs").select("key").eq("key", key).maybeSingle();
  if (!sent) {
    const { data: ps } = await sb.from("platform_settings").select("notify_email").eq("id", 1).maybeSingle();
    const { data: list } = await sb.from("state_holiday_drafts").select("date, name").gte("date", from).lte("date", to).order("date");
    const rows = (list ?? []).map((h) => [`${Number(h.date.slice(8))}. ${Number(h.date.slice(5, 7))}. ${year}`, h.name] as [string, string]);
    const ok = await sendMail(
      ps?.notify_email ?? "admin@sigmadigital.sk",
      `KdeJe: skontrolujte štátne sviatky ${year}`,
      mailHtml(
        `Štátne sviatky ${year} – návrh na kontrolu`,
        [...rows, ["", "Do firiem sa zapíšu až po vašom potvrdení. Ak sa zákon zmenil, zoznam pred potvrdením upravte."]],
        { label: "Skontrolovať a potvrdiť", href: `${origin}/firmy#sviatky` }
      )
    );
    if (ok) {
      await sb.from("platform_jobs").upsert({ key });
      out.push(`E-mail so sviatkami ${year} odoslaný`);
    }
  }
  return out;
}

/** Vygeneruje návrh sviatkov roka (prepíše starý návrh). */
export async function makeHolidayDraft(sb: SupabaseClient, year: number) {
  const rows = skHolidays(year);
  await sb.from("state_holiday_drafts").delete().gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
  await sb.from("state_holiday_drafts").insert(rows);
  return rows.length;
}

// ---------- 2. nárok na nový rok ----------
type EmpRow = Emp & { company_id: string; is_external: boolean };
const STD_ENT = 25;

async function activeEmps(sb: SupabaseClient, year: number) {
  const { data } = await sb
    .from("employees")
    .select("id, company_id, name, contract_type, work_group_id, date_from, date_to, active, is_external");
  return ((data ?? []) as EmpRow[]).filter(
    (e) => e.active && !e.is_external && e.contract_type !== "DOH" && (!e.date_to || e.date_to >= `${year}-01-01`)
  );
}

async function ensureVacationYears(sb: SupabaseClient, year: number) {
  const emps = await activeEmps(sb, year);
  if (!emps.length) return [];
  const ids = emps.map((e) => e.id);
  const { data: rows } = await sb
    .from("vacation_years")
    .select("employee_id, year, entitlement, entitlement_full")
    .in("year", [year - 1, year])
    .in("employee_id", ids);
  const has = new Set((rows ?? []).filter((r) => r.year === year).map((r) => r.employee_id));
  const prev = new Map((rows ?? []).filter((r) => r.year === year - 1).map((r) => [r.employee_id, r]));
  const add = emps
    .filter((e) => !has.has(e.id))
    .map((e) => {
      const p = prev.get(e.id);
      const ent = Number(p?.entitlement_full ?? p?.entitlement ?? STD_ENT);
      return {
        employee_id: e.id,
        year,
        entitlement_full: ent,
        entitlement: ent,
        carry_in: 0,
        check_needed: ent < STD_ENT, // napr. 20 dní – nezmenilo sa niečo (vek, dieťa)?
        carry_manual: false,
        carry_final: false,
        auto_created: true,
      };
    });
  if (!add.length) return [];
  const { error } = await sb.from("vacation_years").insert(add);
  return [error ? `Nárok ${year}: chyba ${error.message}` : `Nárok ${year}: založený pre ${add.length} zamestnancov`];
}

// ---------- 3. prenos zostatku ----------
async function updateCarry(sb: SupabaseClient, year: number, today: string) {
  const out: string[] = [];
  const prevY = year - 1;
  const from = `${prevY}-01-01`, to = `${prevY}-12-31`;
  const { data: targets } = await sb
    .from("vacation_years")
    .select("employee_id, carry_in, carry_manual, carry_final")
    .eq("year", year)
    .eq("carry_manual", false)
    .eq("carry_final", false);
  if (!targets?.length) return out;

  const emps = (await activeEmps(sb, year)).filter((e) => targets.some((t) => t.employee_id === e.id));
  const byCompany = new Map<string, EmpRow[]>();
  for (const e of emps) byCompany.set(e.company_id, [...(byCompany.get(e.company_id) ?? []), e]);

  for (const [cid, list] of byCompany) {
    const ids = list.map((e) => e.id);
    const [g, h, s, r, v, ms, en] = await Promise.all([
      sb.from("work_groups").select("*").eq("company_id", cid),
      sb.from("holidays").select("date").eq("company_id", cid).gte("date", from).lte("date", to),
      sb.from("settings").select("carry_mode, carry_max").eq("company_id", cid).maybeSingle(),
      sb.from("rights_groups").select("lock_days, is_default").eq("company_id", cid),
      sb.from("vacation_years").select("employee_id, entitlement, carry_in").eq("year", prevY).in("employee_id", ids),
      sb.from("month_status").select("closed_manually, reopened").eq("company_id", cid).eq("year", prevY).eq("month", 12).maybeSingle(),
      loadDov(sb, ids, from, to),
    ]);
    const calc = new Calc({
      holidays: (h.data ?? []).map((x) => x.date as string),
      groups: (g.data ?? []) as WorkGroup[],
      emps: list,
      today,
    });
    const mode = s.data?.carry_mode ?? "all";
    const max = Number(s.data?.carry_max ?? 10);
    const lockDays = Number(((r.data ?? []).find((x) => x.is_default) ?? r.data?.[0])?.lock_days ?? 3);
    // december je uzavretý → prenos je konečný
    const final =
      (!!ms.data?.closed_manually && !ms.data?.reopened) || (!ms.data?.reopened && today >= plus(`${year}-01-01`, lockDays));

    let n = 0;
    for (const e of list) {
      const vac = (v.data ?? []).find((x) => x.employee_id === e.id);
      if (!vac) continue; // bez nároku v predošlom roku nie je čo prenášať
      const b = balance(calc, e.id, en, { entitlement: Number(vac.entitlement), carry_in: Number(vac.carry_in) }, max);
      const carry = Math.round((b.left < 0 ? b.left : mode === "max" ? Math.min(b.left, max) : b.left) * 100) / 100;
      const t = targets.find((x) => x.employee_id === e.id)!;
      if (Number(t.carry_in) === carry && !final) continue;
      await sb
        .from("vacation_years")
        .update({ carry_in: carry, carry_final: final })
        .eq("employee_id", e.id)
        .eq("year", year)
        .eq("carry_manual", false);
      n++;
    }
    if (n) out.push(`Prenos ${prevY}→${year}: firma ${cid.slice(0, 8)} – ${n} zamestnancov${final ? " (konečný)" : ""}`);
  }
  return out;
}

/** Dovolenky zamestnancov v roku (orezané na rok, aby sa nerátali dni z iného roka). */
async function loadDov(sb: SupabaseClient, ids: string[], from: string, to: string): Promise<Entry[]> {
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

/** Spustí dennú úlohu a zapíše výsledok do job_runs (prehľad spustení v záložke Firmy). */
export async function runAndRecord(sb: SupabaseClient, today: string, origin: string, source: "cron" | "manual") {
  try {
    const log = await runDaily(sb, today, origin);
    await sb.from("job_runs").insert({ source, ok: true, log: log.join(" · ") || null });
    return { ok: true as const, log };
  } catch (e) {
    await sb.from("job_runs").insert({ source, ok: false, log: String(e) });
    return { ok: false as const, error: String(e) };
  }
}
