import { createClient } from "@/lib/supabase/server";
import { loadCompany, loadEntries, type EmpFull } from "@/lib/loaders";
import { KIND, monthDays, monthRange, type Entry } from "@/lib/calc";
import { isOn, monthVals, payCols, ppOrder, type Vals } from "@/lib/report";
import type { RzDay } from "@/lib/rozpis";
import { loadOvertime, type OTMonth } from "@/lib/overtime";
import { attHours } from "@/lib/attendance";
import { limits, loadDohHours, warnings, brigPeriod, type DohKind } from "@/lib/dohLimits";

export type ContractHours = {
  employee_id: string;
  mode: "fixed" | "worked" | "manual";
  hours: number | null;
  coef: number | null;
  max_day: number | null;
  max_week: number | null;
  max_month?: number | null;
  kind?: DohKind | null;
  step: number;
};

export type PayRow = { e: EmpFull; v: Vals; sl: number | null; conf: { at: string; by: string | null } | null; ot: OTMonth | null };
export type DohRow = {
  e: EmpFull;
  /** hodiny po dňoch: zápis dohodára (príchod/odchod) má prednosť pred rozpisom */
  hours: Record<string, number>;
  /** dni, ktoré si dohodár zapísal sám */
  fixed: Record<string, number>;
  /** súčet len z rozpisu (bez vlastných zápisov) */
  rozpisSum: number;
  sum: number;
  days: RzDay[];
  def: {
    mode: ContractHours["mode"];
    total: number;
    worked: number;
    coef: number;
    max: number;
    week: number | null;
    step: number;
    flex: boolean;
    /** najviac hodín v tomto mesiaci podľa limitov (mesiac firmy, 350 h ročne, priemer brigádnika) */
    cap: number | null;
    capWhy: string;
  };
  /** prekročené limity (týždeň, mesiac, rok, priemer) */
  warn: string[];
};

/** Všetky dáta pre Podklad pre mzdy za mesiac. */
export async function buildPayroll(y: number, m: number) {
  const co = await loadCompany();
  const { calc, emps, enabled } = co;
  const supabase = await createClient();
  const [a, b] = monthRange(y, m);
  const dohIds = emps.filter((e) => e.contract_type === "DOH").map((e) => e.id);
  const [entries, conf, ch, chd, datt] = await Promise.all([
    loadEntries(a, b),
    supabase.from("month_confirmations").select("employee_id, confirmed_at, confirmed_by").eq("year", y).eq("month", m),
    supabase.from("contract_hours").select("*"),
    supabase.from("contract_hours_days").select("employee_id, date, hours").gte("date", a).lte("date", b),
    dohIds.length
      ? supabase.from("attendance").select("employee_id, day, arrive, leave, break_min").in("employee_id", dohIds).gte("day", a).lte("day", b)
      : Promise.resolve({ data: [] }),
  ]);
  const cols = payCols(enabled);
  const days = monthDays(y, m);
  const wd = days.filter(calc.isWork).length;

  const visible = emps.filter((e) => e.in_payroll && isOn(e, a, b));
  const confOf = (id: string) => {
    const c = (conf.data ?? []).find((x) => x.employee_id === id);
    return c ? { at: String(c.confirmed_at).slice(0, 10), by: c.confirmed_by as string | null } : null;
  };

  // nadčasy: preplatiť (vrátane prepadnutého náhradného voľna) a do náhradného voľna
  const mk = `${y}-${String(m).padStart(2, "0")}`;
  const otMap = await loadOvertime(calc, visible, mk);
  const otOf = (id: string) => otMap.get(id)?.find((x) => x.month === mk) ?? null;

  const groups: Record<string, PayRow[]> = {};
  for (const g of ppOrder(visible.map((e) => e.contract_type)).filter((g) => g !== "DOH")) {
    groups[g] = visible
      .filter((e) => e.contract_type === g)
      .map((e) => {
        const sl = calc.slMonth(e.id, y, m, entries);
        return { e, v: monthVals(calc, entries, e.id, cols, y, m), sl: sl.none ? null : sl.n, conf: confOf(e.id), ot: otOf(e.id) };
      });
  }

  const absHours = (id: string, d: string) =>
    entries
      .filter((x: Entry) => x.employee_id === id && x.date_from <= d && x.date_to >= d && KIND[x.type] === "abs")
      .reduce((s, x) => s + calc.hoursOf(x), 0);

  // hodiny dohodárov za posledný rok (ročný limit a priemer brigádnika)
  const dohAll = await loadDohHours(
    visible.filter((e) => e.contract_type === "DOH").map((e) => e.id),
    `${y - 1}-${String(m).padStart(2, "0")}-01`,
    `${y}-12-31`
  );

  const doh: DohRow[] = visible
    .filter((e) => e.contract_type === "DOH")
    .map((e) => {
      const hours: Record<string, number> = {};
      for (const r of chd.data ?? []) if (r.employee_id === e.id) hours[String(r.date)] = Number(r.hours);
      const rozpisSum = Object.values(hours).reduce((s, h) => s + h, 0);
      const fixed: Record<string, number> = {};
      for (const r of (datt.data ?? []) as { employee_id: string; day: string; arrive: string; leave: string; break_min: number }[])
        if (r.employee_id === e.id) fixed[String(r.day)] = Math.round(attHours(r) * 100) / 100;
      Object.assign(hours, fixed);
      const sum = Object.values(hours).reduce((s, h) => s + h, 0);
      const rd: RzDay[] = days.map((d) => ({
        d,
        work: calc.isWork(d) && isOn(e, d, d),
        abs: absHours(e.id, d),
        ...(fixed[d] !== undefined ? { fixed: fixed[d] } : {}),
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
      const coef = 1; // evidujú sa skutočne odpracované hodiny (koeficient sa nepoužíva)
      const r = (x: number) => Math.round(x / step) * step;
      const total = D.mode === "fixed" ? Number(D.hours) || 0 : D.mode === "worked" ? r(worked / coef) : sum;
      // limity: zákonné podľa druhu dohody + vlastné z karty
      const lim = limits(D);
      const all = { ...(dohAll.get(e.id) ?? {}), ...hours };
      for (const d of Object.keys(all)) if (d >= a && d <= b && hours[d] === undefined) delete all[d];
      const outside = (f: (d: string) => boolean) => Object.entries(all).reduce((s, [d, h]) => (f(d) && (d < a || d > b) ? s + h : s), 0);
      const caps: [number, string][] = [];
      if (lim.month != null) caps.push([lim.month, `limit firmy ${lim.month} h mesačne`]);
      if (lim.year != null) caps.push([Math.max(0, lim.year - outside((d) => d.slice(0, 4) === String(y))), `350 h ročne (zvyšok roka)`]);
      if (lim.avgWeek) {
        const bp = brigPeriod(e.date_from, e.date_to, b);
        caps.push([Math.max(0, lim.avgWeek * bp.weeks - outside((d) => d >= bp.from && d <= bp.to)), "priemer 20 h týždenne za obdobie dohody"]);
      }
      const capMin = caps.length ? caps.reduce((x, c) => (c[0] < x[0] ? c : x)) : null;
      const warn = warnings(all, a, b, lim, e);
      return {
        e,
        hours,
        fixed,
        rozpisSum,
        sum,
        days: rd,
        def: {
          mode: D.mode,
          total,
          worked,
          coef,
          max: Math.min(lim.day, Number(D.max_day) || 8),
          week: lim.week,
          step,
          flex,
          cap: capMin ? Math.round(capMin[0] * 100) / 100 : null,
          capWhy: capMin ? capMin[1] : "",
        },
        warn,
      };
    });

  /** typ vzťahu, v ktorom má niekto nadčas alebo náhradné voľno → stĺpce nadčasov */
  const otCols = (g: string) => (groups[g] ?? []).some((r) => r.ot && (r.ot.ot || r.ot.pay || r.ot.nv || r.ot.expired || r.ot.balance || r.ot.used));
  return { ...co, cols, days, wd, groups, doh, entries, otCols };
}
