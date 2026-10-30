import Link from "next/link";
import { requireAdmin, todayIso } from "@/lib/data";
import { buildPayroll } from "@/lib/payroll";
import { KIND, MNC, TYPE_NAME, byLastName, confirmOpen, fd, fdw, nf, typeClass } from "@/lib/calc";
import { PP_LABEL, PP_ORDER, cntTxt } from "@/lib/report";
import { Header } from "@/components/Header";
import { StatusPill } from "@/components/ui";
import { CheckDropdown } from "@/components/Dropdown";
import { confirmAll, confirmFor, rozpisAll, setMonth } from "./actions";
import { CopyButton, PayBox, RozpisButton } from "./client";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string; pp?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const year = Number(todayIso().slice(0, 4));
  const curM = Number(todayIso().slice(5, 7));
  const m = sp.m && Number(sp.m) >= 1 && Number(sp.m) <= 12 ? Number(sp.m) : curM;

  const P = await buildPayroll(year, m);
  const { calc, cols, days, wd, groups, doh, mstatus, emps, entries } = P;
  const st = mstatus(year, m);
  const canConfirm = confirmOpen(calc.today, st.last);

  // pracovné pomery, v ktorých má niekto zapnuté „V podkladoch pre mzdy“
  const avail = PP_ORDER.filter((g) => emps.some((e) => e.contract_type === g && e.active && e.in_payroll));
  const selPP = sp.pp ? sp.pp.split(",").filter((g) => avail.includes(g)) : avail;
  const show = selPP.length ? selPP : avail.slice(0, 1);

  const tpp = groups.TPP ?? [];
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
          options={avail.map((g) => ({ value: g, label: PP_LABEL[g], count: emps.filter((e) => e.contract_type === g).length }))}
          selected={show}
          allLabel="Všetci"
          label={show.map((g) => PP_LABEL[g]).join(", ")}
        />
      </div>
    </div>
  );

  const tsv = (g: string) => {
    const rows = (groups[g] ?? []).slice().sort((a, b) => byLastName(a.e, b.e));
    return [
      ["Meno", ...cols.map((k) => k.replace("Č", "C")), "SL"].join("\t"),
      ...rows.map((r) => [r.e.name, ...cols.map((k) => (r.v[k] ? nf(r.v[k]) : "")), r.sl ?? ""].join("\t")),
    ].join("\n");
  };
  const dohRows = doh.slice().sort((a, b) => byLastName(a.e, b.e));
  const dohTsv = [
    ["Meno", ...days.map((d) => Number(d.slice(8))), "SUM"].join("\t"),
    ...dohRows.map((r) => [r.e.name, ...days.map((d) => nf(r.hours[d] ?? 0)), nf(r.sum)].join("\t")),
  ].join("\n");

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
              return (
                <PayBox key={g} title={PP_LABEL[g]} count={cntTxt(rows.length)} actions={<CopyButton tsv={tsv(g)} />}>
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
                            <td className="c hcol">{r.sl !== null ? <b className="num">{r.sl}</b> : <span className="muted">–</span>}</td>
                            <td className="c okc">
                              {r.e.contract_type !== "TPP" ? (
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
                    <CopyButton tsv={dohTsv} />
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
                                const ab = x.abs > 0;
                                return (
                                  <td
                                    key={x.d}
                                    className={`${calc.isWork(x.d) ? "" : "off"}${ab ? " ab" : ""}`}
                                    title={`${fdw(x.d)}${ab ? " · neprítomnosť v kalendári" : ""}`}
                                  >
                                    {h ? nf(h) : ""}
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
                  <p className="dohleg">
                    <span className="legsw" />
                    deň, keď má dohodár v kalendári neprítomnosť
                  </p>
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
