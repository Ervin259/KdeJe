import { distinctOf } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { balance, nf } from "@/lib/calc";
import { PP_LABEL } from "@/lib/report";
import { Header } from "@/components/Header";
import { rgTxt, type RG } from "@/lib/rights";
import { EmpForm, type EmpInit } from "./EmpForm";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fdate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : "");
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default async function EmployeeCard({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const isNew = id === "novy";
  const { calc, emps, groups, rights, settings } = await loadCompany();
  const supabase = await createClient();
  const year = Number(calc.today.slice(0, 4));
  const defG = groups.find((g) => g.is_default) ?? groups[0];
  const defR = rights.find((r) => r.is_default) ?? rights[0];

  const e = isNew ? null : emps.find((x) => x.id === id);
  if (!isNew && !e) notFound();

  const [{ data: vac }, { data: ch }, { data: note }, { data: link }, { data: asg }] = await Promise.all([
    supabase.from("vacation_years").select("*").eq("employee_id", id).eq("year", year).maybeSingle(),
    supabase.from("contract_hours").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("employee_notes").select("note").eq("employee_id", id).maybeSingle(),
    isNew ? Promise.resolve({ data: null }) : supabase.from("employees").select("user_id").eq("id", id).maybeSingle(),
    supabase.from("manager_assignments").select("manager_id, employee_id"),
  ]);
  const assign = (asg ?? []) as { manager_id: string; employee_id: string }[];

  const init: EmpInit = {
    id: e?.id ?? null,
    name: e?.name ?? "",
    email: e?.email ?? "",
    contract_type: e?.contract_type ?? "TPP",
    firm: e?.firm ?? me.company_name,
    site: e?.site ?? "",
    department: e?.department ?? "",
    date_from: e?.date_from ?? "",
    date_to: e?.date_to ?? "",
    active: e?.active ?? true,
    work_group_id: e?.work_group_id ?? defG.id,
    rights_group_id: e?.rights_group_id ?? defR.id,
    show_in_calendar: e?.show_in_calendar ?? true,
    sees_calendar: e?.sees_calendar ?? true,
    in_stats: e?.in_stats ?? true,
    in_payroll: e?.in_payroll ?? true,
    is_admin: e?.role === "admin",
    is_manager: !!e?.is_manager,
    is_external: !!e?.is_external,
    manages: isNew ? [] : assign.filter((a) => a.manager_id === id).map((a) => a.employee_id),
    managedBy: isNew
      ? []
      : assign
          .filter((a) => a.employee_id === id)
          .map((a) => emps.find((x) => x.id === a.manager_id))
          .filter((x) => x?.is_manager && x.active)
          .map((x) => x!.name),
    linked: !!link?.user_id,
    entitlement_full: Number(vac?.entitlement_full ?? 25),
    entitlement: Number(vac?.entitlement ?? 25),
    carry_in: Number(vac?.carry_in ?? 0),
    note: note?.note ?? "",
    doh: {
      mode: ch?.mode ?? "manual",
      hours: Number(ch?.hours ?? 0),
      coef: Number(ch?.coef ?? 1),
      max_day: Number(ch?.max_day ?? 8),
      max_week: ch?.max_week ? Number(ch.max_week) : null,
      step: Number(ch?.step ?? 1),
    },
  };

  // zostatok a návrh na budúci rok
  let bal: { total: number; used: number; left: number } | null = null;
  let ny: { carry: number; ent: number; total: number } | null = null;
  if (e && e.contract_type !== "DOH") {
    const entries = (await loadEntries(`${year}-01-01`, `${year}-12-31`)).filter((x) => x.employee_id === e.id);
    const b = balance(calc, e.id, entries, vac ?? undefined, settings.carry_max);
    bal = { total: b.total, used: b.taken + b.planned, left: b.left };
    const carry = b.left < 0 ? b.left : settings.carry_mode === "max" ? Math.min(b.left, settings.carry_max) : b.left;
    ny = { carry, ent: init.entitlement_full, total: init.entitlement_full + carry };
  }

  // „Ako aplikácia počíta“ (empRules v prototype)
  const g = groups.find((x) => x.id === init.work_group_id) ?? defG;
  const r = rights.find((x) => x.id === init.rights_group_id) ?? defR;
  const gH = g.flexible || !g.day_start || !g.day_end ? 0 : (toMin(g.day_end) - toMin(g.day_start) - Number(g.break_min)) / 60;
  const grpTxt = g.flexible
    ? "nestanovená (flexibilná)"
    : `${hm(g.day_start)}–${hm(g.day_end)}${Number(g.break_min) ? `, obed ${hm(g.break_start)} (${g.break_min} min)` : ", bez obeda"} = ${nf(gH)} h`;
  const slRule = `${g.sl_rule === "gt" ? "viac ako" : "aspoň"} ${nf(Number(g.sl_min_hours))} h`;
  const rules: string[] = [];
  if (e) {
    rules.push(
      `<b>Pracovný pomer:</b> ${PP_LABEL[init.contract_type]}${
        init.date_from || init.date_to
          ? `, ${init.date_from ? "od " + fdate(init.date_from) : ""} ${init.date_to ? "do " + fdate(init.date_to) : "na neurčito"}`
          : ", na neurčito"
      }${init.active ? "" : " · <b>skrytý</b>"}.`
    );
    rules.push(`<b>Pracovný čas:</b> skupina „${esc(g.name)}“ – ${grpTxt}.`);
    if (init.contract_type === "DOH") {
      const D = init.doh;
      rules.push(
        `<b>Hodiny na výplatu:</b> ${
          D.mode === "fixed" ? `pevne ${nf(D.hours)} h mesačne` : D.mode === "worked" ? `odpracované hodiny ÷ ${nf(D.coef)}` : "zadávate ručne každý mesiac"
        }; rozpis po ${D.step === 0.5 ? "polhodinách" : "celých hodinách"}, max. ${nf(D.max_day)} h za deň${D.max_week ? `, max. ${nf(D.max_week)} h za týždeň` : ""}.`
      );
      rules.push("<b>Dovolenka:</b> neeviduje sa (dohoda). Neprítomnosti si zapisuje do kalendára, aby kolegovia vedeli, či pracuje.");
      rules.push("<b>Mzdy:</b> do výkazu dohôd (Meno · dni · SUM), nie do hlavnej tabuľky. Mesiac neodsúhlasuje.");
    } else {
      rules.push(
        `<b>Dovolenka:</b> nárok ${nf(init.entitlement)} + prenos ${nf(init.carry_in)} = ${nf(init.entitlement + init.carry_in)} dní${
          init.entitlement_full !== init.entitlement ? ` (plný ročný nárok ${nf(init.entitlement_full)})` : ""
        }; 1. 1. ${year + 1} sa ${
          settings.carry_mode === "max" ? `prenesie najviac ${settings.carry_max} dní` : `prenesie celý zostatok (odporúčane najviac ${settings.carry_max})`
        } a pripíše sa ${nf(init.entitlement_full)} dní.`
      );
      rules.push(
        init.contract_type === "TPP"
          ? "<b>Odsúhlasenie:</b> mesačnú dochádzku si odsúhlasuje sám/sama."
          : "<b>Odsúhlasenie:</b> neodsúhlasuje (len vaša evidencia)."
      );
    }
    rules.push(`<b>Stravné lístky:</b> ${g.meal_voucher ? `áno – za deň s odpracovanými ${slRule}` : "nie"} (podľa skupiny).`);
    rules.push(`<b>Prístupové práva:</b> skupina „${esc(r.name)}“ – ${rgTxt(r as RG)}.`);
    rules.push(
      `<b>Zobrazenie:</b> ${[
        init.show_in_calendar ? "v spoločnom kalendári" : "nie je v spoločnom kalendári",
        init.sees_calendar ? "vidí spoločný kalendár" : "nevidí spoločný kalendár",
        init.in_stats ? "v Prehľade" : "nie je v Prehľade",
        init.in_payroll ? "v podkladoch pre mzdy" : "nie je v podkladoch pre mzdy",
      ].join(" · ")}.`
    );
    if (init.is_manager)
      rules.push(
        `<b>Vedúci:</b> spravuje ${init.manages.length} ${init.manages.length === 1 ? "človeka" : "ľudí"} – zapisuje za nich do uzávierky, vidí ich v Prehľade a vybavuje ich žiadosti.`
      );
    rules.push(
      `<b>Prihlásenie:</b> ${
        init.email ? `e-mailom ${esc(init.email)}${init.linked ? " (účet prepojený)" : " – ešte sa neprihlásil(a)"}` : "bez e-mailu sa nemôže prihlásiť"
      }.`
    );
  } else rules.push("Pravidlá sa zobrazia po uložení.");

  const workGroups = groups.map((x) => ({
    id: x.id,
    name: x.name,
    info: `${x.flexible ? "flexibilná" : `${hm(x.day_start)}–${hm(x.day_end)}`} · ${x.meal_voucher ? "stravné lístky" : "bez stravných lístkov"}`,
  }));
  const rightsGroups = rights.map((x) => ({ id: x.id, name: x.name, info: rgTxt(x as RG) }));

  return (
    <>
      <Header
        me={me}
        center={
          <div className="mnav">
            <h2>{init.id ? init.name : "Nový zamestnanec"}</h2>
          </div>
        }
        right={
          <div className="row">
            <Link className="btn" href="/nastavenia?open=emp">
              Zrušiť
            </Link>
            <button className="btn primary" form="empform" type="submit">
              {init.id ? "Uložiť zmeny" : "Pridať zamestnanca"}
            </button>
          </div>
        }
      />
      <main id="view">
        <EmpForm
          init={init}
          workGroups={workGroups}
          rightsGroups={rightsGroups}
          year={year}
          balance={bal}
          nextYear={ny}
          rules={rules}
          meId={me.id}
          orgOpts={{ sites: distinctOf(emps, "site"), depts: distinctOf(emps, "department") }}
          people={emps
            .filter((x) => x.active)
            .sort((a, b) => a.name.localeCompare(b.name, "sk"))
            .map((x) => ({ id: x.id, name: x.name, pp: PP_LABEL[x.contract_type] }))}
        />
      </main>
    </>
  );
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
