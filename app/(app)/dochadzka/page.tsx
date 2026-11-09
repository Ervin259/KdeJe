import { createClient } from "@/lib/supabase/server";
import { canManage, requireMe, todayIso } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { byLastName, fdw, TYPE_NAME } from "@/lib/calc";
import { safeBack } from "@/lib/params";
import { Header } from "@/components/Header";
import { EntryTabs } from "@/components/EntryTabs";
import { canEditAttendance, computeDay, defaults, dohDay, editableParts, hmm, type Att } from "@/lib/attendance";
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
  // dohodár si zapisuje hodiny (príchod, odchod, prestávka); inak len pri pružnom čase, prestávke alebo nadčasoch
  const isDoh = emp?.contract_type === "DOH";
  const editable = isDoh || canEditAttendance(w);
  const q = (id: string) => `/dochadzka?emp=${id}&d=${day}&spat=${encodeURIComponent(back)}`;

  const [{ data: att }, entries, { data: rz }, { data: chs }] = await Promise.all([
    supabase.from("attendance").select("*").eq("employee_id", empId).eq("day", day).maybeSingle(),
    loadEntries(day, day),
    isDoh ? supabase.from("contract_hours_days").select("hours").eq("employee_id", empId).eq("date", day).maybeSingle() : Promise.resolve({ data: null }),
    isDoh ? supabase.from("contract_hours").select("max_day").eq("employee_id", empId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rzH = Number(rz?.hours ?? 0);
  const maxDay = Number(chs?.max_day) || 12;
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

  const p = isDoh ? { times: true, breakStart: true, breakLen: true } : editableParts(w);
  const rules: string[] = [];
  if (isDoh) {
    rules.push("Dohoda – zapíšte čas príchodu a odchodu (evidencia podľa § 99 ZP); hodiny sa dopočítajú.");
    rules.push(`Najviac ${hmm(Math.min(12, maxDay))} h denne. Pri práci dlhšej ako 6 hodín prestávka aspoň 30 minút (§ 91 ZP).`);
    rules.push(
      rzH > 0
        ? `V rozpise hodín je na tento deň ${hmm(rzH)} h – váš zápis má prednosť a rozpis ho už nezmení.`
        : "Zapísané hodiny sa započítajú do výkazu aj do Podkladu pre mzdy; rozpis hodín ich nezmení."
    );
  } else rules.push(
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
  if (!isDoh) rules.push(`Nadčasy: ${OVERTIME[w.overtime]}.`);
  if (info.absHours > 0 && !isDoh) rules.push(`V tento deň má neprítomnosť ${info.codes.map((c) => TYPE_NAME[c] ?? c).join(", ")} (${hmm(info.absHours)} h) – fond dňa je ${hmm(info.fond)} h.`);
  if (!info.work && !isDoh) rules.push(info.holiday ? "Sviatok – práca v tento deň sa eviduje ako práca vo sviatok." : "Víkend – práca v tento deň sa eviduje ako práca v sobotu/nedeľu.");

  const people = lead
    ? emps
        .filter((e) => e.active && !e.is_external && (e.contract_type === "DOH" || canEditAttendance(calc.group(e.id))) && canManage(me, e.id))
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
            <EntryTabs active="att" emp={empId} day={day} back={back} attendance={editable} doh={isDoh} />
            <h3 style={{ margin: "14px 0" }}>
              {isDoh ? "Zapísať hodiny" : "Upraviť dochádzku"} · {fdw(day)}
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
                init={
                  isDoh && !att
                    ? { employee_id: empId, day, ...(() => { const t = dohDay(w, rzH || 4); return { ...t, break_start: t.break_start ?? "" }; })(), note: "", edited: false }
                    : {
                        employee_id: empId,
                        day,
                        arrive: info.arrive ?? d.arrive,
                        leave: info.leave ?? d.leave,
                        break_start: info.break_start ?? d.break_start ?? "",
                        break_min: info.arrive ? info.break_min : d.break_min,
                        note: info.note ?? "",
                        edited: info.edited,
                      }
                }
                defaults={{ arrive: d.arrive, leave: d.leave, break_start: d.break_start ?? "", break_min: d.break_min }}
                can={p}
                breakOpts={isDoh ? [0, 15, 30, 45, 60, 90, 120] : breakOpts}
                fond={info.fond}
                daily={info.work && (!w.flexible || w.flex_period === "day")}
                rules={rules}
                people={people}
                back={back}
                locked={locked}
                doh={isDoh}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
