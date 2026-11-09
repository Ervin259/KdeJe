"use client";

/** Výber zamestnanca – po zmene sa stránka hneď prepne. */
export function EmpPick({ value, options, base }: { value: string; options: { id: string; name: string }[]; base: string }) {
  return (
    <select
      className="vkpick"
      value={value}
      aria-label="Zamestnanec"
      onChange={(e) => {
        const u = new URL(base, window.location.origin);
        u.searchParams.set("emp", e.target.value);
        window.location.href = u.pathname + u.search;
      }}
    >
      <option value="all">Všetci zamestnanci</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Tlač / uloženie do PDF cez dialóg prehliadača. */
export function PrintBtn() {
  return (
    <button type="button" className="btn" onClick={() => window.print()} title="Vytlačiť alebo uložiť ako PDF (v dialógu tlače zvoľte „Uložiť ako PDF“)">
      Tlačiť / PDF
    </button>
  );
}
