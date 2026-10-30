"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import { buildPayroll } from "@/lib/payroll";
import { spread } from "@/lib/rozpis";
import { MN, monthRange, nf } from "@/lib/calc";

const num = (f: FormData, k: string) => Number(f.get(k));

async function audit(text: string, employee_id: string | null = null) {
  const supabase = await createClient();
  await supabase.from("audit_log").insert({ table_name: "payroll", action: "PAYROLL", after_lock: true, text, employee_id });
}

/** Odsúhlasiť dochádzku za zamestnanca. */
export async function confirmFor(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("month_confirmations")
    .insert({ employee_id: String(form.get("emp")), year: num(form, "y"), month: num(form, "m") });
  revalidatePath("/mzdy");
}

/** Odsúhlasiť všetkým zvyšným (okrem dohodárov). */
export async function confirmAll(form: FormData) {
  await requireAdmin();
  const y = num(form, "y");
  const m = num(form, "m");
  const supabase = await createClient();
  const { groups } = await buildPayroll(y, m);
  const rows = Object.entries(groups)
    .filter(([g]) => g !== "DOH")
    .flatMap(([, r]) => r)
    .filter((r) => !r.conf).map((r) => ({ employee_id: r.e.id, year: y, month: m }));
  if (rows.length) await supabase.from("month_confirmations").insert(rows);
  revalidatePath("/mzdy");
}

/** Uzavrieť / znovu otvoriť mesiac. */
export async function setMonth(form: FormData) {
  const me = await requireAdmin();
  const y = num(form, "y");
  const m = num(form, "m");
  const close = form.get("mode") === "close";
  const supabase = await createClient();
  await supabase.from("month_status").upsert({
    company_id: me.company_id,
    year: y,
    month: m,
    closed_manually: close,
    reopened: !close,
    changed_at: new Date().toISOString(),
  });
  await audit(`Mesiac ${MN[m - 1]} ${y} ${close ? "uzavretý" : "znovu otvorený"}`);
  revalidatePath("/", "layout");
}

/** Uloží rozpis hodín jedného dohodára za mesiac. */
export async function saveHours(empId: string, y: number, m: number, days: Record<string, number>) {
  await requireAdmin();
  const supabase = await createClient();
  const [a, b] = monthRange(y, m);
  const del = await supabase.from("contract_hours_days").delete().eq("employee_id", empId).gte("date", a).lte("date", b);
  if (del.error) return { error: del.error.message };
  const rows = Object.entries(days)
    .filter(([d, h]) => h > 0 && d >= a && d <= b)
    .map(([date, hours]) => ({ employee_id: empId, date, hours }));
  if (rows.length) {
    const ins = await supabase.from("contract_hours_days").insert(rows);
    if (ins.error) return { error: ins.error.message };
  }
  const { emps } = await loadCompany();
  const sum = rows.reduce((s, r) => s + r.hours, 0);
  await audit(`${emps.find((e) => e.id === empId)?.name ?? ""} · rozpis hodín za ${MN[m - 1]}: ${nf(sum)} h`, empId);
  revalidatePath("/mzdy");
  return { ok: true };
}

/** Rozpíše hodiny všetkým dohodárom, ktorí ich v mesiaci ešte nemajú (pevný počet alebo koeficient). */
export async function rozpisAll(form: FormData) {
  await requireAdmin();
  const y = num(form, "y");
  const m = num(form, "m");
  const supabase = await createClient();
  const { doh } = await buildPayroll(y, m);
  let n = 0;
  for (const r of doh) {
    if (r.sum > 0 || r.def.mode === "manual" || !r.def.total) continue;
    const res = spread({ days: r.days, total: r.def.total, max: r.def.max, week: r.def.week, step: r.def.step, how: "even" });
    if (res.err) continue;
    const rows = Object.entries(res.days).map(([date, hours]) => ({ employee_id: r.e.id, date, hours }));
    if (rows.length && !(await supabase.from("contract_hours_days").insert(rows)).error) n++;
  }
  await audit(`Rozpis hodín dohôd za ${MN[m - 1]}: ${n} dohodárov`);
  revalidatePath("/mzdy");
}
