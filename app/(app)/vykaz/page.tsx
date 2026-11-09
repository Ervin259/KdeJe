import Link from "next/link";
import { requireMe, todayIso } from "@/lib/data";
import { MNC, TYPE_NAME, WD, fd } from "@/lib/calc";
import { Header } from "@/components/Header";
import { hmm } from "@/lib/attendance";
import { longInfo } from "@/lib/worktime";
import { ppLabel } from "@/lib/report";
import { loadVykaz, period, type VykazParams } from "@/lib/vykazLoad";
import type { Vykaz } from "@/lib/vykaz";
import { EmpPick, PrintBtn } from "./client";
import { loadOvertime, type OTMonth } from "@/lib/overtime";
import { saveOvertime } from "./actions";

/** dátum s rokom */
const fdy = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;
const h = (n: number) => (Math.abs(n) < 1 / 120 ? "" : hmm(n));
const sh = (n: number) => (Math.abs(n) < 1 / 120 ? "" : (n > 0 ? "+" : "") + hmm(n));

/** Nadčas za mesiac (preplatiť / náhradné voľno) a priebeh náhradného voľna. */
function OtBlock({ v, o, canDecide, back, err }: { v: Vykaz; o: OTMonth; canDecide: boolean; back: string; err: boolean }) {
  const d = o.decided;
  const changed = d && Math.abs(Number(d.pay_h) + Number(d.nv_h) - o.ot) > 0.01;
  const nvShow = o.start || o.nv || o.used || o.expired || o.balance;
  return (
    <div className="vkot">
      {(o.ot > 0 || d) && (
        <div className="vkotrow">
          <span>
            Nadčas <b>{hmm(o.ot)} h</b> → preplatiť <b>{hmm(o.pay)} h</b> · náhradné voľno <b>{hmm(o.nv)} h</b>{" "}
            <span className="muted">
              {d ? `(rozhodnuté ${fdy(String(d.decided_at ?? "").slice(0, 10) || o.month + "-01")})` : `(podľa karty – ${v.w.overtime === "nv" ? "náhradné voľno" : "preplatiť"})`}
            </span>
          </span>
          {changed && <span className="vkwarn">Nadčas sa po rozhodnutí zmenil – skontrolujte rozdelenie.</span>}
          {canDecide && (
            <form action={saveOvertime} className="vkotf">
              <input type="hidden" name="emp" value={v.emp.id} />
              <input type="hidden" name="month" value={o.month} />
              <input type="hidden" name="ot" value={o.ot} />
              <input type="hidden" name="back" value={back} />
              <label>
                do náhradného voľna{" "}
                <input name="nv" defaultValue={hmm(o.nv)} inputMode="decimal" aria-label="Hodiny do náhradného voľna" className={err ? "bad" : undefined} /> h, zvyšok
                preplatiť
              </label>
              <button className="btn">Uložiť</button>
              {d && (
                <button className="btn" name="mode" value="reset" title="Zmazať rozhodnutie – platí nastavenie z karty">
                  Podľa karty
                </button>
              )}
              {err && <span className="vkwarn">Zadajte hodiny od 0 do {hmm(o.ot)} (napr. 4:30).</span>}
            </form>
          )}
        </div>
      )}
      {nvShow ? (
        <div className="vkotrow">
          <span>
            Náhradné voľno: na začiatku <b>{hmm(o.start)} h</b> · pribudlo <b>{hmm(o.nv)} h</b> · čerpané <b>{hmm(o.used)} h</b>
            {o.expired > 0 && (
              <>
                {" "}
                · prepadlo – preplatiť <b className="minus">{hmm(o.expired)} h</b>
              </>
            )}{" "}
            · zostatok <b>{hmm(o.balance)} h</b>
            {o.balance < -0.004 && <span className="muted"> (čerpané vopred – vyrovná sa ďalším nadčasom)</span>}
          </span>
          {o.open.length > 0 && (
            <span className="muted">
              Vyčerpať: {o.open.map((x) => `${hmm(x.h)} h do ${fdy(x.deadline)}`).join(", ")}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Sheet({ v, from, to, company, o, canDecide, back, err }: { v: Vykaz; from: string; to: string; company: string; o?: OTMonth; canDecide: boolean; back: string; err: boolean }) {
  const { emp, days, sum } = v;
  const doh = emp.contract_type === "DOH";
  const absKeys = Object.keys(sum.absBy);
  return (
    <section className="vksheet">
      <header className="vkhead">
        <div>
          <h2>Výkaz dochádzky · {emp.name}</h2>
          <div className="muted">
            {company} · {ppLabel(emp.contract_type)}
            {emp.site ? ` · ${emp.site}` : ""}
            {emp.department ? ` · ${emp.department}` : ""}
          </div>
        </div>
        <div className="vkper">
          <b>
            {fdy(from)} – {fdy(to)}
          </b>
          <div className="muted">{doh ? "dohoda – časy podľa rozpisu hodín" : longInfo(v.w).join(" · ")}</div>
        </div>
      </header>

      <table className="t vktab">
        <thead>
          <tr>
            <th>Deň</th>
            <th className="c">Príchod</th>
            <th className="c">Odchod</th>
            <th className="c">Prestávka</th>
            <th className="c">Odpracované</th>
            <th>Neprítomnosť</th>
            <th className="c">Nočná</th>
            <th className="c" title="Práca v sobotu, nedeľu alebo vo sviatok">So/Ne/Sv</th>
            {!doh && <th className="c">Rozdiel</th>}
            <th>Poznámka</th>
          </tr>
        </thead>
        <tbody>
          {days.map((x) => {
            const off = !x.work;
            const abs = x.codes.filter((c) => x.absBy[c] || x.absentFull);
            return (
              <tr key={x.day} className={off ? "off" : undefined}>
                <td className="num">
                  <span className="vkwd">{WD[x.dow]}</span> {fd(x.day)}
                  {x.holiday && <span className="vkhol">sviatok</span>}
                </td>
                <td className="c num">{x.arrive ?? ""}</td>
                <td className="c num">{x.leave ?? ""}</td>
                <td className="c num">{x.break_min ? `${x.break_start ?? ""} · ${x.break_min}′` : ""}</td>
                <td className="c num">
                  <b>{h(x.worked)}</b>
                  {x.edited && <span className="vked" title="Upravená dochádzka">•</span>}
                </td>
                <td>
                  {abs.map((c) => (
                    <span key={c} className="vkab" title={TYPE_NAME[c] ?? c}>
                      {c}
                      {!x.absentFull && x.absBy[c] ? ` ${hmm(x.absBy[c])}` : ""}
                    </span>
                  ))}
                </td>
                <td className="c num">{h(x.night)}</td>
                <td className="c num">{h(x.weekend + x.holidayWork)}</td>
                {!doh && <td className={`c num ${x.diff > 0.01 ? "plus" : x.diff < -0.01 ? "minus" : ""}`}>{sh(x.diff)}</td>}
                <td className="vknote">{x.note ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Spolu</td>
            <td colSpan={3} />
            <td className="c num">
              <b>{hmm(sum.worked)}</b>
            </td>
            <td>
              {absKeys.map((k) => (
                <span key={k} className="vkab">
                  {k} {hmm(sum.absBy[k])}
                </span>
              ))}
            </td>
            <td className="c num">{h(sum.night)}</td>
            <td className="c num">{h(sum.weekend + sum.holidayWork)}</td>
            {!doh && <td className={`c num ${sum.saldo > 0.01 ? "plus" : sum.saldo < -0.01 ? "minus" : ""}`}>{sh(sum.saldo)}</td>}
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="vksum">
        {!doh && (
          <span>
            Fond <b>{hmm(sum.fond)} h</b>
          </span>
        )}
        <span>
          Odpracované <b>{hmm(sum.worked)} h</b>
        </span>
        {absKeys.length > 0 && (
          <span>
            Neprítomnosti <b>{hmm(Object.values(sum.absBy).reduce((a, b) => a + b, 0))} h</b>
          </span>
        )}
        {!doh && v.w.overtime !== "none" && !o && (
          <span>
            Nadčas <b>{hmm(sum.overtime)} h</b> <span className="muted">({v.w.overtime === "nv" ? "predvolene náhradné voľno" : "predvolene preplatiť"})</span>
          </span>
        )}
        {!doh && v.w.flexible && v.w.flex_period !== "day" && (
          <span>
            Saldo pružného času <b>{sh(sum.saldo) || "0:00"} h</b>
          </span>
        )}
        {sum.night > 0 && (
          <span>
            Nočná práca <b>{hmm(sum.night)} h</b>
          </span>
        )}
        {sum.weekend > 0 && (
          <span>
            Sobota/nedeľa <b>{hmm(sum.weekend)} h</b>
          </span>
        )}
        {sum.holidayWork > 0 && (
          <span>
            Sviatok <b>{hmm(sum.holidayWork)} h</b>
          </span>
        )}
      </div>

      {o && <OtBlock v={v} o={o} canDecide={canDecide} back={back} err={err} />}

      <div className="vksign">
        <div>Zamestnanec</div>
        <div>Vedúci / zamestnávateľ</div>
        <div>Dátum</div>
      </div>
    </section>
  );
}

export default async function VykazPage({ searchParams }: { searchParams: Promise<VykazParams & { oterr?: string }> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const { from, to, month } = period(sp, todayIso());
  const { list, allowed, lead, calc } = await loadVykaz(me, sp, from, to);
  // nadčasy a náhradné voľno – len pri celom mesiaci
  const ot = month ? await loadOvertime(calc, list.map((v) => v.emp), month) : null;
  const empParam = sp.emp === "all" ? "all" : list.length === 1 ? list[0].emp.id : sp.emp ?? "";

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ emp: empParam || undefined, ...o })) if (v) p.set(k, v);
    return `/vykaz?${p.toString()}`;
  };
  const [y, m] = (month ?? from.slice(0, 7)).split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

  const center = (
    <div className="mnav vknav">
      <Link className="btn ic" href={qs({ m: prev })} aria-label="Predchádzajúci mesiac">
        ‹
      </Link>
      <span className="vkmonth">{month ? `${MNC[m - 1]} ${y}` : `${fdy(from)} – ${fdy(to)}`}</span>
      <Link className="btn ic" href={qs({ m: next })} aria-label="Nasledujúci mesiac">
        ›
      </Link>
      <form className="vkrange" action="/vykaz">
        {empParam && <input type="hidden" name="emp" value={empParam} />}
        <input type="date" name="od" defaultValue={from} aria-label="Od" />
        <span className="muted">–</span>
        <input type="date" name="do" defaultValue={to} aria-label="Do" />
        <button className="btn">Zobraziť</button>
      </form>
    </div>
  );
  const excel = `/vykaz/export?${new URLSearchParams({ ...(empParam ? { emp: empParam } : {}), od: from, do: to }).toString()}`;
  const right = (
    <div className="row vkacts">
      {lead && <EmpPick value={empParam || ""} options={allowed.map((e) => ({ id: e.id, name: e.name }))} base={qs({ m: month ?? undefined, od: month ? undefined : from, do: month ? undefined : to })} />}
      <PrintBtn />
      <a className="btn xls" href={excel} download>
        Excel
      </a>
    </div>
  );

  return (
    <>
      <Header me={me} center={center} right={right} stack />
      <main id="view" className="vkview">
        {list.length === 0 ? (
          <div className="panel">
            <div className="box muted">V tomto období tu nie je nikto na zobrazenie.</div>
          </div>
        ) : (
          list.map((v) => (
            <Sheet
              key={v.emp.id}
              v={v}
              from={from}
              to={to}
              company={me.company_name}
              o={ot?.get(v.emp.id)?.find((x) => x.month === month)}
              canDecide={me.role === "admin" || (me.isManager && me.managed.includes(v.emp.id) && v.emp.id !== me.id)}
              back={qs({ m: month ?? undefined })}
              err={sp.oterr === v.emp.id}
            />
          ))
        )}
      </main>
    </>
  );
}
