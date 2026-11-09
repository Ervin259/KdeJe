import { monthRange, type Calc, type Entry } from "@/lib/calc";

/** Stĺpce súhrnov (PAYCOLS v prototype) – len zapnuté typy. */
export const PAY_ORDER = ["DOV", "PAR", "OČR", "PV", "NV", "PN", "SCT", "SCZ", "NEV", "NEO", "HO"];
export const payCols = (enabled: string[]) => PAY_ORDER.filter((k) => enabled.includes(k));

export type Vals = Record<string, number>;

/** Súčty dní podľa typu pre zamestnanca v rozsahu dátumov (payRows → v). */
export function valsIn(calc: Calc, entries: Entry[], empId: string, cols: string[], a: string, b: string): Vals {
  const v: Vals = Object.fromEntries(cols.map((k) => [k, 0]));
  for (const x of entries) {
    if (x.employee_id !== empId || v[x.type] === undefined || x.date_to < a || x.date_from > b) continue;
    v[x.type] += calc.amountIn(x, a, b);
  }
  return v;
}

export const monthVals = (calc: Calc, entries: Entry[], empId: string, cols: string[], y: number, m: number) =>
  valsIn(calc, entries, empId, cols, ...monthRange(y, m));

/** Je zamestnanec v období zamestnaný? (isOn v prototype) */
export const isOn = (
  e: { active: boolean; date_from: string | null; date_to: string | null },
  a: string,
  b: string
) => e.active && (!e.date_from || e.date_from <= b) && (!e.date_to || e.date_to >= a);

/** Typ vzťahu: zoznam si firma upravuje sama, DOH sa zobrazuje ako „Dohoda“, ostatné kódom. */
export const ppLabel = (g: string) => (g === "DOH" ? "Dohoda" : g);
/** Poradie typov vzťahu: TPP, DOH, potom abecedne. */
export function ppOrder(codes: Iterable<string | null | undefined>) {
  const rank = (g: string) => (g === "TPP" ? 0 : g === "DOH" ? 1 : 2);
  return [...new Set([...codes].filter((x): x is string => !!x))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "sk"));
}

export const cntTxt = (n: number) => `${n} ${n === 1 ? "zamestnanec" : n >= 2 && n < 5 ? "zamestnanci" : "zamestnancov"}`;
