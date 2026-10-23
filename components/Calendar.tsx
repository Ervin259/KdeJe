import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Me } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import {
  KIND,
  MNC,
  TYPE_NAME,
  WD,
  byLastName,
  dow,
  fd,
  fdw,
  hhmm,
  monthDays,
  partTxt,
  plus,
  typeClass,
  type Calc,
  type Entry,
} from "@/lib/calc";
import { Header } from "./Header";
import { StatusPill, Legend } from "./ui";
import { CalClick } from "./CalClick";
import { ConfirmMonthButton } from "./ConfirmMonth";

export type View = "day" | "week" | "month";
const WDL = ["Nedeľa", "Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota"];

type CalEntry = Entry & { employee_name?: string };

const mondayOf = (s: string) => plus(s, -((dow(s) + 6) % 7));
function isoWeek(s: string) {
  const d = new Date(s + "T00:00:00Z");
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - y0.getTime()) / 864e5 - 3 + ((y0.getUTCDay() + 6) % 7)) / 7);
}

/** Kalendár tímu / Môj kalendár – pohľady Deň, Týždeň, Mesiac (prenesené z prototypu). */
export async function Calendar({
  me,
  view,
  anchor,
  basePath,
  onlyMe = false,
}: {
  me: Me;
  view: View;
  anchor: string;
  basePath: string;
  onlyMe?: boolean;
}) {
  const admin = me.role === "admin";
  const { calc, emps, mstatus, settings, types: absTypes } = await loadCompany();
  const supabase = await createClient();

  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  let days: string[];
  let title: React.ReactNode;
  if (view === "month") {
    days = monthDays(y, m);
    title = `${MNC[m - 1]} ${y}`;
  } else if (view === "week") {
    const mo = mondayOf(anchor);
    days = Array.from({ length: 7 }, (_, i) => plus(mo, i));
    title = (
      <>
        <span className="sub">{isoWeek(anchor)}. týždeň</span>
        {fd(days[0])} – {fd(days[6])} {y}
      </>
    );
  } else {
    days = [anchor];
    title = (
      <>
        <span className="sub">{WDL[dow(anchor)]}</span>
        {fd(anchor)} {y}
      </>
    );
  }
  const first = days[0];
  const last = days[days.length - 1];

  // Záznamy: Môj kalendár priamo z tabuľky (vlastné), Kalendár tímu cez pohľad s GDPR maskovaním
  let entries: CalEntry[];
  if (onlyMe) {
    const { data } = await supabase
      .from("entries")
      .select("*")
      .eq("employee_id", me.id)
      .lte("date_from", last)
      .gte("date_to", first);
    entries = (data ?? []) as CalEntry[];
  } else {
    const { data } = await supabase.from("team_calendar").select("*").lte("date_from", last).gte("date_to", first);
    entries = (data ?? []) as CalEntry[];
  }

  // Admin v pohľade zamestnanca: databáza mu vracia všetko, GDPR maskovanie preto doplníme tu
  if (me.realRole === "admin" && !admin && settings.hide_health) {
    const health = new Set(absTypes.filter((t) => t.is_health).map((t) => t.code));
    entries = entries.map((x) =>
      x.employee_id !== me.id && health.has(x.type) ? { ...x, type: "MIMO", note: null } : x
    );
  }

  const on = (empId: string, d: string) =>
    entries.filter((x) => x.employee_id === empId && x.date_from <= d && x.date_to >= d);

  // Riadky: len ja (kto nevidí kalendár tímu); Kalendár tímu = ľudia so záznamom (zamestnanec vždy prvý)
  let rows = onlyMe
    ? emps.filter((e) => e.id === me.id)
    : emps.filter(
        (e) =>
          e.id === me.id ||
          (e.show_in_calendar && e.active && entries.some((x) => x.employee_id === e.id))
      );
  rows = rows.sort(byLastName).sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id));

  const st = mstatus(y, m);
  const q = (v: View, d: string) => `${basePath}?v=${v}&d=${d}`;
  const step = view === "month" ? null : view === "week" ? 7 : 1;
  const prev =
    step === null ? `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01` : plus(anchor, -step);
  const next = step === null ? `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01` : plus(anchor, step);
  const back = q(view, anchor);

  const center = (
    <div className="mnav">
      <Link className="icon-btn" href={q(view, prev)} aria-label="Dozadu">‹</Link>
      <h2>{title}</h2>
      <Link className="icon-btn" href={q(view, next)} aria-label="Dopredu">›</Link>
      <Link className="btn" href={q(view, calc.today)}>Dnes</Link>
      <StatusPill st={st} m={m} admin={admin} />
    </div>
  );
  const right = (
    <div className="row">
      <div className="seg" role="group" aria-label="Náhľad">
        {(
          [
            ["day", "Deň"],
            ["week", "Týždeň"],
            ["month", "Mesiac"],
          ] as const
        ).map(([k, l]) => (
          <Link key={k} href={q(k, anchor)} aria-pressed={view === k} className="segl">
            {l}
          </Link>
        ))}
      </div>
      <Link className="btn primary" href={`/zapisat?spat=${encodeURIComponent(back)}`}>
        + Zapísať
      </Link>
    </div>
  );

  // Odsúhlasenie mesiaca (len TPP, mesačný náhľad) – v hlavičke za menom
  // v riadku prihláseného za menom
  const meExtra =
    view === "month" && me.contract_type === "TPP" ? (
      <span className="mebtns">
        <ConfirmMonthButton y={y} m={m} last={st.last} today={calc.today} empId={me.id} short />
      </span>
    ) : null;


  const types = ["DOV", "PV", "PAR", "OČR", "SCT", "SCZ", "HO", "PN"];
  const ctx = { calc, admin, meId: me.id, on };

  return (
    <>
      <Header me={me} center={center} right={right} />
      <main id="view">
        <div className="panel">
          <CalClick back={back}>
            {view === "day" ? (
              <DayTable d={anchor} rows={rows} {...ctx} onlyMe={onlyMe} emps={emps} />
            ) : (
              <Grid days={days} wide={view === "week"} rows={rows} meExtra={meExtra} {...ctx} />
            )}
          </CalClick>
          <Legend types={types} />
          {settings.hide_health && !admin && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Zdravotné neprítomnosti kolegov sa zobrazujú ako „MIMO“.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

type Ctx = {
  calc: Calc;
  admin: boolean;
  meId: string;
  on: (empId: string, d: string) => CalEntry[];
};

const disp = (x: CalEntry) => ({ cls: typeClass(x.type), code: x.type, name: TYPE_NAME[x.type] ?? x.type });
const NM: Record<string, React.ReactNode> = {
  "Služobná cesta tuzemská": <>Služobná cesta<br />tuzemská</>,
  "Služobná cesta zahraničná": <>Služobná cesta<br />zahraničná</>,
  "Opatrovanie člena rodiny": <>Opatrovanie<br />člena rodiny</>,
};

function Cell({ empId, d, wide, calc, on }: { empId: string; d: string; wide: boolean } & Ctx) {
  const xs = on(empId, d);
  const full = xs.find((x) => x.part === "full");
  if (full) {
    const ds = disp(full);
    const nt = full.note?.trim();
    return (
      <span className={`f ${ds.cls}${nt ? " has-note" : ""}`} data-id={full.id} title={nt || undefined}>
        {wide ? (
          <>
            <b>{ds.code}</b> <span>{NM[ds.name] ?? ds.name}</span>
          </>
        ) : (
          ds.code
        )}
      </span>
    );
  }
  if (!xs.length) return <span className="empty" />;

  const sc = calc.sched(empId);
  if (!wide) {
    // mesačný náhľad: blok s výškou podľa dĺžky zápisu na správnom mieste dňa
    return (
      <>
        <span className="h empty" data-part="am" />
        <span className="h empty" data-part="pm" />
        {xs.map((x) => {
          const ds = disp(x);
          const [a] = calc.span(x);
          const f = calc.hoursOf(x) / sc.H;
          const nt = x.note?.trim();
          return (
            <span
              key={x.id}
              className={`f q ${ds.cls}${nt ? " has-note" : ""}${f < 0.5 ? " q-s" : ""}`}
              data-id={x.id}
              title={nt || undefined}
              style={{
                top: `calc(2px + (100% - 4px) * ${calc.wpos(a, sc) / sc.H})`,
                height: `calc((100% - 4px) * ${f} - ${f < 1 ? 1 : 0}px)`,
              }}
            >
              {ds.code}
            </span>
          );
        })}
      </>
    );
  }
  const halfOf = (x: CalEntry) => {
    if (x.part === "am" || x.part === "pm") return x.part;
    const [a, b] = calc.span(x);
    return (calc.wpos(a, sc) + calc.wpos(b, sc)) / 2 < sc.H / 2 ? "am" : "pm";
  };
  return (
    <>
      {(["am", "pm"] as const).map((p) => {
        const ys = xs.filter((z) => halfOf(z) === p);
        if (!ys.length) return <span key={p} className="h empty" data-part={p} />;
        const x = ys[0];
        const ds = disp(x);
        const more = ys.length > 1 ? "+" : "";
        const t = x.part === "hrs" ? `${hhmm(x.time_from)}–${hhmm(x.time_to)}` : p === "am" ? "dopol." : "popol.";
        const nt = x.note?.trim();
        return (
          <span key={p} className={`h f ${ds.cls}${nt ? " has-note" : ""}`} data-id={x.id} title={nt || undefined}>
            <b>
              {ds.code}
              {more}
            </b>{" "}
            <span>{t}</span>
          </span>
        );
      })}
    </>
  );
}

function Grid({
  days,
  wide,
  rows,
  meExtra,
  ...ctx
}: { days: string[]; wide: boolean; rows: { id: string; name: string }[]; meExtra?: React.ReactNode } & Ctx) {
  const { calc, admin, meId } = ctx;
  return (
    <div className="gridwrap">
      <table className={`cal ${wide ? "wide" : ""}`}>
        <thead>
          <tr>
            <th className="name">Zamestnanec</th>
            {days.map((d) => {
              const off = !calc.isWork(d);
              return (
                <th key={d} className={`${off ? "off" : ""} ${d === calc.today ? "tdy" : ""}`} title={calc.isHol(d) ? "Sviatok" : undefined}>
                  {wide ? (
                    <>
                      <span className="dn">
                        {WD[dow(d)]}
                        {calc.isHol(d) ? " · sviatok" : ""}
                      </span>
                      <span className="num">{fd(d)}</span>
                    </>
                  ) : (
                    <>
                      <span className="num">{Number(d.slice(8))}</span>
                      <span className="dn">{WD[dow(d)]}</span>
                    </>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {!rows.length && (
            <tr>
              <td className="name muted" colSpan={days.length + 1} style={{ position: "static", maxWidth: "none", padding: "14px 10px" }}>
                V tomto období nemá nikto zapísanú neprítomnosť.
              </td>
            </tr>
          )}
          {rows.map((e) => {
            const mine = e.id === meId;
            const can = admin || e.id === meId;
            return (
              <tr key={e.id} className={mine ? "me" : undefined}>
                <td className="name" title={e.name}>
                  {e.id === meId && meExtra ? (
                    <div className="mename">
                      <span>{e.name}</span>
                      {meExtra}
                    </div>
                  ) : (
                    e.name
                  )}
                </td>
                {days.map((d) => {
                  const off = !calc.isWork(d);
                  return (
                    <td
                      key={d}
                      className={["c", off && "off", d === calc.today && "tdy", can && !off && "click"].filter(Boolean).join(" ")}
                      data-emp={e.id}
                      data-d={d}
                    >
                      <div className="cell">{off ? null : <Cell empId={e.id} d={d} wide={wide} {...ctx} />}</div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DayTable({
  d,
  rows,
  onlyMe,
  emps,
  ...ctx
}: { d: string; rows: { id: string; name: string }[]; onlyMe: boolean; emps: { id: string; name: string }[] } & Ctx) {
  const { calc, admin, meId, on } = ctx;
  if (!calc.isWork(d)) {
    let nw = d;
    while (!calc.isWork(nw)) nw = plus(nw, 1);
    return (
      <div className="banner info">
        <div>
          <b className="h">{calc.isHol(d) ? "Sviatok" : "Víkend"} – nepracuje sa</b>Najbližší pracovný deň je {fdw(nw)}.
        </div>
      </div>
    );
  }
  const awayH = (id: string, s: string) =>
    on(id, s).filter((x) => KIND[x.type] !== "work").reduce((a, x) => a + calc.hoursOf(x), 0);
  const fullAway = (id: string, s: string) => awayH(id, s) >= calc.sched(id).H;
  const backDay = (id: string) => {
    let s = plus(d, 1);
    for (let i = 0; i < 400 && (!calc.isWork(s) || fullAway(id, s)); i++) s = plus(s, 1);
    return s;
  };
  const short = (n: string) => {
    const [a, b] = n.split(" ");
    return a + " " + (b ? b[0] + "." : "");
  };
  const groups = rows
    .map((e) => ({ e, xs: on(e.id, d).sort((a, b) => calc.span(a)[0] - calc.span(b)[0]) }))
    .filter((g) => g.xs.length);

  return (
    <div className="gridwrap">
      <table className="cal dayt">
        <thead>
          <tr>
            <th className="name">Zamestnanec</th>
            <th>Neprítomnosť</th>
            <th>Poznámka</th>
            <th>Rozsah</th>
            <th>Obdobie</th>
            <th>Zástup</th>
            <th>Späť v práci</th>
          </tr>
        </thead>
        <tbody>
          {!groups.length && (
            <tr>
              <td colSpan={7} className="muted" style={{ padding: "16px 12px" }}>
                {onlyMe ? "V tento deň nemáš zapísanú žiadnu neprítomnosť." : "V tento deň nie je nikto mimo práce."}
              </td>
            </tr>
          )}
          {groups.map(({ e, xs }) =>
            xs.map((x, i) => {
              const mine = e.id === meId;
              const can = admin || e.id === meId;
              const ds = disp(x);
              const c = can ? "rowclick" : "";
              const at = can ? { "data-edit": x.id } : {};
              const work = KIND[x.type] === "work";
              const per = x.date_from === x.date_to ? fdw(x.date_from) : `${fd(x.date_from)} – ${fd(x.date_to)}`;
              const sub = x.substitute_id ? emps.find((z) => z.id === x.substitute_id) : null;
              return (
                <tr key={x.id} className={mine ? "me" : undefined}>
                  {i === 0 && (
                    <td className="name" rowSpan={xs.length} title={e.name}>
                      {e.name}
                    </td>
                  )}
                  <td className={c} {...at}>
                    <span className={`dpill ${ds.cls}`}>
                      <b>{ds.code}</b>
                      {ds.name}
                    </span>
                  </td>
                  <td className={`note ${c}`} {...at}>
                    {x.note?.trim() ? <span title={x.note}>{x.note}</span> : <span className="muted">—</span>}
                  </td>
                  <td className={c} {...at}>{partTxt(x)}</td>
                  <td className={`num ${c}`} {...at}>{per}</td>
                  <td className={c} {...at}>{sub ? short(sub.name) : <span className="muted">—</span>}</td>
                  <td className={`num ${c}`} {...at}>
                    {work ? (
                      <span className="muted">pracuje z domu</span>
                    ) : fullAway(e.id, d) ? (
                      fdw(backDay(e.id))
                    ) : (
                      <span className="muted">zvyšok dňa v práci</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
