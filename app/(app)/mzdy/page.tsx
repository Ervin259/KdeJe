import Link from "next/link";
import { requireAdmin, todayIso } from "@/lib/data";
import { buildPayroll } from "@/lib/payroll";
import { KIND, MNC, TYPE_NAME, byLastName, confirmOpen, fd, fdw, nf, typeClass } from "@/lib/calc";
import { ppLabel, ppOrder, cntTxt } from "@/lib/report";
import { Header } from "@/components/Header";
import { StatusPill } from "@/components/ui";
import { CheckDropdown } from "@/components/Dropdown";
import { confirmAll, confirmFor, rozpisAll, setMonth } from "./actions";
import { PayBox, RozpisButton } from "./client";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string; pp?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const year = Number(todayIso().slice(0, 4));
  const curM = Number(todayIso().slice(5, 7));
  const m = sp.m && Number(sp.m) >= 1 && Number(sp.m) <= 12 ? Number(sp.m) : curM;

  const P = await buildPayroll(year, m);
  const { calc, cols, days, wd, groups, doh, mstatus, emps, entries, otCols } = P;
  const st = mstatus(year, m);
  const canConfirm = confirmOpen(calc.today, st.last);

  // typy vzťahu, v ktorých má niekto zapnuté „V podkladoch pre mzdy“
  const avail = ppOrder(emps.map((e) => e.contract_type)).filter((g) => emps.some((e) => e.contract_type === g && e.active && e.in_payroll));
  const selPP = sp.pp ? sp.pp.split(",").filter((g) => avail.includes(g)) : avail;
  const show = selPP.length ? selPP : avail.slice(0, 1);

  // odsúhlasujú všetci okrem dohodárov
  const tpp = Object.entries(groups).filter(([g]) => g !== "DOH").flatMap(([, r]) => r);
  const confN = tpp.filter((r) => r.conf).length;
  const left = tpp.length - confN;
  const hidden = (k: string, v: string | number) => <input type="hidden" name={k} value={v} />;

  const center = (
    <div className="mnav">
      <div className="seg" role="group" aria-label="Mesiac">
        {MNC.map((l, i) => (
          <Link key={i} href={`/mzdy?m=${i + 1}${sp.pp ? `&pp=${sp.pp}` : ""}`} aria-pressed={i + 1 === m}>
            {l}
          </Link>
        ))}
      </div>{" "}
      <StatusPill st={st} m={m} admin />
    </div>
  );
  const right = (
    <div className="paybar2">
      <div className="row">
        {canConfirm && (
          <>
            <span className="muted num" style={{ fontSize: 13 }}>
              Odsúhlasené {confN} z {tpp.length}
            </span>
            <form action={confirmAll}>
              {hidden("y", year)}
              {hidden("m", m)}
              <button className="btn" disabled={!left}>
                Odsúhlasiť všetkým zvyšným ({left})
              </button>
            </form>
          </>
        )}
        <form action={setMonth}>
          {hidden("y", year)}
          {hidden("m", m)}
          {hidden("mode", st.s === "closed" ? "reopen" : "close")}
          <button className="btn">{st.s === "closed" ? "Znovu otvoriť" : "Uzavrieť mesiac"}</button>
        </form>
        <CheckDropdown
          param="pp"
          options={avail.map((g) => ({ value: g, label: ppLabel(g), count: emps.filter((e) => e.contract_type === g).length }))}
          selected={show}
          allLabel="Všetci"
          label={show.map((g) => ppLabel(g)).join(", ")}
        />
      </div>
    </div>
  );

  const dohRows = doh.slice().sort((a, b) => byLastName(a.e, b.e));
  // skutočný súbor .xlsx (Podklady pre mzdy za zvolený mesiac a rok)
  const xls = (g: string) => (
    <a className="btn xls" href={`/mzdy/export?m=${m}&g=${encodeURIComponent(g)}`} download title={`Stiahne súbor Excel za ${MNC[m - 1]} ${year}`}>
      Export do Excelu
    </a>
  );

  return (
    <>
      <Header me={me} center={center} right={right} stack />
      <main id="view">
        <div className="panel">
          <h2 className="payttl">
            {MNC[m - 1]} {year} · {wd} pracovných dní
          </h2>

          {show
            .filter((g) => g !== "DOH" && (groups[g] ?? []).length)
            .map((g) => {
              const rows = groups[g].slice().sort((a, b) => byLastName(a.e, b.e));
              const oc = otCols(g);
              const hv = (n: number | undefined) => (n && Math.abs(n) > 0.004 ? <span className="num">{nf(Math.round(n * 100) / 100)}</span> : <span className="muted">–</span>);
              return (
                <PayBox key={g} title={ppLabel(g)} count={cntTxt(rows.length)} actions={xls(g)}>
                  <div className="gridwrap">
                    <table className="t yt paytab">
                      <thead>
                        <tr>
                          <th>Meno</th>
                          {cols.map((k) => (
                            <th key={k} className={`c ${typeClass(k)}`} title={TYPE_NAME[k]}>
                              {k}
                            </th>
                          ))}
                          {oc && (
                            <>
                              <th className="c otc" title="Nadčas na preplatenie v hodinách (vrátane náhradného voľna, ktoré nebolo vyčerpané do 4 mesiacov)">
                                Nadčas preplatiť h
                              </th>
                              <th className="c otc" title="Nadčas, za ktorý zamestnanec dostane náhradné voľno (hodiny)">
                                Nadčas → NV h
                              </th>
                              <th className="c otc" title="Zostatok náhradného voľna na konci mesiaca (hodiny)">
                                Zostatok NV h
                              </th>
                            </>
                          )}
                          <th className="c hcol" title="Stravné lístky">
                            SL
                          </th>
                          <th className="c okc" title="Odsúhlasenie dochádzky">
                            Odsúhlasené
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.e.id}>
                            <td>{r.e.name}</td>
                            {cols.map((t) =>
                              r.v[t] ? (
                                <td key={t} className={`c v ${typeClass(t)}`}>
                                  <span>{nf(r.v[t])}</span>
                                </td>
                              ) : (
                                <td key={t} className="c">
                                  <span className="muted">–</span>
                                </td>
                              )
                            )}
                            {oc && (
                              <>
                                <td className="c otc" title={r.ot?.expired ? `z toho prepadnuté náhradné voľno ${nf(r.ot.expired)} h` : undefined}>
                                  {hv(r.ot ? r.ot.pay + r.ot.expired : 0)}
                                </td>
                                <td className="c otc">{hv(r.ot?.nv)}</td>
                                <td className="c otc">{hv(r.ot?.balance)}</td>
                              </>
                            )}
                            <td className="c hcol">{r.sl !== null ? <b className="num">{r.sl}</b> : <span className="muted">–</span>}</td>
                            <td className="c okc">
                              {r.e.contract_type === "DOH" ? (
                                <span className="muted">–</span>
                              ) : r.conf ? (
                                <span className="okdot yes" title={`Odsúhlasené ${fd(r.conf.at)}`}>
                                  ✓
                                </span>
                              ) : canConfirm ? (
                                <form action={confirmFor} style={{ display: "inline" }}>
                                  {hidden("emp", r.e.id)}
                                  {hidden("y", year)}
                                  {hidden("m", m)}
                                  <button className="okdot btnok" title="Odsúhlasiť za zamestnanca">
                                    ✓
                                  </button>
                                </form>
                              ) : (
                                <span className="okdot wait" title="Odsúhlasiť sa dá od 3 dní pred koncom mesiaca">
                                  …
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PayBox>
              );
            })}

          {show.includes("DOH") && (
            <PayBox
              title="Dohody · výkaz hodín"
              count={cntTxt(dohRows.length)}
              actions={
                dohRows.length ? (
                  <>
                    <form action={rozpisAll}>
                      {hidden("y", year)}
                      {hidden("m", m)}
                      <button
                        className="btn"
                        title="Rozpíše hodiny tým, ktorí ich v tomto mesiaci ešte nemajú (pevný počet alebo koeficient)"
                      >
                        Rozpísať všetkým
                      </button>
                    </form>
                    {xls("DOH")}
                  </>
                ) : null
              }
            >
              {dohRows.length ? (
                <>
                  <div className="tblwrap">
                    <table className="t dohgrid">
                      <thead>
                        <tr>
                          <th className="nm">Meno</th>
                          {days.map((d) => (
                            <th key={d} className={calc.isWork(d) ? "" : "off"} title={fdw(d)}>
                              {Number(d.slice(8))}
                            </th>
                          ))}
                          <th className="sum">SUM</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {dohRows.map((r) => {
                          // všetko, čo má dohodár v ten deň v kalendári (rovnaké kódy a farby ako v kalendári)
                          const calCodes = (d: string) => [
                            ...new Set(entries.filter((x) => x.employee_id === r.e.id && x.date_from <= d && x.date_to >= d).map((x) => x.type)),
                          ];
                          const absCodes = (d: string) =>
                            entries
                              .filter((x) => x.employee_id === r.e.id && x.date_from <= d && x.date_to >= d && KIND[x.type] === "abs")
                              .map((x) => x.type)
                              .join(" ");
                          const sc = calc.sched(r.e.id);
                          const g = calc.group(r.e.id);
                          return (
                            <tr key={r.e.id}>
                              <td className="nm">
                                <b style={{ fontWeight: 500 }}>{r.e.name}</b>
                              </td>
                              {r.days.map((x) => {
                                const h = r.hours[x.d] ?? 0;
                                const codes = calCodes(x.d);
                                return (
                                  <td
                                    key={x.d}
                                    className={calc.isWork(x.d) ? undefined : "off"}
                                    title={`${fdw(x.d)}${codes.length ? " · " + codes.map((c) => TYPE_NAME[c] ?? c).join(", ") : ""}`}
                                  >
                                    {h ? <span className="dh">{nf(h)}</span> : null}
                                    {codes.map((c) => (
                                      <span key={c} className={`dab ${typeClass(c)}`}>
                                        {c}
                                      </span>
                                    ))}
                                  </td>
                                );
                              })}
                              <td className="sum">{nf(r.sum)}</td>
                              <td>
                                <RozpisButton
                                  empId={r.e.id}
                                  name={r.e.name}
                                  y={year}
                                  m={m}
                                  days={r.days.map((x) => ({ ...x, absCodes: x.abs > 0 ? absCodes(x.d) : "" }))}
                                  current={r.hours}
                                  def={r.def}
                                  workTxt={g.flexible ? "flexibilná" : `${sc.start}–${sc.end}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </>
              ) : (
                <span className="muted">Žiadni dohodári v tomto mesiaci. Pridáte ich v Nastaveniach → Zamestnanci.</span>
              )}
            </PayBox>
          )}
        </div>
      </main>
    </>
  );
}
