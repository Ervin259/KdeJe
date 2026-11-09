import { createClient } from "@/lib/supabase/server";
import { canManage, type Me } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { byLastName } from "@/lib/calc";
import { applyFilter, getFilter } from "@/lib/filters";
import { buildVykaz, type Vykaz } from "@/lib/vykaz";
import type { Att } from "@/lib/attendance";

export type VykazParams = { emp?: string; m?: string; od?: string; do?: string };

/** Obdobie: ?od=&do= (vlastné) alebo ?m=YYYY-MM (mesiac), predvolene aktuálny mesiac. */
export function period(sp: VykazParams, today: string) {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (ok(sp.od) && ok(sp.do) && sp.od! <= sp.do!) {
    // od–do presne na celý mesiac = mesiac
    const [y, mm] = sp.od!.slice(0, 7).split("-").map(Number);
    const full = sp.od!.endsWith("-01") && sp.do!.slice(0, 7) === sp.od!.slice(0, 7) && Number(sp.do!.slice(8)) === new Date(Date.UTC(y, mm, 0)).getUTCDate();
    return { from: sp.od!, to: sp.do!, month: full ? sp.od!.slice(0, 7) : (null as string | null) };
  }
  const m = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}`, month: m };
}

/** Zamestnanci, ktorých smie prihlásený vidieť vo výkaze, a vybraní podľa ?emp= (all = všetci). */
export async function loadVykaz(me: Me, sp: VykazParams, from: string, to: string) {
  const { emps, calc } = await loadCompany();
  const lead = me.role === "admin" || me.isManager;
  const allowed = emps
    .filter((e) => !e.is_external && (e.active || (e.date_to && e.date_to >= from)) && canManage(me, e.id))
    .filter((e) => (!e.date_from || e.date_from <= to) && (!e.date_to || e.date_to >= from))
    .sort(byLastName);
  let chosen = allowed;
  if (!lead) chosen = allowed.filter((e) => e.id === me.id);
  else if (sp.emp === "all") chosen = applyFilter(allowed, await getFilter());
  else chosen = allowed.filter((e) => e.id === (sp.emp && allowed.some((x) => x.id === sp.emp) ? sp.emp : me.isEmployee ? me.id : allowed[0]?.id));

  const supabase = await createClient();
  const ids = chosen.map((e) => e.id);
  const [entries, { data: atts }, { data: dh }] = await Promise.all([
    loadEntries(from, to),
    ids.length
      ? supabase.from("attendance").select("employee_id, day, arrive, leave, break_start, break_min, note").in("employee_id", ids).gte("day", from).lte("day", to)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("contract_hours_days").select("employee_id, date, hours").in("employee_id", ids).gte("date", from).lte("date", to)
      : Promise.resolve({ data: [] }),
  ]);
  const dohBy = new Map<string, Record<string, number>>();
  for (const r of (dh ?? []) as { employee_id: string; date: string; hours: number }[]) {
    const m = dohBy.get(r.employee_id) ?? {};
    m[String(r.date)] = Number(r.hours);
    dohBy.set(r.employee_id, m);
  }
  const att = ((atts ?? []) as Att[]).map((a) => ({ ...a, arrive: a.arrive.slice(0, 5), leave: a.leave.slice(0, 5), break_start: a.break_start?.slice(0, 5) ?? null }));
  const list: Vykaz[] = chosen.map((e) => buildVykaz(calc, e, from, to, entries, att, dohBy.get(e.id) ?? null));
  return { list, allowed, lead, calc };
}
