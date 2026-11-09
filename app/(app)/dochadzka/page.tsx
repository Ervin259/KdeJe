import { createClient } from "@/lib/supabase/server";
import { canManage, requireMe, todayIso } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { byLastName, fdw, TYPE_NAME } from "@/lib/calc";
import { safeBack } from "@/lib/params";
import { Header } from "@/components/Header";
import { EntryTabs } from "@/components/EntryTabs";
import { canEditAttendance, computeDay, defaults, editableParts, hmm, type Att } from "@/lib/attendance";
import { FLEX_PERIOD, OVERTIME, hm } from "@/lib/worktime";
import { AttForm } from "./AttForm";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ spat?: string; emp?: string; d?: string }> }) {
  const me = await requireMe();
  const admin = me.role === "admin";
  const lead = admin || me.isManager;
  const sp = await searchParams;
  const back = safeBack(sp.spat);
  const { emps, calc } = await loadCompany();
  const supabase = await createClient();

  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : todayIso();
  const empId =
    lead && sp.emp && emps.some((e) => e.id === sp.emp) && canManage(me, sp.emp)
      ? sp.emp
      : (me.isEmployee && me.id) || emps.find((e) => e.active && !e.is_external)?.id || me.id;
  const emp = emps.find((e) => e.id === empId);
  const w = calc.group(empId);
  // dohodári majú hodiny z rozpisu (časy sa doplnia z rozpisu vo výkaze)
  const editable = canEditAttendance(w) && emp?.contract_type !== "DOH";
  const q = (id: string) => `/dochadzka?emp=${id}&d=${day}&spat=${encodeURIComponent(back)}`;

  const [{ data: att }, entries] = await Promise.all([
    supabase.from("attendance").select("*").eq("employee_id", empId).eq("day", day).maybeSingle(),
    loadEntries(day, day),
  ]);
  const info = computeDay(calc, empId, day, entries, (att as Att | null) ?? null);
  const d = defaults(w);

  let locked = false;
  if (!admin && editable) {
    const mgr = empId !== me.id && me.managed.includes(empId);
    const { data: can } = mgr
      ? await supabase.rpc("manager_can_write", { p_emp: empId, p_from: day, p_to: day })
      : await supabase.rpc("employee_can_write", { p_emp: empId, p_from: day, p_to: day, p_change: !!att });
    locked = can === false;
  }

  const p = editableParts(w);
  const rules: string[] = [];
  rules.push(
    w.flexible
      ? `Pružný pracovný čas: príchod ${hm(w.arrive_from)}–${hm(w.arrive_to)}, odchod ${hm(w.leave_from)}–${hm(w.leave_to)}${
          w.core_start && w.core_end ? `, základný čas ${hm(w.core_start)}–${hm(w.core_end)}` : ""
        }; fond ${hmm(d.H)} h ${w.flex_period === "day" ? "denne" : `(vyrovnáva sa za ${FLEX_PERIOD[w.flex_period]})`}.`
      : `Pevný pracovný čas ${d.arrive}–${d.leave}, fond ${hmm(d.H)} h.`
  );
  if (d.break_min)
    rules.push(
      `Prestávka ${w.break_len === "min" ? "aspoň " : ""}${d.break_min} min ${
        w.break_mode === "window" ? `kedykoľvek ${hm(w.break_from)}–${hm(w.break_to)}` : `o ${d.break_start}`
      }${w.break_len === "min" ? " – dlhšiu treba nadrobiť" : ""}.`
    );
  rules.push(`Nadčasy: ${OVERTIME[w.overtime]}.`);
  if (info.absHours > 0) rules.push(`V tento deň má neprítomnosť ${info.codes.map((c) => TYPE_NAME[c] ?? c).join(", ")} (${hmm(info.absHours)} h) – fond dňa je ${hmm(info.fond)} h.`);
  if (!info.work) rules.push(info.holiday ? "Sviatok – práca v tento deň sa eviduje ako práca vo sviatok." : "Víkend – práca v tento deň sa eviduje ako práca v sobotu/nedeľu.");

  const people = lead
    ? emps
        .filter((e) => e.active && !e.is_external && e.contract_type !== "DOH" && canManage(me, e.id))
        .sort(byLastName)
        .map((e) => ({ id: e.id, name: e.name, href: q(e.id) }))
    : null;

  const breakOpts = [...new Set([d.break_min, 30, 45, 60, 75, 90, 120])].filter((n) => n >= d.break_min).sort((a, b) => a - b);

  return (
    <>
      <Header me={me} />
      <main id="view">
        <div className="panel">
          <div className="box">
            <EntryTabs active="att" emp={empId} day={day} back={back} attendance={editable} />
            <h3 style={{ margin: "14px 0" }}>
              Upraviť dochádzku · {fdw(day)}
              {emp && empId !== me.id ? ` · ${emp.name}` : ""}
            </h3>
            {!editable ? (
              <div className="fmsg info">
                {emp?.contract_type === "DOH" ? (
                  <>Dohodár – odpracované hodiny sa zapisujú v Podklade pre mzdy (rozpis hodín), časy príchodu a odchodu sa doplnia z rozpisu.</>
                ) : (
                  <>
                {emp?.name ?? "Zamestnanec"} má pevný pracovný čas {d.arrive}–{d.leave} bez nadčasov – dochádzka sa počíta automaticky a nie je čo upravovať.
                Neprítomnosť zapíšete v záložke „Zadať neprítomnosť“.
                  </>
                )}
              </div>
            ) : info.absentFull ? (
              <div className="fmsg info">V tento deň má zapísanú celodennú neprítomnosť ({info.codes.map((c) => TYPE_NAME[c] ?? c).join(", ")}) – dochádzka sa neupravuje.</div>
            ) : (
              <AttForm
                init={{
                  employee_id: empId,
                  day,
                  arrive: info.arrive ?? d.arrive,
                  leave: info.leave ?? d.leave,
                  break_start: info.break_start ?? d.break_start ?? "",
                  break_min: info.arrive ? info.break_min : d.break_min,
                  note: info.note ?? "",
                  edited: info.edited,
                }}
                defaults={{ arrive: d.arrive, leave: d.leave, break_start: d.break_start ?? "", break_min: d.break_min }}
                can={p}
                breakOpts={breakOpts}
                fond={info.fond}
                daily={info.work && (!w.flexible || w.flex_period === "day")}
                rules={rules}
                people={people}
                back={back}
                locked={locked}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
