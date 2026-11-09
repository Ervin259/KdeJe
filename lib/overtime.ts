/**
 * Nadčasy a náhradné voľno (§ 121 ZP).
 * Nadčas za mesiac sa podľa rozhodnutia (overtime_decisions) alebo predvolene podľa karty
 * preplatí, alebo ide do náhradného voľna. Náhradné voľno (typ NV) sa čerpá od najstaršieho;
 * čo sa nevyčerpá do konca 4. mesiaca po mesiaci nadčasu, prepadá na preplatenie.
 */
import { createClient } from "@/lib/supabase/server";
import { loadEntries } from "@/lib/loaders";
import { monthRange, type Calc, type Emp } from "@/lib/calc";
import { buildVykaz } from "@/lib/vykaz";
import type { Att } from "@/lib/attendance";

/** Prvý mesiac evidencie dochádzky v aplikácii – skôr sa nadčasy nerátajú. */
export const OT_START = "2026-11";
/** Náhradné voľno treba poskytnúť do 4 mesiacov po vykonaní nadčasu. */
export const NV_MONTHS = 4;
/** kód náhradného voľna (§ 121 ZP) */
export const NAV = "NV";

export type Decision = { employee_id: string; month: string; pay_h: number; nv_h: number; decided_at: string | null; note: string | null };

export type OTMonth = {
  /** YYYY-MM */
  month: string;
  /** nadčas vypočítaný z dochádzky */
  ot: number;
  /** preplatiť a do NV podľa rozhodnutia alebo karty */
  pay: number;
  nv: number;
  decided: Decision | null;
  /** čerpané náhradné voľno (NV) v mesiaci */
  used: number;
  /** prepadnuté NV (nevyčerpané do 4 mesiacov) – treba preplatiť v tomto mesiaci */
  expired: number;
  /** zostatok NV na začiatku a na konci mesiaca (záporný = čerpané vopred) */
  start: number;
  balance: number;
  /** nevyčerpané NV a dokedy ho treba vyčerpať (stav na konci mesiaca) */
  open: { month: string; h: number; deadline: string }[];
};

export const addMonths = (m: string, n: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const monthsBetween = (a: string, b: string) => {
  const out: string[] = [];
  for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m);
  return out;
};
const lastDay = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return monthRange(y, mm)[1];
};
/** Do kedy treba vyčerpať NV z nadčasu v mesiaci m. */
export const nvDeadline = (m: string) => lastDay(addMonths(m, NV_MONTHS));

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rozdelenie nadčasu: rozhodnutie, inak podľa karty (pay / nv). */
export function split(ot: number, mode: "none" | "pay" | "nv", d: Decision | null) {
  if (d) return { pay: Number(d.pay_h), nv: Number(d.nv_h) };
  if (mode === "nv") return { pay: 0, nv: ot };
  if (mode === "pay") return { pay: ot, nv: 0 };
  return { pay: 0, nv: 0 };
}

/** Priebeh náhradného voľna po mesiacoch (čerpanie od najstaršieho, prepadnutie po 4 mesiacoch). */
export function ledger(rows: { month: string; ot: number; pay: number; nv: number; decided: Decision | null; used: number }[]): OTMonth[] {
  let buckets: { month: string; h: number }[] = [];
  let debt = 0; // čerpané vopred
  const out: OTMonth[] = [];
  for (const r of rows) {
    const start = r2(buckets.reduce((s, b) => s + b.h, 0) - debt);
    let nv = r.nv;
    if (debt > 0 && nv > 0) {
      const x = Math.min(debt, nv);
      debt -= x;
      nv -= x;
    }
    if (nv > 0.001) buckets.push({ month: r.month, h: nv });
    let use = r.used;
    for (const b of buckets) {
      if (use <= 0) break;
      const x = Math.min(b.h, use);
      b.h -= x;
      use -= x;
    }
    debt += use;
    buckets = buckets.filter((b) => b.h > 0.001);
    let expired = 0;
    for (const b of buckets) if (addMonths(b.month, NV_MONTHS) <= r.month) expired += b.h;
    buckets = buckets.filter((b) => addMonths(b.month, NV_MONTHS) > r.month);
    out.push({
      ...r,
      expired: r2(expired),
      start,
      balance: r2(buckets.reduce((s, b) => s + b.h, 0) - debt),
      open: buckets.map((b) => ({ month: b.month, h: r2(b.h), deadline: nvDeadline(b.month) })),
    });
  }
  return out;
}

/** Nadčasy a NV pre zamestnancov až po mesiac `upto` (YYYY-MM); kľúč = id zamestnanca. */
export async function loadOvertime(calc: Calc, emps: Emp[], upto: string): Promise<Map<string, OTMonth[]>> {
  const res = new Map<string, OTMonth[]>();
  const list = emps.filter((e) => e.contract_type !== "DOH");
  if (!list.length || upto < OT_START) return res;
  // stačí rok dozadu: staršie NV už prepadlo
  const first = [OT_START, addMonths(upto, -12)].sort()[1];
  const months = monthsBetween(first, upto);
  const from = `${first}-01`;
  const to = lastDay(upto);
  const ids = list.map((e) => e.id);
  const supabase = await createClient();
  const [entries, { data: atts }, { data: dec }] = await Promise.all([
    loadEntries(from, to),
    supabase.from("attendance").select("employee_id, day, arrive, leave, break_start, break_min, note").in("employee_id", ids).gte("day", from).lte("day", to),
    supabase.from("overtime_decisions").select("employee_id, month, pay_h, nv_h, decided_at, note").in("employee_id", ids).gte("month", from).lte("month", to),
  ]);
  const att = ((atts ?? []) as Att[]).map((a) => ({ ...a, arrive: a.arrive.slice(0, 5), leave: a.leave.slice(0, 5), break_start: a.break_start?.slice(0, 5) ?? null }));
  const decs = ((dec ?? []) as Decision[]).map((d) => ({ ...d, month: String(d.month).slice(0, 7) }));

  for (const e of list) {
    const w = calc.group(e.id);
    const mine = decs.filter((d) => d.employee_id === e.id);
    const usesNav = entries.some((x) => x.employee_id === e.id && x.type === NAV);
    if (w.overtime === "none" && !mine.length && !usesNav) continue;
    const rows = months
      .filter((m) => (!e.date_from || e.date_from <= lastDay(m)) && (!e.date_to || e.date_to >= `${m}-01`))
      .map((m) => {
        const v = buildVykaz(calc, e, `${m}-01`, lastDay(m), entries, att, null);
        const ot = r2(v.sum.overtime);
        const d = mine.find((x) => x.month === m) ?? null;
        return { month: m, ot, ...split(ot, w.overtime, d), decided: d, used: r2(v.sum.absBy[NAV] ?? 0) };
      });
    res.set(e.id, ledger(rows));
  }
  return res;
}

/** Hodiny z textu „8:30“, „8,5“ alebo „8.5“. */
export function parseHours(s: string): number | null {
  const t = s.trim();
  if (!t) return 0;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const n = Number(t.replace(",", "."));
  return isNaN(n) || n < 0 ? null : n;
}
