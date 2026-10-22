import { monthRange, type Calc, type Entry } from "@/lib/calc";

/** Stĺpce súhrnov (PAYCOLS v prototype) – len zapnuté typy. */
export const PAY_ORDER = ["DOV", "PAR", "OČR", "PV", "PN", "SCT", "SCZ", "NV", "NEP", "HO"];
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

export const PP_LABEL: Record<string, string> = { TPP: "TPP", DOH: "Dohoda", ZIV: "Živnosť", SRO: "s.r.o." };
export const PP_ORDER = ["TPP", "DOH", "ZIV", "SRO"];

export const cntTxt = (n: number) => `${n} ${n === 1 ? "zamestnanec" : n >= 2 && n < 5 ? "zamestnanci" : "zamestnancov"}`;
