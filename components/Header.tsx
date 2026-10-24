import type { Me } from "@/lib/data";
import { pendingRequestsCount } from "@/lib/loaders";
import { createClient } from "@/lib/supabase/server";
import { NavTabs, type Tab } from "./NavTabs";
import { TopBar } from "./TopBar";
import { ViewToggle } from "./ViewToggle";

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
}: {
  me: Me;
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** lišta pod záložkami na samostatnom riadku (veľa ovládacích prvkov) */
  stack?: boolean;
  /** tlačidlá za menom prihláseného (napr. Odsúhlasiť mesiac) */
  userExtra?: React.ReactNode;
}) {
  const tabs: Tab[] = [];
  if (me.role === "admin") {
    const pending = await pendingRequestsCount(me.id);
    tabs.push(
      { href: "/kalendar", label: "Kalendár" },
      { href: "/moj-prehlad", label: "Môj prehľad" },
      { href: "/prehlad", label: "Prehľad" },
      { href: "/mzdy", label: "Podklad pre mzdy" },
      { href: "/nastavenia", label: "Nastavenia" },
      { href: "/schvalovanie", label: "Schvaľovanie", badge: pending || undefined }
    );
  } else if (me.isManager) {
    const pending = await pendingRequestsCount(me.id);
    tabs.push(
      { href: "/kalendar", label: "Kalendár" },
      { href: "/moj-prehlad", label: "Môj prehľad" },
      { href: "/prehlad", label: "Prehľad" },
      { href: "/schvalovanie", label: "Schvaľovanie", badge: pending || undefined }
    );
  } else {
    tabs.push({ href: "/kalendar", label: "Kalendár" }, { href: "/moj-prehlad", label: "Môj prehľad" });
  }

  if (me.isPlatform) {
    const supabase = await createClient();
    const { count } = await supabase.from("company_signups").select("id", { count: "exact", head: true }).eq("status", "pending");
    tabs.push({ href: "/firmy", label: "Firmy", badge: count || undefined });
  }

  return (
    <div className="stickyhead" id="stickyhead">
      <header className="top headrow">
        <div className="brand">
          <h1>
            Kde<b>Je</b>
          </h1>
        </div>
        <span className="firm">{me.company_name}</span>
        <div className="headright">
          <span className="whobox">
            <span className="who-name">{me.name}</span>
            {me.realRole === "admin" && <ViewToggle empView={me.role !== "admin"} />}
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
