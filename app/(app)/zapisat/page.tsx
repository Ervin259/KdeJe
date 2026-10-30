import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canManage, requireMe, todayIso } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import { byLastName, hhmm, type Entry } from "@/lib/calc";
import { safeBack } from "@/lib/params";
import { Header } from "@/components/Header";
import { EntryForm, type Init } from "./EntryForm";

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ spat?: string; id?: string; emp?: string; d?: string }>;
}) {
  const me = await requireMe();
  const admin = me.role === "admin";
  /** admin alebo vedúci – môže vybrať, za koho zapisuje */
  const lead = admin || me.isManager;
  const supabase = await createClient();
  const sp = await searchParams;
  const back = safeBack(sp.spat);
  const { emps, calc } = await loadCompany();

  const { data: types } = await supabase.from("absence_types").select("code, name, parts").eq("enabled", true).order("sort");

  let init: Init;
  let locked = false;
  if (sp.id) {
    const { data } = await supabase.from("entries").select("*").eq("id", sp.id).maybeSingle();
    if (!data) {
      return (
        <>
          <Header me={me} />
          <main id="view">
            <div className="box">
              Záznam sa nenašiel. <Link href={back}>Späť</Link>
            </div>
          </main>
        </>
      );
    }
    const x = data as Entry;
    init = {
      id: x.id,
      employee_id: x.employee_id,
      type: x.type,
      part: x.part,
      date_from: x.date_from,
      date_to: x.date_to,
      time_from: hhmm(x.time_from) || "08:30",
      time_to: hhmm(x.time_to) || "10:30",
      substitute_id: x.substitute_id ?? "",
      note: x.note ?? "",
    };
    if (!admin) {
      const mgr = x.employee_id !== me.id && me.managed.includes(x.employee_id);
      const { data: can } = mgr
        ? await supabase.rpc("manager_can_write", { p_emp: x.employee_id, p_from: x.date_from, p_to: x.date_to })
        : await supabase.rpc("employee_can_write", {
            p_emp: x.employee_id,
            p_from: x.date_from,
            p_to: x.date_to,
            p_change: true,
          });
      locked = can === false;
    }
  } else {
    const d = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : todayIso();
    const empId = lead && sp.emp && emps.some((e) => e.id === sp.emp) && canManage(me, sp.emp) ? sp.emp : (me.isEmployee && me.id) || emps.find((e) => e.active && !e.is_external)?.id || me.id;
    const sc = calc.sched(empId);
    init = {
      id: null,
      employee_id: empId,
      type: types?.[0]?.code ?? "DOV",
      part: "full",
      date_from: d,
      date_to: d,
      time_from: sc.start || "08:30",
      time_to: "",
      substitute_id: "",
      note: "",
    };
    // vlastný zápis do zamknutého / odsúhlaseného obdobia: rovno ako žiadosť (s dôvodom)
    if (!admin && empId === me.id) {
      const { data: can } = await supabase.rpc("employee_can_write", { p_emp: empId, p_from: d, p_to: d, p_change: false });
      locked = can === false;
    }
  }

  const active = emps.filter((e) => e.active && !e.is_external).sort(byLastName);
  return (
    <>
      <Header me={me} />
      <main id="view">
        <div className="panel">
          <div className="box">
            <h3 style={{ marginBottom: 14 }}>{init.id ? "Upraviť záznam" : "Zapísať neprítomnosť"}</h3>
            <EntryForm
              types={(types ?? []) as { code: string; name: string; parts: string[] }[]}
              people={lead ? active.filter((e) => canManage(me, e.id)).map((e) => ({ id: e.id, name: e.name })) : null}
              subs={active.map((e) => ({ id: e.id, name: e.name }))}
              init={init}
              back={back}
              locked={locked}
            />
          </div>
        </div>
      </main>
    </>
  );
}
