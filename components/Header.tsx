import Link from "next/link";
import type { Me } from "@/lib/data";
import { pendingRequestsCount } from "@/lib/loaders";
import { NavTabs, type Tab } from "./NavTabs";
import { TopBar } from "./TopBar";

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
    const pending = await pendingRequestsCount();
    tabs.push(
      { href: "/kalendar", label: "Kalendár" },
      { href: "/prehlad", label: "Prehľad" },
      { href: "/mzdy", label: "Podklad pre mzdy" },
      { href: "/nastavenia", label: "Nastavenia" },
      { href: "/schvalovanie", label: "Schvaľovanie", badge: pending || undefined }
    );
  } else {
    tabs.push({ href: "/kalendar", label: "Kalendár" });
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
          <span className="who-name">{me.name}</span>
          {userExtra}
          <Link className="btn ovbtn" href="/moj-prehlad" title="Dovolenka, lekár, OČR a rok po mesiacoch">
            Prehľad
          </Link>
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
