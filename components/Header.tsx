import Link from "next/link";
import type { Me } from "@/lib/data";
import { pendingRequestsCount } from "@/lib/loaders";
import { createClient } from "@/lib/supabase/server";
import { NavTabs, type Tab } from "./NavTabs";
import { TopBar } from "./TopBar";
import { ViewToggle } from "./ViewToggle";
import { CompanySwitch } from "./CompanySwitch";
import { OrgFilter } from "./OrgFilter";
import { loadCompany } from "@/lib/loaders";
import { GROUP_LABEL, distinctOf, getFilter } from "@/lib/filters";

/**
 * Hlavička ako v prototype: logo | firma | meno, pod ňou záložky vľavo,
 * ovládanie záložky v strede (center) a tlačidlá vpravo (right).
 */
export async function Header({
  me,
  center,
  right,
  stack = false,
  userExtra,
  org = false,
}: {
  me: Me;
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** lišta pod záložkami na samostatnom riadku (veľa ovládacích prvkov) */
  stack?: boolean;
  /** tlačidlá za menom prihláseného (napr. Odsúhlasiť mesiac) */
  userExtra?: React.ReactNode;
  /** výber prevádzky / oddelenia / zoskupenia (stránky so zoznamom ľudí) */
  org?: boolean;
}) {
  const tabs: Tab[] = [];
  if (!me.company_id) {
    // superadmin mimo firmy – len správa aplikácie
  } else if (me.role === "admin") {
    const pending = await pendingRequestsCount(me.id);
    tabs.push(
      { href: "/kalendar", label: "Kalendár" },
      ...(me.isEmployee ? [{ href: "/moj-prehlad", label: "Môj prehľad" }] : []),
      { href: "/prehlad", label: "Prehľad" },
      { href: "/mzdy", label: "Podklad pre mzdy" },
      { href: "/nastavenia", label: "Nastavenia" },
      { href: "/schvalovanie", label: "Schvaľovanie", badge: pending || undefined }
    );
  } else if (me.isManager) {
    const pending = await pendingRequestsCount(me.id);
    tabs.push(
      { href: "/kalendar", label: "Kalendár" },
      ...(me.isEmployee ? [{ href: "/moj-prehlad", label: "Môj prehľad" }] : []),
      { href: "/prehlad", label: "Prehľad" },
      { href: "/schvalovanie", label: "Schvaľovanie", badge: pending || undefined }
    );
  } else {
    tabs.push({ href: "/kalendar", label: "Kalendár" });
    if (me.isEmployee) tabs.push({ href: "/moj-prehlad", label: "Môj prehľad" });
  }

  if (me.isPlatform) {
    const supabase = await createClient();
    const [{ count }, { data: pc }, { data: inv }] = await Promise.all([
      supabase.from("company_signups").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.rpc("platform_companies"),
      supabase.from("invoices").select("company_id").neq("status", "cancelled"),
    ]);
    // firmy, ktoré potvrdili pokračovanie a ešte nemajú faktúru
    const confirmed = ((pc ?? []) as { id: string; status: string; continue_confirmed_at: string | null; billing_exempt: boolean }[]).filter(
      (c) => c.status === "trial" && c.continue_confirmed_at && !c.billing_exempt && !(inv ?? []).some((i) => i.company_id === c.id)
    ).length;
    tabs.push({ href: "/firmy", label: "Firmy", badge: (count ?? 0) + confirmed || undefined });
  }

  // firmy v prepínači: superadmin všetky, ostatní tie, kde majú účet
  let switchOptions = me.companies;
  if (me.isPlatform) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("platform_companies");
    switchOptions = ((data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
  }

  // upozornenie na neuhradenú faktúru (admin) alebo obmedzenie firmy (všetci)
  let notice: React.ReactNode = null;
  const today = new Date().toISOString().slice(0, 10);
  const trialOver = !!me.trial && !me.trial.confirmed && !!me.trial.until && me.trial.until < today;
  const plan = me.realRole === "admin" ? <a href="/nastavenia?open=plan">Pokračovať v používaní</a> : null;
  if (me.readOnly && trialOver) {
    notice = (
      <div className="billnotice bad">
        <b>Skúšobná doba skončila.</b> Aplikácia je len na čítanie.{" "}
        {plan ? <>Ak chcete pokračovať, potvrďte to: {plan}</> : "Ak chcete pokračovať, obráťte sa na admina firmy."}
      </div>
    );
  } else if (me.readOnly) {
    notice = (
      <div className="billnotice bad">
        <b>Aplikácia je len na čítanie.</b> Predplatné vašej firmy nie je uhradené. Údaje si môžete pozrieť aj exportovať, nové zápisy budú
        možné po úhrade{me.realRole === "admin" ? <> – <a href="/nastavenia?open=plan">platobné údaje</a></> : " – obráťte sa na admina firmy"}.
      </div>
    );
  } else if (me.trial && !me.trial.confirmed && me.trial.until && me.realRole === "admin") {
    // posledných 14 dní skúšobnej doby: výzva na potvrdenie
    const days = Math.round((Date.parse(me.trial.until) - Date.parse(today)) / 864e5);
    if (days <= 14)
      notice = (
        <div className="billnotice">
          Skúšobná doba končí {Number(me.trial.until.slice(8))}. {Number(me.trial.until.slice(5, 7))}. {me.trial.until.slice(0, 4)}. {plan}
        </div>
      );
  } else if (me.realRole === "admin" && me.company_id) {
    const supabase = await createClient();
    const { data: inv } = await supabase.from("invoices").select("vs, amount, due_on").eq("company_id", me.company_id).eq("status", "issued").order("due_on").limit(1);
    const i = inv?.[0];
    if (i) {
      const late = i.due_on < new Date().toISOString().slice(0, 10);
      notice = (
        <div className={`billnotice${late ? " bad" : ""}`}>
          Faktúra za KdeJe {i.vs} na {Number(i.amount).toLocaleString("sk-SK")} € {late ? "je po splatnosti" : "čaká na úhradu"} (splatná{" "}
          {Number(i.due_on.slice(8))}. {Number(i.due_on.slice(5, 7))}. {i.due_on.slice(0, 4)}). <a href="/nastavenia?open=plan">Platobné údaje</a>
        </div>
      );
    }
  }

  // výber prevádzky a oddelenia – len ak ich firma používa
  let orgFilter: React.ReactNode = null;
  if (org && me.company_id) {
    const [{ emps }, f] = await Promise.all([loadCompany(), getFilter()]);
    const act = emps.filter((e) => e.active && !e.is_external);
    const sites = distinctOf(act, "site");
    const depts = distinctOf(act, "department");
    if (sites.length || depts.length)
      orgFilter = (
        <OrgFilter
          sites={sites}
          depts={depts}
          site={f.site}
          dept={f.dept}
          group={f.group}
          groups={Object.entries(GROUP_LABEL) as [string, string][]}
        />
      );
  }

  return (
    <div className="stickyhead" id="stickyhead">
      {notice}
      <header className="top headrow">
        <Link href="/kalendar" className="brand brandlink" title="Kalendár">
          <h1>
            Kde<b>Je</b>
          </h1>
        </Link>
        <span className="firm">
          {me.isPlatform || me.companies.length > 1 ? (
            <CompanySwitch current={me.company_id} options={switchOptions} platform={me.isPlatform} />
          ) : (
            <span className="firmname">{me.company_name}</span>
          )}
          {orgFilter}
        </span>
        <div className="headright">
          <span className="whobox">
            <span className="who-name">{me.name}</span>
            {me.realRole === "admin" && !!me.id && <ViewToggle empView={me.role !== "admin"} />}
          </span>
          {userExtra}
          <form action="/auth/signout" method="post" className="seg" style={{ marginLeft: 10 }}>
            <button type="submit" title="Odhlásiť sa">Odhlásiť</button>
          </form>
        </div>
      </header>
      <TopBar stack={stack}>
        <NavTabs tabs={tabs} />
        <div className="bl">{center}</div>
        <div className="br">{right}</div>
      </TopBar>
    </div>
  );
}
