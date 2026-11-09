/**
 * Pracovný čas zamestnanca: šablóna (work_groups) + vlastné nastavenie v karte (employees.work_override).
 * Spoločné typy, čítanie z formulára, kontrola a slovný popis – pre Nastavenia aj kartu zamestnanca.
 */

export type FlexPeriod = "day" | "week" | "4w";
export type BreakMode = "fixed" | "window";
export type BreakLen = "fixed" | "min";
export type Overtime = "none" | "pay" | "nv";

/** Nastaviteľné hodnoty pracovného času (rovnaké v šablóne aj vo vlastnom nastavení). */
export type WorkTime = {
  flexible: boolean;
  day_start: string | null;
  day_end: string | null;
  daily_hours: number | null;
  core_start: string | null;
  core_end: string | null;
  arrive_from: string | null;
  arrive_to: string | null;
  leave_from: string | null;
  leave_to: string | null;
  flex_period: FlexPeriod;
  break_mode: BreakMode;
  break_start: string | null;
  break_from: string | null;
  break_to: string | null;
  break_min: number;
  break_len: BreakLen;
  overtime: Overtime;
  meal_voucher: boolean;
  sl_rule: "gte" | "gt";
  sl_min_hours: number;
  trip_no_sl_hours: number | null;
};

export const WT_KEYS: (keyof WorkTime)[] = [
  "flexible", "day_start", "day_end", "daily_hours", "core_start", "core_end", "arrive_from", "arrive_to",
  "leave_from", "leave_to", "flex_period", "break_mode", "break_start", "break_from", "break_to", "break_min",
  "break_len", "overtime", "meal_voucher", "sl_rule", "sl_min_hours", "trip_no_sl_hours",
];

export const FLEX_PERIOD: Record<FlexPeriod, string> = { day: "deň", week: "týždeň", "4w": "4 týždne" };
export const OVERTIME: Record<Overtime, string> = { none: "nepovolené", pay: "povolené – preplatiť", nv: "povolené – náhradné voľno" };

export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const nf = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Šablóna + vlastné nastavenie (vlastné hodnoty majú prednosť). */
export function effective<T extends WorkTime>(g: T, override: Partial<WorkTime> | null | undefined): T {
  if (!override || !Object.keys(override).length) return g;
  const out = { ...g } as T;
  for (const k of WT_KEYS) if (k in override && override[k] !== undefined) (out as Record<string, unknown>)[k] = override[k];
  return out;
}

/** Denný fond v hodinách. */
export function dailyHours(w: WorkTime): number {
  if (w.daily_hours != null && Number(w.daily_hours) > 0) return Number(w.daily_hours);
  if (!w.flexible && w.day_start && w.day_end) return Math.max(0, (toMin(w.day_end) - toMin(w.day_start) - Number(w.break_min || 0)) / 60);
  return 8;
}

/** Čítanie hodnôt z formulára (prefix „wt_“ v karte zamestnanca, bez prefixu v šablóne). */
export function readWorkTime(f: FormData, p = ""): WorkTime {
  const s = (k: string) => String(f.get(p + k) ?? "").trim();
  const t = (k: string) => s(k) || null;
  const n = (k: string, d: number | null) => {
    const v = s(k).replace(",", ".");
    return v === "" || isNaN(Number(v)) ? d : Number(v);
  };
  const flexible = s("flexible") === "1";
  const breakMode: BreakMode = s("break_mode") === "window" ? "window" : "fixed";
  return {
    flexible,
    day_start: flexible ? null : t("day_start"),
    day_end: flexible ? null : t("day_end"),
    daily_hours: n("daily_hours", null),
    core_start: flexible ? t("core_start") : null,
    core_end: flexible ? t("core_end") : null,
    arrive_from: flexible ? t("arrive_from") : null,
    arrive_to: flexible ? t("arrive_to") : null,
    leave_from: flexible ? t("leave_from") : null,
    leave_to: flexible ? t("leave_to") : null,
    flex_period: (["day", "week", "4w"].includes(s("flex_period")) ? s("flex_period") : "day") as FlexPeriod,
    break_mode: breakMode,
    break_start: breakMode === "fixed" ? t("break_start") : null,
    break_from: breakMode === "window" ? t("break_from") : null,
    break_to: breakMode === "window" ? t("break_to") : null,
    break_min: Math.max(0, n("break_min", 30) ?? 30),
    break_len: s("break_len") === "min" ? "min" : "fixed",
    overtime: (["none", "pay", "nv"].includes(s("overtime")) ? s("overtime") : "none") as Overtime,
    meal_voucher: f.get(p + "meal_voucher") === "on",
    sl_rule: s("sl_rule") === "gt" ? "gt" : "gte",
    sl_min_hours: n("sl_min_hours", 4) ?? 4,
    trip_no_sl_hours: n("trip_no_sl_hours", 5),
  };
}

/** Kontrola podľa Zákonníka práce a zdravého rozumu; vráti zoznam chýb. */
export function checkWorkTime(w: WorkTime): string[] {
  const e: string[] = [];
  const lt = (a: string | null, b: string | null) => !!a && !!b && toMin(a) < toMin(b);
  if (!w.flexible) {
    if (!w.day_start || !w.day_end || !lt(w.day_start, w.day_end)) e.push("Koniec pracovného času musí byť neskôr ako začiatok.");
    else if (w.break_mode === "fixed" && w.break_min && w.break_start && (toMin(w.break_start) <= toMin(w.day_start) || toMin(w.break_start) + w.break_min >= toMin(w.day_end)))
      e.push("Prestávka musí byť v rámci pracovného času a nie na jeho začiatku ani konci.");
  } else {
    if (!w.arrive_from || !w.arrive_to || !lt(w.arrive_from, w.arrive_to)) e.push("Vyplňte voliteľný príchod od – do.");
    if (!w.leave_from || !w.leave_to || !lt(w.leave_from, w.leave_to)) e.push("Vyplňte voliteľný odchod od – do.");
    if (w.core_start || w.core_end) {
      if (!lt(w.core_start, w.core_end)) e.push("Základný čas: koniec musí byť neskôr ako začiatok.");
      else if (lt(w.core_start, w.arrive_to) || lt(w.leave_from, w.core_end)) e.push("Základný čas musí začínať najskôr po poslednom príchode a končiť najneskôr pred prvým odchodom.");
    }
    if (!w.daily_hours || w.daily_hours <= 0) e.push("Pri pružnom čase vyplňte denný fond hodín.");
  }
  if (w.daily_hours != null && (w.daily_hours < 0.5 || w.daily_hours > 12)) e.push("Denný fond musí byť od 0,5 do 12 hodín.");
  if (w.break_mode === "window" && (!w.break_from || !w.break_to || !lt(w.break_from, w.break_to))) e.push("Vyplňte okno, v ktorom si môže vziať prestávku (od – do).");
  if (w.break_mode === "window" && w.break_from && w.break_to && toMin(w.break_to) - toMin(w.break_from) < w.break_min)
    e.push("Okno na prestávku je kratšie ako samotná prestávka.");
  if (dailyHours(w) > 6 && w.break_min < 30) e.push("Pri zmene dlhšej ako 6 hodín musí mať prestávka aspoň 30 minút (§ 91 ZP).");
  return e;
}

/** Krátky popis do zoznamov („08:30–17:00 · SL“). */
export function shortInfo(w: WorkTime): string {
  const t = w.flexible ? `pružný ${hm(w.arrive_from)}–${hm(w.leave_to)}` : `${hm(w.day_start)}–${hm(w.day_end)}`;
  return `${t} · ${w.meal_voucher ? "SL" : "bez SL"}`;
}

/** Podrobný popis pre kartu zamestnanca („Ako aplikácia počíta“). */
export function longInfo(w: WorkTime): string[] {
  const H = dailyHours(w);
  const out: string[] = [];
  out.push(
    w.flexible
      ? `pružný – príchod ${hm(w.arrive_from)}–${hm(w.arrive_to)}, odchod ${hm(w.leave_from)}–${hm(w.leave_to)}${
          w.core_start && w.core_end ? `, základný čas ${hm(w.core_start)}–${hm(w.core_end)}` : ""
        }, fond ${nf(H)} h denne, pružné obdobie ${FLEX_PERIOD[w.flex_period]}`
      : `pevný ${hm(w.day_start)}–${hm(w.day_end)} = ${nf(H)} h denne`
  );
  out.push(
    w.break_min
      ? `prestávka ${w.break_len === "min" ? "aspoň " : ""}${w.break_min} min ${
          w.break_mode === "window" ? `kedykoľvek ${hm(w.break_from)}–${hm(w.break_to)}` : `od ${hm(w.break_start)}`
        }${w.break_len === "min" ? " (dlhšiu si nadrobí)" : ""}`
      : "bez prestávky"
  );
  out.push(`nadčasy ${OVERTIME[w.overtime]}`);
  return out;
}

/** Hodnoty pre vlastné nastavenie: uložia sa len tie, ktoré sa líšia od šablóny. */
export function diffFrom(tpl: WorkTime, w: WorkTime): Partial<WorkTime> {
  const out: Partial<WorkTime> = {};
  for (const k of WT_KEYS) {
    const a = tpl[k] ?? null;
    const b = w[k] ?? null;
    const norm = (v: unknown) => (typeof v === "string" && /^\d\d:\d\d(:\d\d)?$/.test(v) ? v.slice(0, 5) : v === null ? null : String(v));
    if (norm(a) !== norm(b)) (out as Record<string, unknown>)[k] = b;
  }
  return out;
}
