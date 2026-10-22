import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { Calc, monthRange, plus, type Emp, type Entry, type WorkGroup } from "@/lib/calc";
import { todayIso } from "@/lib/data";

export type Settings = {
  hide_health: boolean;
  carry_mode: "all" | "max";
  carry_max: number;
  lek_limit: number;
  remind_from: number;
};

export type EmpFull = Emp & {
  email: string | null;
  user_id: string | null;
  firm: string | null;
  rights_group_id: string | null;
  show_in_calendar: boolean;
  sees_calendar: boolean;
  in_stats: boolean;
  in_payroll: boolean;
  role: "admin" | "employee";
};

/** Spoločné dáta firmy (raz za request). */
export const loadCompany = cache(async () => {
  const supabase = await createClient();
  const [g, h, e, s, r, ms] = await Promise.all([
    supabase.from("work_groups").select("*").order("sort"),
    supabase.from("holidays").select("date, name").order("date"),
    supabase
      .from("employees")
      .select(
        "id, user_id, name, email, contract_type, firm, work_group_id, rights_group_id, date_from, date_to, active, show_in_calendar, sees_calendar, in_stats, in_payroll, role"
      ),
    supabase.from("settings").select("*").maybeSingle(),
    supabase.from("rights_groups").select("*").order("sort"),
    supabase.from("month_status").select("year, month, closed_manually, reopened"),
  ]);
  const rights = (r.data ?? []) as RightsGroup[];
  const monthStatus = (ms.data ?? []) as MonthStatusRow[];
  const lockDays = rights.find((x) => x.is_default)?.lock_days ?? 3;
  const groups = (g.data ?? []) as WorkGroup[];
  const holidays = (h.data ?? []) as { date: string; name: string }[];
  const emps = (e.data ?? []) as EmpFull[];
  const settings: Settings = {
    hide_health: s.data?.hide_health ?? false,
    carry_mode: s.data?.carry_mode ?? "all",
    carry_max: Number(s.data?.carry_max ?? 10),
    lek_limit: Number(s.data?.lek_limit ?? 7),
    remind_from: Number(s.data?.remind_from ?? 10),
  };
  const calc = new Calc({ holidays: holidays.map((x) => x.date), groups, emps, today: todayIso() });
  const today = todayIso();
  /** Stav mesiaca pre firmu (podľa predvolenej skupiny práv) – ako mstatus() v prototype. */
  const mstatus = (y: number, m: number): MonthState => {
    const last = monthRange(y, m)[1];
    const lock = plus(last, 1 + lockDays); // deň, od ktorého je zamknutý
    const row = monthStatus.find((x) => x.year === y && x.month === m);
    if (row?.reopened) return { s: "open", reopened: true, lock, last };
    if (row?.closed_manually) return { s: "closed", manual: true, lock, last };
    if (today >= lock) return { s: "closed", lock, last };
    if (today > last) return { s: "grace", lock, last };
    return { s: "open", lock, last };
  };
  return { groups, holidays, emps, settings, calc, rights, monthStatus, mstatus, lockDays };
});

export type RightsGroup = {
  id: string;
  name: string;
  is_default: boolean;
  requires_approval: boolean;
  lock_days: number;
  can_edit_until_lock: boolean;
  edit_days_after_lock: number;
  sort: number;
};
export type MonthStatusRow = { year: number; month: number; closed_manually: boolean; reopened: boolean };
export type MonthState = { s: "open" | "grace" | "closed"; reopened?: boolean; manual?: boolean; lock: string; last: string };

/** Všetky záznamy, ktoré prihlásený smie čítať priamo (admin: všetci, zamestnanec: vlastné). */
export async function loadEntries(from: string, to: string): Promise<Entry[]> {
  const supabase = await createClient();
  const out: Entry[] = [];
  // Supabase vracia max. 1000 riadkov naraz → stránkovanie
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("entries")
      .select("id, employee_id, type, date_from, date_to, part, time_from, time_to, note, substitute_id")
      .lte("date_from", to)
      .gte("date_to", from)
      .order("date_from")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Entry[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function pendingRequestsCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}
