/**
 * Limity hodín dohodárov podľa Zákonníka práce a vlastného nastavenia firmy.
 *  • dohoda o pracovnej činnosti – najviac 10 h v každom týždni (§ 228a)
 *  • dohoda o brigádnickej práci študentov – priemerne najviac 20 h týždenne za celé obdobie dohody (§ 228)
 *  • dohoda o vykonaní práce – najviac 350 h v kalendárnom roku (§ 226)
 *  • vlastné limity: max. za deň, za týždeň, za mesiac (contract_hours)
 * Hodiny dňa: zápis dohodára (príchod/odchod) má prednosť pred rozpisom hodín.
 */
import { createClient } from "@/lib/supabase/server";
import { attHours } from "@/lib/attendance";

export type DohKind = "dopc" | "brig" | "dovp";
export const DOH_KIND: Record<DohKind, string> = {
  dopc: "Dohoda o pracovnej činnosti",
  brig: "Dohoda o brigádnickej práci študentov",
  dovp: "Dohoda o vykonaní práce",
};
export const DOH_LAW: Record<DohKind, string> = {
  dopc: "najviac 10 h v každom týždni",
  brig: "priemerne najviac 20 h týždenne za celé obdobie dohody",
  dovp: "najviac 350 h v kalendárnom roku",
};

export type DohSettings = { kind: DohKind | null; max_day: number | null; max_week: number | null; max_month: number | null };
export type Limits = {
  kind: DohKind | null;
  day: number;
  /** pevný strop za týždeň (pondelok – nedeľa) */
  week: number | null;
  month: number | null;
  year: number | null;
  /** priemer za týždeň za obdobie dohody (brigádnik) */
  avgWeek: number | null;
};

export function limits(ch: Partial<DohSettings> | null | undefined): Limits {
  const kind = (ch?.kind as DohKind) ?? null;
  const own = ch?.max_week ? Number(ch.max_week) : null;
  const week = kind === "dopc" ? Math.min(10, own ?? 10) : own;
  return {
    kind,
    day: Math.min(12, Number(ch?.max_day) || 12),
    week,
    month: ch?.max_month ? Number(ch.max_month) : null,
    year: kind === "dovp" ? 350 : null,
    avgWeek: kind === "brig" ? 20 : null,
  };
}

const P = (s: string) => new Date(s + "T00:00:00Z");
export const mondayOf = (s: string) => {
  const d = P(s);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
};
const addDays = (s: string, n: number) => new Date(P(s).getTime() + n * 864e5).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const nf = (n: number) => String(r2(n)).replace(".", ",");

/** Obdobie dohody brigádnika: od nástupu do konca (najviac 12 mesiacov). */
export function brigPeriod(dateFrom: string | null, dateTo: string | null, day: string) {
  const from = dateFrom ?? `${day.slice(0, 4)}-01-01`;
  const y = Number(from.slice(0, 4));
  const max = new Date(Date.UTC(y + 1, Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)) - 1)).toISOString().slice(0, 10);
  const to = dateTo && dateTo < max ? dateTo : max;
  const weeks = Math.max(1, (P(to).getTime() - P(from).getTime()) / 864e5 / 7 + 1 / 7);
  return { from, to, weeks };
}

/** Hodiny dohodárov po dňoch (rozpis + zápisy, zápis má prednosť). */
export async function loadDohHours(ids: string[], from: string, to: string): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!ids.length) return out;
  const supabase = await createClient();
  const [{ data: rz }, { data: att }] = await Promise.all([
    supabase.from("contract_hours_days").select("employee_id, date, hours").in("employee_id", ids).gte("date", from).lte("date", to),
    supabase.from("attendance").select("employee_id, day, arrive, leave, break_min").in("employee_id", ids).gte("day", from).lte("day", to),
  ]);
  const get = (id: string) => out.get(id) ?? (out.set(id, {}), out.get(id)!);
  for (const r of (rz ?? []) as { employee_id: string; date: string; hours: number }[]) get(r.employee_id)[String(r.date)] = Number(r.hours);
  for (const a of (att ?? []) as { employee_id: string; day: string; arrive: string; leave: string; break_min: number }[])
    get(a.employee_id)[String(a.day)] = r2(attHours(a));
  return out;
}

const sumWhere = (h: Record<string, number>, f: (d: string) => boolean) => Object.entries(h).reduce((s, [d, v]) => (f(d) ? s + v : s), 0);

export type LimitState = {
  week: { from: string; to: string; h: number; max: number | null };
  month: { h: number; max: number | null };
  year: { h: number; max: number | null };
  avg: { h: number; weeks: number; max: number; from: string; to: string } | null;
};

/** Súčty okolo dňa (týždeň, mesiac, rok, obdobie brigádnika). */
export function state(h: Record<string, number>, day: string, lim: Limits, emp: { date_from: string | null; date_to: string | null }): LimitState {
  const mon = mondayOf(day);
  const sun = addDays(mon, 6);
  const bp = lim.avgWeek ? brigPeriod(emp.date_from, emp.date_to, day) : null;
  return {
    week: { from: mon, to: sun, h: r2(sumWhere(h, (d) => d >= mon && d <= sun)), max: lim.week },
    month: { h: r2(sumWhere(h, (d) => d.slice(0, 7) === day.slice(0, 7))), max: lim.month },
    year: { h: r2(sumWhere(h, (d) => d.slice(0, 4) === day.slice(0, 4))), max: lim.year },
    avg: bp ? { h: r2(sumWhere(h, (d) => d >= bp.from && d <= bp.to)), weeks: bp.weeks, max: lim.avgWeek!, from: bp.from, to: bp.to } : null,
  };
}

const fdm = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;

/** Chyby pri zápise hodín v deň `day` (h už obsahuje nový zápis). */
export function checkLimits(h: Record<string, number>, day: string, lim: Limits, emp: { date_from: string | null; date_to: string | null }): string[] {
  const s = state(h, day, lim, emp);
  const e: string[] = [];
  const law = lim.kind ? ` (${DOH_KIND[lim.kind].toLowerCase()}: ${DOH_LAW[lim.kind]})` : "";
  if (s.week.max != null && s.week.h > s.week.max + 0.001)
    e.push(`V týždni ${fdm(s.week.from)} – ${fdm(s.week.to)} by mal ${nf(s.week.h)} h, najviac je ${nf(s.week.max)} h${lim.kind === "dopc" ? law : ""}.`);
  if (s.month.max != null && s.month.h > s.month.max + 0.001) e.push(`V mesiaci by mal ${nf(s.month.h)} h, limit firmy je ${nf(s.month.max)} h.`);
  if (s.year.max != null && s.year.h > s.year.max + 0.001) e.push(`V roku ${day.slice(0, 4)} by mal ${nf(s.year.h)} h, najviac je ${nf(s.year.max)} h${law}.`);
  if (s.avg && s.avg.h > s.avg.max * s.avg.weeks + 0.001)
    e.push(`Za obdobie dohody by mal ${nf(s.avg.h)} h, priemer 20 h týždenne dovoľuje najviac ${nf(s.avg.max * s.avg.weeks)} h${law}.`);
  return e;
}

/** Upozornenia za obdobie (výkaz, podklad pre mzdy): prekročené týždne, mesiac, rok, priemer. */
export function warnings(h: Record<string, number>, from: string, to: string, lim: Limits, emp: { date_from: string | null; date_to: string | null }): string[] {
  const w: string[] = [];
  const law = lim.kind ? ` – ${DOH_LAW[lim.kind]}` : "";
  if (lim.week != null) {
    for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) {
      const sun = addDays(m, 6);
      const x = sumWhere(h, (d) => d >= m && d <= sun);
      if (x > lim.week + 0.001) w.push(`Týždeň ${fdm(m)} – ${fdm(sun)}: ${nf(x)} h, najviac ${nf(lim.week)} h${lim.kind === "dopc" ? " (dohoda o pracovnej činnosti)" : ""}.`);
    }
  }
  const months = new Set<string>();
  for (let d = from; d <= to; d = addDays(d, 1)) months.add(d.slice(0, 7));
  if (lim.month != null)
    for (const m of months) {
      const x = sumWhere(h, (d) => d.slice(0, 7) === m);
      if (x > lim.month + 0.001) w.push(`Mesiac ${Number(m.slice(5))}/${m.slice(0, 4)}: ${nf(x)} h, limit firmy ${nf(lim.month)} h.`);
    }
  if (lim.year != null) {
    const y = to.slice(0, 4);
    const x = sumWhere(h, (d) => d.slice(0, 4) === y && d <= to);
    if (x > lim.year + 0.001) w.push(`Rok ${y}: ${nf(x)} h, najviac ${nf(lim.year)} h${law}.`);
  }
  const s = state(h, to, lim, emp);
  if (s.avg && s.avg.h > s.avg.max * s.avg.weeks + 0.001) w.push(`Obdobie dohody: ${nf(s.avg.h)} h, priemer 20 h týždenne dovoľuje ${nf(s.avg.max * s.avg.weeks)} h.`);
  return w;
}
