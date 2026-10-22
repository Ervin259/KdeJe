import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type CalEntry,
  type Me,
  CONTRACT_LABEL,
  DOW,
  MONTHS,
  dayOfWeek,
  daysInMonth,
  fmtDate,
  iso,
  shiftMonth,
  todayIso,
} from "@/lib/data";

/** Bezpečný názov CSS triedy pre kód typu (OČR → OCR). */
export function typeClass(code: string) {
  return "t-" + code.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PART_LABEL: Record<CalEntry["part"], string> = {
  full: "celý deň",
  am: "dopoludnie",
  pm: "popoludnie",
  hrs: "hodiny",
};

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Poloha a výška bloku v bunke (0–1) podľa časti dňa. Štandardný deň 8:30–17:00. */
function blockGeometry(e: CalEntry) {
  if (e.part === "am") return { top: 0, height: 0.5 };
  if (e.part === "pm") return { top: 0.5, height: 0.5 };
  if (e.part === "hrs" && e.time_from && e.time_to) {
    const start = 8 * 60 + 30;
    const span = 8.5 * 60;
    const top = Math.min(Math.max((toMin(e.time_from) - start) / span, 0), 0.9);
    const height = Math.max(Math.min((toMin(e.time_to) - toMin(e.time_from)) / span, 1 - top), 0.1);
    return { top, height };
  }
  return { top: 0, height: 1 };
}

function tooltip(e: CalEntry) {
  const range =
    e.date_from === e.date_to ? fmtDate(e.date_from) : `${fmtDate(e.date_from)} – ${fmtDate(e.date_to)}`;
  const part = e.part === "hrs" ? `${e.time_from?.slice(0, 5)}–${e.time_to?.slice(0, 5)}` : PART_LABEL[e.part];
  return [`${e.type} · ${range} · ${part}`, e.note].filter(Boolean).join("\n");
}

export async function MonthCalendar({
  me,
  y,
  m,
  basePath,
  onlyMe = false,
}: {
  me: Me;
  y: number;
  m: number;
  basePath: string;
  onlyMe?: boolean;
}) {
  const supabase = await createClient();
  const n = daysInMonth(y, m);
  const first = iso(y, m, 1);
  const last = iso(y, m, n);

  let q = supabase
    .from("team_calendar")
    .select("*")
    .lte("date_from", last)
    .gte("date_to", first)
    .order("date_from");
  if (onlyMe) q = q.eq("employee_id", me.id);

  const [{ data: entries, error }, { data: hol }] = await Promise.all([
    q,
    supabase.from("holidays").select("date, name").gte("date", first).lte("date", last),
  ]);

  const holidays = new Map((hol ?? []).map((h) => [h.date as string, h.name as string]));
  const list = (entries ?? []) as CalEntry[];

  // riadky: prihlásený vždy prvý, ďalej len ľudia so záznamom, abecedne
  const people = new Map<string, { name: string; contract: string }>();
  people.set(me.id, { name: me.name, contract: CONTRACT_LABEL[me.contract_type] });
  for (const e of list) {
    if (!people.has(e.employee_id))
      people.set(e.employee_id, { name: e.employee_name, contract: CONTRACT_LABEL[e.contract_type] });
  }
  const rows = [...people.entries()].sort((a, b) =>
    a[0] === me.id ? -1 : b[0] === me.id ? 1 : a[1].name.localeCompare(b[1].name, "sk")
  );

  const days = Array.from({ length: n }, (_, i) => {
    const d = i + 1;
    const date = iso(y, m, d);
    const dow = dayOfWeek(y, m, d);
    return { d, date, dow, off: dow === 0 || dow === 6 || holidays.has(date) };
  });
  const today = todayIso();
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const href = (p: { y: number; m: number }) => `${basePath}?m=${p.y}-${String(p.m).padStart(2, "0")}`;

  return (
    <section>
      <div className="toolbar">
        <div className="toolbar-mid">
          <Link className="btn" href={href(prev)} aria-label="Predchádzajúci mesiac">‹</Link>
          <h1 className="period">
            {MONTHS[m - 1]} {y}
          </h1>
          <Link className="btn" href={href(next)} aria-label="Nasledujúci mesiac">›</Link>
          <Link className="btn" href={basePath}>Dnes</Link>
        </div>
        <Link className="btn btn-primary" href={`/zapisat?spat=${encodeURIComponent(basePath)}`}>
          + Zapísať
        </Link>
      </div>

      {error && <p className="err">Kalendár sa nepodarilo načítať: {error.message}</p>}

      <div className="grid-wrap">
        <table className="cal">
          <thead>
            <tr>
              <th className="cal-name">Zamestnanec</th>
              {days.map((x) => (
                <th
                  key={x.d}
                  className={[x.off && "off", x.date === today && "today"].filter(Boolean).join(" ")}
                  title={holidays.get(x.date)}
                >
                  <div className="dow">{DOW[x.dow]}</div>
                  <div>{x.d}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([empId, p]) => (
              <tr key={empId} className={empId === me.id ? "me" : undefined}>
                <td className="cal-name">
                  <div>{p.name}</div>
                  <div className="muted small">{p.contract}</div>
                </td>
                {days.map((x) => {
                  const cell = x.off
                    ? []
                    : list.filter((e) => e.employee_id === empId && e.date_from <= x.date && e.date_to >= x.date);
                  return (
                    <td key={x.d} className={x.off ? "off" : undefined}>
                      {cell.map((e) => {
                        const g = blockGeometry(e);
                        return (
                          <div
                            key={e.id}
                            className={`blk ${typeClass(e.type)}`}
                            style={{ top: `${g.top * 100}%`, height: `${g.height * 100}%` }}
                            title={tooltip(e)}
                          >
                            {g.height >= 0.5 && <span>{e.type}</span>}
                            {e.note && <i className="dot" />}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 1 && list.length === 0 && (
        <p className="muted">V tomto mesiaci nemá nikto zapísanú neprítomnosť.</p>
      )}
    </section>
  );
}
