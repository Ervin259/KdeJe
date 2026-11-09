/**
 * Výkaz dochádzky za obdobie: po dňoch príchod, odchod, prestávka, odpracované, neprítomnosti,
 * nočná práca, práca v sobotu/nedeľu a vo sviatok, rozdiel voči fondu; súhrn za obdobie.
 * Dohodári: časy sa dopočítajú z rozpisu hodín (príchod podľa nastavenia, prestávka nad 6 h).
 */
import { KIND, eachDay, type Calc, type Emp, type Entry } from "./calc";
import { computeDay, defaults, fromMin, toMin, type Att, type DayInfo } from "./attendance";
import type { WorkTime } from "./worktime";

export type VDay = DayInfo & {
  /** deň v týždni 0 = nedeľa */
  dow: number;
  /** hodiny neprítomnosti podľa kódu (celý deň = fond dňa) */
  absBy: Record<string, number>;
  /** odpracované v sobotu/nedeľu, vo sviatok */
  weekend: number;
  holidayWork: number;
  /** dohodár – časy dopočítané z rozpisu */
  doh: boolean;
};

export type VSum = {
  fond: number;
  worked: number;
  night: number;
  weekend: number;
  holidayWork: number;
  /** neprítomnosti podľa kódu v hodinách */
  absBy: Record<string, number>;
  /** súčet rozdielov voči fondu (saldo) */
  saldo: number;
  /** nadčas (len pri povolených nadčasoch) */
  overtime: number;
  /** dni s úpravou dochádzky */
  edited: number;
};

export type VEmp = Emp & { site?: string | null; department?: string | null };
export type Vykaz = { emp: VEmp; w: WorkTime; days: VDay[]; sum: VSum };

/** Časy dohodára z hodín v deň: príchod podľa nastavenia, pri viac ako 6 h prestávka 30 min. */
function dohDay(w: WorkTime, h: number) {
  const d = defaults(w);
  const bm = h > 6 ? Math.max(30, d.break_min) : 0;
  const a = toMin(d.arrive);
  const l = a + Math.round(h * 60) + bm;
  const bs = bm ? (d.break_start && toMin(d.break_start) > a && toMin(d.break_start) + bm < l ? d.break_start : fromMin(a + Math.round((l - a - bm) / 2))) : null;
  return { arrive: d.arrive, leave: fromMin(l), break_start: bs, break_min: bm };
}

export function buildVykaz(
  calc: Calc,
  emp: VEmp,
  from: string,
  to: string,
  entries: Entry[],
  atts: Att[],
  dohHours: Record<string, number> | null
): Vykaz {
  const w = calc.group(emp.id);
  const isDoh = emp.contract_type === "DOH";
  const byDay = new Map(atts.filter((a) => a.employee_id === emp.id).map((a) => [a.day, a]));
  const days: VDay[] = [];
  eachDay(from, to, (d) => {
    // mimo pracovného pomeru sa deň neráta
    if ((emp.date_from && d < emp.date_from) || (emp.date_to && d > emp.date_to)) return;
    let att = byDay.get(d) ?? null;
    const h = isDoh ? dohHours?.[d] ?? 0 : 0;
    if (isDoh && !att && h > 0) att = { employee_id: emp.id, day: d, ...dohDay(w, h) };
    const info = computeDay(calc, emp.id, d, entries, att);
    // dohodár nemá fond – „rozdiel“ ani predvolené časy sa nerátajú
    const x: DayInfo = isDoh
      ? { ...info, fond: 0, diff: 0, ...(att ? {} : { arrive: null, leave: null, break_start: null, break_min: 0, worked: 0, night: 0 }), edited: !!byDay.get(d) }
      : info;
    const absBy: Record<string, number> = {};
    if (x.work) {
      const full = x.absentFull;
      for (const e of entries) {
        if (e.employee_id !== emp.id || e.date_from > d || e.date_to < d) continue;
        const hrs = full && e.part === "full" ? defaults(w).H : e.part === "full" ? 0 : calc.hoursOf(e);
        if (hrs > 0 && KIND[e.type] === "abs") absBy[e.type] = (absBy[e.type] ?? 0) + hrs;
      }
    }
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    const off = !x.work && x.worked > 0;
    days.push({
      ...x,
      dow,
      absBy,
      weekend: off && !x.holiday && (dow === 0 || dow === 6) ? x.worked : 0,
      holidayWork: off && x.holiday ? x.worked : 0,
      doh: isDoh,
    });
  });

  const sum: VSum = { fond: 0, worked: 0, night: 0, weekend: 0, holidayWork: 0, absBy: {}, saldo: 0, overtime: 0, edited: 0 };
  let posDiff = 0;
  for (const x of days) {
    sum.fond += x.fond;
    sum.worked += x.worked;
    sum.night += x.night;
    sum.weekend += x.weekend;
    sum.holidayWork += x.holidayWork;
    sum.saldo += x.diff;
    if (x.diff > 0) posDiff += x.diff;
    if (x.edited) sum.edited++;
    for (const [k, v] of Object.entries(x.absBy)) sum.absBy[k] = (sum.absBy[k] ?? 0) + v;
  }
  if (!isDoh && w.overtime !== "none") {
    // denné obdobie: nadčas je každá hodina nad fond dňa; týždeň/4 týždne: kladné saldo za obdobie
    sum.overtime = !w.flexible || w.flex_period === "day" ? posDiff : Math.max(0, sum.saldo);
  }
  return { emp, w, days, sum };
}
