import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { balance, nf } from "@/lib/calc";
import { ppLabel, ppOrder } from "@/lib/report";
import { Header } from "@/components/Header";
import { rgTxt, type RG } from "@/lib/rights";
import { EmpForm, type EmpInit } from "./EmpForm";
import { WT_KEYS, effective, forContract, longInfo, type WorkTime } from "@/lib/worktime";
import { DOH_KIND, DOH_LAW, type DohKind } from "@/lib/dohLimits";

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

  const [{ data: vac }, { data: ch }, { data: note }, { data: link }, { data: asg }, { data: orgRows }, { data: viewers }] = await Promise.all([
    supabase.from("vacation_years").select("*").eq("employee_id", id).eq("year", year).maybeSingle(),
    supabase.from("contract_hours").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("employee_notes").select("note").eq("employee_id", id).maybeSingle(),
    isNew ? Promise.resolve({ data: null }) : supabase.from("employees").select("user_id").eq("id", id).maybeSingle(),
    supabase.from("manager_assignments").select("manager_id, employee_id"),
    supabase.from("org_options").select("kind, value").eq("company_id", me.company_id),
    isNew ? Promise.resolve({ data: [] }) : supabase.from("calendar_viewers").select("target_id").eq("viewer_id", id),
  ]);
  const org = (k: string) => ((orgRows ?? []) as { kind: string; value: string }[]).filter((r) => r.kind === k).map((r) => r.value);
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
    cal_scope: e?.cal_scope ?? "all",
    cal_viewers: ((viewers ?? []) as { target_id: string }[]).map((v) => v.target_id),
    work_override: (e?.work_override ?? {}) as Partial<WorkTime>,
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
      kind: (ch?.kind as string | null) ?? "",
      max_month: ch?.max_month ? Number(ch.max_month) : null,
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
  const gE = effective(g, init.work_override);
  const slRule = `${gE.sl_rule === "gt" ? "viac ako" : "aspoň"} ${nf(Number(gE.sl_min_hours))} h`;
  const rules: string[] = [];
  if (e) {
    rules.push(
      `<b>Typ vzťahu:</b> ${ppLabel(init.contract_type)}${
        init.date_from || init.date_to
          ? `, ${init.date_from ? "od " + fdate(init.date_from) : ""} ${init.date_to ? "do " + fdate(init.date_to) : "na neurčito"}`
          : ", na neurčito"
      }${init.active ? "" : " · <b>skrytý</b>"}.`
    );
    const own = Object.keys(init.work_override).length > 0;
    rules.push(
      `<b>Pracovný čas:</b> ${own ? `vlastné nastavenie (šablóna „${esc(g.name)}“)` : `šablóna „${esc(g.name)}“`} – ${longInfo(forContract(effective(g, init.work_override), init.contract_type), init.contract_type).join(", ")}.`
    );
    if (init.contract_type === "DOH") {
      const D = init.doh;
      rules.push(
        D.kind
          ? `<b>Druh dohody:</b> ${DOH_KIND[D.kind as DohKind]} – zákonný limit ${DOH_LAW[D.kind as DohKind]}${D.max_month ? `; limit firmy ${nf(D.max_month)} h mesačne` : ""}.`
          : `<b>Druh dohody:</b> nevyplnený – aplikácia nekontroluje zákonný limit hodín.`
      );
      rules.push(
        `<b>Hodiny:</b> evidujú sa zapísané hodiny; predvolený rozpis ${
          D.hours ? `podľa predpokladu ${nf(D.hours)} h mesačne` : "podľa pracovného času"
        } (najviac do limitu dohody); rozpis po ${D.step === 0.5 ? "polhodinách" : "celých hodinách"}, max. ${nf(D.max_day)} h za deň${D.max_week ? `, max. ${nf(D.max_week)} h za týždeň` : ""}.`
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
    rules.push(`<b>Stravné lístky:</b> ${gE.meal_voucher ? `áno – za deň s odpracovanými ${slRule}` : "nie"}.`);
    rules.push(`<b>Prístupové práva:</b> skupina „${esc(r.name)}“ – ${rgTxt(r as RG)}.`);
    rules.push(
      `<b>Zobrazenie:</b> ${[
        init.show_in_calendar ? "v spoločnom kalendári" : "nie je v spoločnom kalendári",
        init.cal_scope === "self" ? "v Kalendári vidí len seba" : init.cal_scope === "all" ? "v Kalendári vidí všetkých" : `v Kalendári vidí ${init.cal_viewers.length} vybraných ľudí`,
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
    info: longInfo(x, x.contract_type).join(", "),
    wt: Object.fromEntries(WT_KEYS.map((k) => [k, x[k] ?? null])) as WorkTime,
    contract_type: (x.contract_type as string | null) ?? null,
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
          orgOpts={{
            contract: ppOrder(org("contract")),
            sites: [...new Set(org("site"))].sort((a, b) => a.localeCompare(b, "sk")),
            depts: [...new Set(org("department"))].sort((a, b) => a.localeCompare(b, "sk")),
          }}
          people={emps
            .filter((x) => x.active)
            .sort((a, b) => a.name.localeCompare(b.name, "sk"))
            .map((x) => ({ id: x.id, name: x.name, pp: ppLabel(x.contract_type) }))}
        />
      </main>
    </>
  );
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
