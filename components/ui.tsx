import { MN, TYPE_NAME, fd, fdw, partTxt, plus, typeClass, type Entry } from "@/lib/calc";
import type { MonthState } from "@/lib/loaders";

export function StatusPill({ st, m, admin }: { st: MonthState; m: number; admin: boolean }) {
  const mn = MN[m - 1];
  if (st.s === "closed")
    return (
      <span
        className="pill closed"
        title={
          admin
            ? `Mesiac ${mn} je uzavretý. Zmeny môžeš robiť, zapíšu sa do histórie úprav.`
            : `Mesiac ${mn} je uzavretý. Ak treba niečo opraviť, klikni na záznam a pošli žiadosť adminovi.`
        }
      >
        🔒 Uzavretý
      </span>
    );
  if (st.s === "grace")
    return (
      <span className="pill grace" title={`Mesiac sa skončil. Záznamy sa dajú upravovať do ${fd(plus(st.lock, -1))}.`}>
        Úpravy do {fd(plus(st.lock, -1))}
      </span>
    );
  return (
    <span className="pill open" title={`Mesiac je otvorený. Uzamkne sa ${fd(st.lock)}.`}>
      Otvorený{st.reopened ? " (znovu)" : ""}
    </span>
  );
}

/** Štítok záznamu (recChip v prototype). */
export function RecChip({ x }: { x: Pick<Entry, "type" | "date_from" | "date_to" | "part" | "time_from" | "time_to"> }) {
  return (
    <span className={`dpill ${typeClass(x.type)}`}>
      <b>{x.type}</b>
      {x.date_from === x.date_to ? fdw(x.date_from) : `${fd(x.date_from)} – ${fd(x.date_to)}`}
      {x.part !== "full" ? " · " + partTxt(x) : ""}
    </span>
  );
}

export function Legend({ types }: { types: string[] }) {
  return (
    <div className="legend">
      {types.map((k) => (
        <span key={k} className={typeClass(k)}>
          <span className="tag">{k}</span>
          {TYPE_NAME[k] ?? k}
        </span>
      ))}
    </div>
  );
}
