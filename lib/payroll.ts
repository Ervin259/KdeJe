import { createClient } from "@/lib/supabase/server";
import { loadCompany, loadEntries, type EmpFull } from "@/lib/loaders";
import { KIND, monthDays, monthRange, type Entry } from "@/lib/calc";
import { isOn, monthVals, payCols, PP_ORDER, type Vals } from "@/lib/report";
import type { RzDay } from "@/lib/rozpis";

export type ContractHours = {
  employee_id: string;
  mode: "fixed" | "worked" | "manual";
  hours: number | null;
  coef: number | null;
  max_day: number | null;
  max_week: number | null;
  step: number;
};

export type PayRow = { e: EmpFull; v: Vals; sl: number | null; conf: { at: string; by: string | null } | null };
export type DohRow = {
  e: EmpFull;
  hours: Record<string, number>;
  sum: number;
  days: RzDay[];
  def: { mode: ContractHours["mode"]; total: number; worked: number; coef: number; max: number; week: number | null; step: number; flex: boolean };
};

/** Všetky dáta pre Podklad pre mzdy za mesiac. */
export async function buildPayroll(y: number, m: number) {
  const co = await loadCompany();
  const { calc, emps, enabled } = co;
  const supabase = await createClient();
  const [a, b] = monthRange(y, m);
  const [entries, conf, ch, chd] = await Promise.all([
    loadEntries(a, b),
    supabase.from("month_confirmations").select("employee_id, confirmed_at, confirmed_by").eq("year", y).eq("month", m),
    supabase.from("contract_hours").select("*"),
    supabase.from("contract_hours_days").select("employee_id, date, hours").gte("date", a).lte("date", b),
  ]);
  const cols = payCols(enabled);
  const days = monthDays(y, m);
  const wd = days.filter(calc.isWork).length;

  const visible = emps.filter((e) => e.in_payroll && isOn(e, a, b));
  const confOf = (id: string) => {
    const c = (conf.data ?? []).find((x) => x.employee_id === id);
    return c ? { at: String(c.confirmed_at).slice(0, 10), by: c.confirmed_by as string | null } : null;
  };

  const groups: Record<string, PayRow[]> = {};
  for (const g of PP_ORDER.filter((g) => g !== "DOH")) {
    groups[g] = visible
      .filter((e) => e.contract_type === g)
      .map((e) => {
        const sl = calc.slMonth(e.id, y, m, entries);
        return { e, v: monthVals(calc, entries, e.id, cols, y, m), sl: sl.none ? null : sl.n, conf: confOf(e.id) };
      });
  }

  const absHours = (id: string, d: string) =>
    entries
      .filter((x: Entry) => x.employee_id === id && x.date_from <= d && x.date_to >= d && KIND[x.type] === "abs")
      .reduce((s, x) => s + calc.hoursOf(x), 0);

  const doh: DohRow[] = visible
    .filter((e) => e.contract_type === "DOH")
    .map((e) => {
      const hours: Record<string, number> = {};
      for (const r of chd.data ?? []) if (r.employee_id === e.id) hours[String(r.date)] = Number(r.hours);
      const sum = Object.values(hours).reduce((s, h) => s + h, 0);
      const rd: RzDay[] = days.map((d) => ({
        d,
        work: calc.isWork(d) && isOn(e, d, d),
        abs: absHours(e.id, d),
      }));
      const D = ((ch.data ?? []).find((x) => x.employee_id === e.id) as ContractHours | undefined) ?? {
        mode: "manual" as const,
        hours: 0,
        coef: 1,
        max_day: 8,
        max_week: null,
        step: 1,
      };
      const step = Number(D.step) || 1;
      const flex = calc.group(e.id).flexible;
      const H = calc.sched(e.id).H;
      const worked = flex ? 0 : rd.filter((x) => x.work).reduce((s, x) => s + Math.max(0, H - x.abs), 0);
      const coef = Number(D.coef) || 1;
      const r = (x: number) => Math.round(x / step) * step;
      const total = D.mode === "fixed" ? Number(D.hours) || 0 : D.mode === "worked" ? r(worked / coef) : sum;
      return {
        e,
        hours,
        sum,
        days: rd,
        def: { mode: D.mode, total, worked, coef, max: Number(D.max_day) || 8, week: D.max_week ? Number(D.max_week) : null, step, flex },
      };
    });

  return { ...co, cols, days, wd, groups, doh, entries };
}
