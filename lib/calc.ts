/**
 * Výpočty prenesené z prototypu kdeje.html (span, hoursOf, frac, amount, bal, slDay …).
 * Všetko pracuje s dátumami ako reťazcami YYYY-MM-DD a časmi HH:MM.
 */

export type Part = "full" | "am" | "pm" | "hrs";

export type Entry = {
  id: string;
  employee_id: string;
  type: string;
  date_from: string;
  date_to: string;
  part: Part;
  time_from: string | null;
  time_to: string | null;
  note?: string | null;
  substitute_id?: string | null;
};

export type WorkGroup = {
  id: string;
  name: string;
  is_default: boolean;
  flexible: boolean;
  day_start: string | null;
  day_end: string | null;
  break_start: string | null;
  break_min: number;
  meal_voucher: boolean;
  sl_rule: "gte" | "gt";
  sl_min_hours: number;
  trip_no_sl_hours: number | null;
};

export type AbsenceKind = "abs" | "sc" | "work";

export type Emp = {
  id: string;
  name: string;
  contract_type: "TPP" | "DOH" | "ZIV" | "SRO";
  work_group_id: string | null;
  date_from: string | null;
  date_to: string | null;
  active: boolean;
};

export type Sched = { s0: number; L: number; b0: number; b1: number; H: number; start: string; end: string };

export const KIND: Record<string, AbsenceKind> = {
  DOV: "abs", PAR: "abs", "OČR": "abs", PV: "abs", PN: "abs", NV: "abs", NEP: "abs",
  SCT: "sc", SCZ: "sc", HO: "work",
};

// ---------- dátumy ----------
const P = (s: string) => new Date(s + "T00:00:00Z");
const I = (d: Date) => d.toISOString().slice(0, 10);
export const pad = (n: number) => String(n).padStart(2, "0");
export const plus = (s: string, n: number) => I(new Date(P(s).getTime() + n * 864e5));
export const dow = (s: string) => P(s).getUTCDay();
export const isWeekend = (s: string) => {
  const d = dow(s);
  return d === 0 || d === 6;
};
export function eachDay(a: string, b: string, fn: (s: string) => void) {
  for (let s = a; s <= b; s = plus(s, 1)) fn(s);
}
export const monthDays = (y: number, m: number /* 1–12 */) => {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};
export const monthRange = (y: number, m: number) => {
  const d = monthDays(y, m);
  return [d[0], d[d.length - 1]] as const;
};
export const toMin = (t: string) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Formát čísla ako v prototype: 1,5 · 0,25 */
export const nf = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
export const dayWord = (n: number) => {
  n = Math.abs(Math.round(n * 1000) / 1000);
  return !Number.isInteger(n) ? "dňa" : n === 1 ? "deň" : n >= 2 && n < 5 ? "dni" : "dní";
};
export const fd = (s: string) => {
  const d = P(s);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
};
export const WD = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
export const fdw = (s: string) => `${WD[dow(s)]} ${fd(s)}`;
export const MN = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
export const MNC = MN.map((m) => m[0].toUpperCase() + m.slice(1));

export const lastName = (n: string) => n.trim().split(/\s+/).slice(-1)[0];
export const byLastName = <T extends { name: string }>(a: T, b: T) =>
  lastName(a.name).localeCompare(lastName(b.name), "sk") || a.name.localeCompare(b.name, "sk");

// ---------- kontext firmy ----------
export class Calc {
  holidays: Set<string>;
  groups: Map<string, WorkGroup>;
  defGroup: WorkGroup;
  emps: Map<string, Emp>;
  today: string;

  constructor(opts: { holidays: string[]; groups: WorkGroup[]; emps: Emp[]; today: string }) {
    this.holidays = new Set(opts.holidays);
    this.groups = new Map(opts.groups.map((g) => [g.id, g]));
    this.defGroup = opts.groups.find((g) => g.is_default) ?? opts.groups[0];
    this.emps = new Map(opts.emps.map((e) => [e.id, e]));
    this.today = opts.today;
  }

  isHol = (s: string) => this.holidays.has(s);
  isWork = (s: string) => !isWeekend(s) && !this.holidays.has(s);
  work(a: string, b: string) {
    let n = 0;
    eachDay(a, b, (s) => {
      if (this.isWork(s)) n++;
    });
    return n;
  }

  group(empId: string): WorkGroup {
    const e = this.emps.get(empId);
    return (e?.work_group_id && this.groups.get(e.work_group_id)) || this.defGroup;
  }

  /** Pracovná doba zamestnanca; flexibilná skupina počíta so štandardným dňom firmy. */
  sched(empId: string): Sched {
    const g = this.group(empId);
    const w = g.flexible || !g.day_start || !g.day_end ? this.defGroup : g;
    const s0 = toMin(w.day_start ?? "08:30");
    const L = (toMin(w.day_end ?? "17:00") - s0) / 60;
    const b0 = ((w.break_start ? toMin(w.break_start) : s0 + (L * 60) / 2) - s0) / 60;
    const bm = (Number(w.break_min) || 0) / 60;
    return { s0, L, b0, b1: b0 + bm, H: Math.max(1, L - bm), start: hhmm(w.day_start), end: hhmm(w.day_end) };
  }

  span(x: Pick<Entry, "employee_id" | "part" | "time_from" | "time_to">): [number, number] {
    const sc = this.sched(x.employee_id);
    if (x.part === "full") return [0, sc.L];
    if (x.part === "am") return [0, sc.b0];
    if (x.part === "pm") return [sc.b0, sc.L];
    return [(toMin(x.time_from!) - sc.s0) / 60, (toMin(x.time_to!) - sc.s0) / 60];
  }
  /** odpracované hodiny od začiatku dňa po čas t (bez obeda) */
  wpos(t: number, sc: Sched) {
    return t - Math.max(0, Math.min(t, sc.b1) - sc.b0);
  }
  hoursOf(x: Pick<Entry, "employee_id" | "part" | "time_from" | "time_to">) {
    const sc = this.sched(x.employee_id);
    const [a, b] = this.span(x);
    return Math.max(0, this.wpos(b, sc) - this.wpos(a, sc));
  }
  frac(x: Pick<Entry, "employee_id" | "part" | "time_from" | "time_to">) {
    return this.hoursOf(x) / this.sched(x.employee_id).H;
  }
  amount(x: Entry) {
    return this.work(x.date_from, x.date_to) * this.frac(x);
  }
  amountWhere(x: Entry, pred: (s: string) => boolean) {
    let n = 0;
    eachDay(x.date_from, x.date_to, (s) => {
      if (this.isWork(s) && pred(s)) n++;
    });
    return n * this.frac(x);
  }
  /** Súčet dní daného typu v rozsahu dátumov (len pracovné dni). */
  amountIn(x: Entry, a: string, b: string) {
    return this.amountWhere(x, (s) => s >= a && s <= b);
  }

  /** Stravný lístok za deň (TPP a pod.; dohodári sa riešia cez rozpis hodín). */
  slDay(empId: string, d: string, dayEntries: Entry[]): { ok: boolean; worked: number; reason?: string } {
    const g = this.group(empId);
    if (!g.meal_voucher) return { ok: false, worked: 0, reason: "bez nároku na SL" };
    const H = this.sched(empId).H;
    let abs = 0;
    let sc = 0;
    const names: string[] = [];
    for (const x of dayEntries) {
      const h = this.hoursOf(x);
      const k = KIND[x.type] ?? "abs";
      if (k === "abs") {
        abs += h;
        names.push(x.type);
      } else if (k === "sc") sc += h;
    }
    const worked = Math.max(0, H - abs);
    if (g.trip_no_sl_hours != null && sc >= Number(g.trip_no_sl_hours))
      return { ok: false, worked, reason: `služobná cesta ${nf(sc)} h – stravné ide cez cestovné náhrady` };
    const min = Number(g.sl_min_hours);
    const ok = g.sl_rule === "gt" ? worked > min : worked >= min;
    if (!ok)
      return {
        ok: false,
        worked,
        reason: abs >= H ? `${names.join(" + ")} celý deň` : `odpracované len ${nf(worked)} h (${names.join(" + ")})`,
      };
    return { ok: true, worked };
  }

  /** Počet SL za mesiac. */
  slMonth(empId: string, y: number, m: number, entries: Entry[]) {
    const days = monthDays(y, m).filter(this.isWork);
    if (!this.group(empId).meal_voucher) return { n: 0, wd: days.length, none: true };
    const e = this.emps.get(empId);
    let n = 0;
    for (const d of days) {
      if (e && ((e.date_from && d < e.date_from) || (e.date_to && d > e.date_to))) continue;
      const xs = entries.filter((x) => x.employee_id === empId && x.date_from <= d && x.date_to >= d);
      if (this.slDay(empId, d, xs).ok) n++;
    }
    return { n, wd: days.length, none: false };
  }
}

// ---------- zostatky dovolenky ----------
export type VacYear = { entitlement: number; carry_in: number };

export function balance(c: Calc, empId: string, entries: Entry[], vac: VacYear | undefined, carryMax: number) {
  let taken = 0, planned = 0, lek = 0, lekPlan = 0, pn = 0, ocr = 0, ho = 0;
  for (const x of entries) {
    if (x.employee_id !== empId) continue;
    if (x.type === "DOV") {
      taken += c.amountWhere(x, (s) => s <= c.today);
      planned += c.amountWhere(x, (s) => s > c.today);
    } else if (x.type === "PAR") {
      lek += c.amountWhere(x, (s) => s <= c.today);
      lekPlan += c.amountWhere(x, (s) => s > c.today);
    } else if (x.type === "PN") pn += c.amount(x);
    else if (x.type === "OČR") ocr += c.amount(x);
    else if (x.type === "HO") ho += c.amount(x);
  }
  const ent = Number(vac?.entitlement ?? 0);
  const carry = Number(vac?.carry_in ?? 0);
  const total = ent + carry;
  const left = total - taken - planned;
  return { ent, carry, total, taken, planned, left, over: Math.max(0, left - carryMax), lek, lekPlan, lekAll: lek + lekPlan, pn, ocr, ho };
}

/** Typ → CSS trieda prototypu (OČR → t-OCR). */
export const typeClass = (code: string) => "t-" + code.normalize("NFD").replace(/[̀-ͯ]/g, "");

export const TYPE_NAME: Record<string, string> = {
  DOV: "Dovolenka", PAR: "Lekár (paragraf)", "OČR": "Opatrovanie člena rodiny", PV: "Platené voľno",
  PN: "Práceneschopnosť", SCT: "Služobná cesta tuzemská", SCZ: "Služobná cesta zahraničná",
  HO: "Home office", NV: "Náhradné voľno", NEP: "Neplatené voľno", MIMO: "Neprítomný/á",
};

export const partTxt = (x: Pick<Entry, "part" | "time_from" | "time_to">) =>
  x.part === "hrs" ? `${hhmm(x.time_from)}–${hhmm(x.time_to)}` : x.part === "am" ? "dopoludnie" : x.part === "pm" ? "popoludnie" : "celý deň";
