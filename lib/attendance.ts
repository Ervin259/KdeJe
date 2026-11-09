/**
 * Dochádzka po dňoch: nastavený pracovný čas → úprava dochádzky (ak je) → neprítomnosti z kalendára.
 * Ukladajú sa len úpravy (tabuľka attendance), všetko ostatné sa dopočíta.
 */
import { KIND, type Calc, type Entry } from "./calc";
import { dailyHours, hm, type WorkTime } from "./worktime";

export type Att = {
  id?: string;
  employee_id: string;
  day: string;
  arrive: string;
  leave: string;
  break_start: string | null;
  break_min: number;
  note?: string | null;
};

export type DayInfo = {
  day: string;
  /** pracovný deň (nie víkend ani sviatok) */
  work: boolean;
  holiday: boolean;
  /** celý deň neprítomný (dovolenka, PN…) */
  absentFull: boolean;
  /** hodiny neprítomnosti v tento deň (čiastočná neprítomnosť) */
  absHours: number;
  /** kódy z kalendára */
  codes: string[];
  /** fond dňa po odpočítaní neprítomnosti */
  fond: number;
  arrive: string | null;
  leave: string | null;
  break_start: string | null;
  break_min: number;
  /** odpracované hodiny */
  worked: number;
  /** rozdiel voči fondu (+ nadčas / saldo, − chýba) */
  diff: number;
  /** nočná práca 22:00 – 6:00 (h) */
  night: number;
  /** je to úprava (nie predvolené časy) */
  edited: boolean;
  note: string | null;
};

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (n: number) => {
  const x = ((Math.round(n) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
/** 1,5 → „1:30“, −0,25 → „−0:15“ */
export const hmm = (h: number) => {
  const m = Math.round(Math.abs(h) * 60);
  return `${h < 0 ? "−" : ""}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** Môže zamestnanec niečo meniť? (inak nie je čo upravovať) */
export function canEditAttendance(w: WorkTime) {
  return w.flexible || w.break_mode === "window" || w.break_len === "min" || w.overtime !== "none";
}
/** Čo presne môže meniť. */
export function editableParts(w: WorkTime) {
  return {
    times: w.flexible || w.overtime !== "none",
    breakStart: w.break_mode === "window",
    breakLen: w.break_len === "min",
  };
}

/** Predvolené časy dňa podľa nastavenia. */
export function defaults(w: WorkTime) {
  const H = dailyHours(w);
  const arrive = hm(w.flexible ? w.day_start ?? w.arrive_from ?? "08:00" : w.day_start ?? "08:00") || "08:00";
  const bmin = Number(w.break_min) || 0;
  const leave = !w.flexible && w.day_end ? hm(w.day_end) : fromMin(toMin(arrive) + H * 60 + bmin);
  const bstart = bmin ? hm(w.break_start) || fromMin(toMin(arrive) + Math.round((toMin(leave) - toMin(arrive)) / 2)) : null;
  return { arrive, leave, break_start: bstart, break_min: bmin, H };
}

const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Výpočet jedného dňa. */
export function computeDay(calc: Calc, empId: string, day: string, entries: Entry[], att: Att | null): DayInfo {
  const w = calc.group(empId);
  const work = calc.isWork(day);
  const holiday = calc.isHol(day);
  const own = entries.filter((x) => x.employee_id === empId && x.date_from <= day && x.date_to >= day);
  const codes = [...new Set(own.map((x) => x.type))];
  const abs = own.filter((x) => KIND[x.type] === "abs");
  const absentFull = work && abs.some((x) => x.part === "full");
  const absHours = work && !absentFull ? abs.reduce((s, x) => s + calc.hoursOf(x), 0) : 0;
  const d = defaults(w);
  const fond = work && !absentFull ? Math.max(0, d.H - absHours) : 0;

  let arrive: string | null = null;
  let leave: string | null = null;
  let bs: string | null = null;
  let bm = 0;
  if (att) {
    arrive = hm(att.arrive);
    leave = hm(att.leave);
    bs = att.break_start ? hm(att.break_start) : null;
    bm = att.break_min;
  } else if (work && !absentFull) {
    arrive = d.arrive;
    leave = d.leave;
    bs = d.break_start;
    bm = d.break_min;
  }
  const worked = arrive && leave ? Math.max(0, (toMin(leave) - toMin(arrive) - bm) / 60) : 0;
  // pri predvolenom dni s čiastočnou neprítomnosťou je odpracovaný len zvyšok fondu
  const workedEff = att ? worked : Math.min(worked, fond);
  let night = 0;
  if (arrive && leave) {
    const a = toMin(arrive);
    const l = toMin(leave);
    night = (overlap(a, l, 0, 360) + overlap(a, l, 1320, 1440)) / 60;
  }
  return {
    day,
    work,
    holiday,
    absentFull,
    absHours,
    codes,
    fond,
    arrive,
    leave,
    break_start: bs,
    break_min: bm,
    worked: workedEff,
    diff: workedEff - fond,
    night,
    edited: !!att,
    note: att?.note ?? null,
  };
}

/** Kontrola úpravy dochádzky podľa nastavenia zamestnanca a Zákonníka práce. */
export function checkAttendance(w: WorkTime, a: Att, info: Pick<DayInfo, "work" | "absentFull" | "fond" | "absHours">): string[] {
  const e: string[] = [];
  if (!a.arrive || !a.leave) return ["Vyplňte príchod aj odchod."];
  const A = toMin(a.arrive);
  const L = toMin(a.leave);
  if (L <= A) return ["Odchod musí byť neskôr ako príchod."];
  const p = editableParts(w);
  const d = defaults(w);
  const worked = (L - A - a.break_min) / 60;
  const overtime = w.overtime !== "none";

  if (!info.work && !overtime) e.push("V tento deň nemá pracovný čas (víkend alebo sviatok) a nadčasy nemá povolené.");
  if (info.absentFull) e.push("V tento deň má zapísanú celodennú neprítomnosť – najprv ju upravte.");

  // príchod a odchod
  if (!p.times && (a.arrive !== d.arrive || a.leave !== d.leave)) e.push(`Pracovný čas je pevný ${d.arrive}–${d.leave}; meniť sa dá len prestávka.`);
  if (w.flexible && info.absHours === 0) {
    if (w.arrive_from && w.arrive_to && (A < toMin(w.arrive_from) || A > toMin(w.arrive_to)))
      e.push(`Príchod je možný od ${hm(w.arrive_from)} do ${hm(w.arrive_to)}.`);
    if (w.leave_from && L < toMin(w.leave_from)) e.push(`Odchod je možný najskôr o ${hm(w.leave_from)}.`);
    if (w.leave_to && L > toMin(w.leave_to) && !overtime) e.push(`Odchod je možný najneskôr o ${hm(w.leave_to)}.`);
    if (w.core_start && A > toMin(w.core_start)) e.push(`V základnom čase ${hm(w.core_start)}–${hm(w.core_end)} musí byť na pracovisku – príchod najneskôr o ${hm(w.core_start)}.`);
    if (w.core_end && L < toMin(w.core_end)) e.push(`V základnom čase ${hm(w.core_start)}–${hm(w.core_end)} musí byť na pracovisku – odchod najskôr o ${hm(w.core_end)}.`);
  }

  // prestávka
  if (worked > 6 && a.break_min < 30) e.push("Pri práci dlhšej ako 6 hodín je prestávka aspoň 30 minút (§ 91 ZP).");
  if (a.break_min) {
    if (!a.break_start) e.push("Vyplňte začiatok prestávky.");
    else {
      const B = toMin(a.break_start);
      if (B <= A || B + a.break_min >= L) e.push("Prestávka nemôže byť na začiatku ani na konci pracovného času.");
      if (!p.breakStart && d.break_start && a.break_start !== d.break_start) e.push(`Prestávka je pevne o ${d.break_start}.`);
      if (p.breakStart && w.break_from && w.break_to && (B < toMin(w.break_from) || B + a.break_min > toMin(w.break_to)))
        e.push(`Prestávku si môže vziať v čase ${hm(w.break_from)}–${hm(w.break_to)}.`);
    }
  }
  if (!p.breakLen && a.break_min !== d.break_min && worked > 0) e.push(`Prestávka má presne ${d.break_min} min.`);
  if (p.breakLen && a.break_min < d.break_min) e.push(`Prestávka má aspoň ${d.break_min} min.`);

  // dĺžka a fond
  if (!overtime && worked > 12) e.push("Odpracovať sa dá najviac 12 hodín denne.");
  const daily = !w.flexible || w.flex_period === "day";
  const fond = info.fond;
  if (info.work && daily) {
    if (!overtime && Math.abs(worked - fond) > 1 / 120)
      e.push(
        worked > fond
          ? `Nadčasy nemá povolené – odpracovať treba presne ${hmm(fond)} h (teraz ${hmm(worked)} h).`
          : `Odpracovať treba ${hmm(fond)} h (teraz ${hmm(worked)} h). Ak ste odišli skôr, zapíšte neprítomnosť.`
      );
    if (overtime && worked < fond - 1 / 120) e.push(`Odpracovať treba aspoň ${hmm(fond)} h (teraz ${hmm(worked)} h). Ak ste odišli skôr, zapíšte neprítomnosť.`);
  }
  return e;
}
