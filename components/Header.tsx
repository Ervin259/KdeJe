import type { Me } from "@/lib/data";
import { pendingRequestsCount } from "@/lib/loaders";
import { NavTabs, type Tab } from "./NavTabs";

/**
 * Hlavička ako v prototype: logo | firma | meno, pod ňou záložky vľavo,
 * ovládanie záložky v strede (center) a tlačidlá vpravo (right).
 */
export async function Header({
  me,
  center,
  right,
  stack = false,
}: {
  me: Me;
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** lišta pod záložkami na samostatnom riadku (veľa ovládacích prvkov) */
  stack?: boolean;
}) {
  const tabs: Tab[] = [];
  if (me.role === "admin") {
    const pending = await pendingRequestsCount();
    tabs.push(
      { href: "/kalendar", label: "Kalendár tímu" },
      { href: "/moj-kalendar", label: "Môj kalendár" },
      { href: "/prehlad", label: "Prehľad" },
      { href: "/mzdy", label: "Podklad pre mzdy" },
      { href: "/nastavenia", label: "Nastavenia" },
      { href: "/schvalovanie", label: "Schvaľovanie", badge: pending || undefined }
    );
  } else {
    if (me.sees_calendar) tabs.push({ href: "/kalendar", label: "Kalendár tímu" });
    tabs.push({ href: "/moj-kalendar", label: "Môj kalendár" });
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
          <form action="/auth/signout" method="post" className="seg" style={{ marginLeft: 10 }}>
            <button type="submit" title="Odhlásiť sa">Odhlásiť</button>
          </form>
        </div>
      </header>
      <div className={`topbar${stack ? " tstack" : ""}`} id="bar">
        <NavTabs tabs={tabs} />
        <div className="bl">{center}</div>
        <div className="br">{right}</div>
      </div>
    </div>
  );
}
