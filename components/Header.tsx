import type { Me } from "@/lib/data";
import { NavTabs, type Tab } from "./NavTabs";

export function Header({ me }: { me: Me }) {
  const tabs: Tab[] = [];
  if (me.sees_calendar || me.role === "admin") tabs.push({ href: "/kalendar", label: "Kalendár tímu" });
  if (me.role === "admin") {
    tabs.push(
      { href: "/prehlad", label: "Prehľad" },
      { href: "/mzdy", label: "Podklad pre mzdy" },
      { href: "/nastavenia", label: "Nastavenia" },
      { href: "/schvalovanie", label: "Schvaľovanie" }
    );
  } else {
    tabs.push({ href: "/moj-kalendar", label: "Môj kalendár" });
  }

  return (
    <header className="hdr">
      <div className="hdr-top">
        <div className="logo">
          Kde<span>Je</span>
        </div>
        <div className="hdr-company">{me.company_name}</div>
        <div className="hdr-user">
          <span>{me.name}</span>
          <span className="role">{me.role === "admin" ? "Admin" : "Zamestnanec"}</span>
          <form action="/auth/signout" method="post">
            <button className="btn-link">Odhlásiť</button>
          </form>
        </div>
      </div>
      <div className="hdr-bottom">
        <NavTabs tabs={tabs} />
      </div>
    </header>
  );
}
