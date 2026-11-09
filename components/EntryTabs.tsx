import Link from "next/link";

/** Záložky nad formulárom dňa: Zadať neprítomnosť | Upraviť dochádzku (dohodár: Zapísať hodiny). */
export function EntryTabs({
  active,
  emp,
  day,
  back,
  attendance,
  doh = false,
}: {
  active: "abs" | "att";
  emp: string;
  day: string;
  back: string;
  /** môže mať tento zamestnanec úpravy dochádzky (pružný čas, pohyblivá prestávka, nadčasy) */
  attendance: boolean;
  /** dohodár – druhá záložka je „Zapísať hodiny“ */
  doh?: boolean;
}) {
  const lbl = doh ? "Zapísať hodiny" : "Upraviť dochádzku";
  const q = `emp=${encodeURIComponent(emp)}&d=${day}&spat=${encodeURIComponent(back)}`;
  return (
    <div className="etabs" role="tablist">
      <Link role="tab" aria-selected={active === "abs"} className={active === "abs" ? "on" : ""} href={`/zapisat?${q}`}>
        Zadať neprítomnosť
      </Link>
      {attendance ? (
        <Link role="tab" aria-selected={active === "att"} className={active === "att" ? "on" : ""} href={`/dochadzka?${q}`}>
          {lbl}
        </Link>
      ) : (
        <span
          className="off"
          title="Pevný pracovný čas bez nadčasov – nie je čo upravovať. Povoliť sa dá v karte zamestnanca (pružný čas, pohyblivá prestávka alebo nadčasy)."
        >
          {lbl}
        </span>
      )}
    </div>
  );
}
