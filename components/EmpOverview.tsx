import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { MN, MNC, TYPE_NAME, balance, dayWord, nf, typeClass, type Entry } from "@/lib/calc";
import { monthVals, payCols } from "@/lib/report";

/**
 * Prehľad zamestnanca (vMine v prototype): karty Dovolenka / Lekár § 141 / OČR
 * a tabuľka roka po mesiacoch. Admin ho otvára z Prehľadu, zamestnanec z Môjho kalendára.
 */
export async function EmpOverview({ empId, admin }: { empId: string; admin: boolean }) {
  const { calc, emps, settings, enabled } = await loadCompany();
  const supabase = await createClient();
  const year = Number(calc.today.slice(0, 4));
  const e = emps.find((x) => x.id === empId);
  if (!e) return <div className="box">Zamestnanec sa nenašiel.</div>;

  let entries: Entry[];
  if (admin) entries = (await loadEntries(`${year}-01-01`, `${year}-12-31`)).filter((x) => x.employee_id === empId);
  else {
    const { data } = await supabase
      .from("entries")
      .select("*")
      .eq("employee_id", empId)
      .lte("date_from", `${year}-12-31`)
      .gte("date_to", `${year}-01-01`);
    entries = (data ?? []) as Entry[];
  }
  const { data: vac } = await supabase
    .from("vacation_years")
    .select("entitlement, carry_in")
    .eq("employee_id", empId)
    .eq("year", year)
    .maybeSingle();

  const b = balance(calc, empId, entries, vac ?? undefined, settings.carry_max);
  const L = settings.lek_limit;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / (b.total || 1)) * 100));
  const isDoh = e.contract_type === "DOH";
  const cols = payCols(enabled);
  const cur = Number(calc.today.slice(5, 7));

  const ocr = entries.filter((x) => x.type === "OČR");
  const oT = ocr.reduce((a, x) => a + calc.amountWhere(x, (s) => s <= calc.today), 0);
  const oP = ocr.reduce((a, x) => a + calc.amountWhere(x, (s) => s > calc.today), 0);

  let hours: Record<number, number> = {};
  if (isDoh) {
    const { data } = await supabase
      .from("contract_hours_days")
      .select("date, hours")
      .eq("employee_id", empId)
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`);
    hours = (data ?? []).reduce((a: Record<number, number>, r) => {
      const m = Number(String(r.date).slice(5, 7));
      a[m] = (a[m] ?? 0) + Number(r.hours);
      return a;
    }, {});
  }

  const rows = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, v: monthVals(calc, entries, empId, cols, year, i + 1) }));
  const tot = Object.fromEntries(cols.map((k) => [k, rows.reduce((a, r) => a + r.v[k], 0)]));
  const cell = (k: string, n: number) =>
    n ? (
      <td key={k} className={`c v ${typeClass(k)}`}>
        <span>{nf(n)}</span>
      </td>
    ) : (
      <td key={k} className="c">
        <span className="muted">–</span>
      </td>
    );

  return (
    <>
      {b.lekAll > L && (
        <div className="banner bad">
          <div>
            <b className="h">Limit na lekára je prekročený</b>
            {nf(b.lekAll)} z {L} dní v roku {year}. Čas nad limit je neplatené voľno.
          </div>
        </div>
      )}
      {!isDoh && (
        <div className="grid3 mine3">
          <div className="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="row spread">
              <h3>Dovolenka {year}</h3>
            </div>
            <div className="vstats">
              <div>
                <span className="vdot" style={{ background: "var(--dov)" }} />
                <span className="lbl">Vyčerpané</span>
                <b className="num">{nf(b.taken)}</b>
              </div>
              <div>
                <span className="vdot" style={{ background: "var(--dov)", opacity: 0.45 }} />
                <span className="lbl">Naplánované</span>
                <b className="num">{nf(b.planned)}</b>
              </div>
              <div>
                <span
                  className="vdot"
                  style={{
                    background: b.over > 0 ? "linear-gradient(90deg,var(--need) 0 50%,var(--rest) 50% 100%)" : "var(--rest)",
                  }}
                />
                <span className="lbl">Zostatok</span>
                <b className="num">{nf(Math.max(0, b.left))}</b>
              </div>
            </div>
            <div className="meter labeled" style={{ height: 20 }}>
              <i style={{ width: `${pct(b.taken)}%`, background: "var(--dov)" }} />
              <i style={{ width: `${pct(b.planned)}%`, background: "var(--dov)", opacity: 0.45 }} />
              <i className="needseg" style={{ width: `${pct(b.over)}%` }} title={`Dočerpať: ${nf(b.over)} ${dayWord(b.over)}`}>
                <span>{nf(b.over)} dočerpať</span>
              </i>
              <i
                className="carryseg"
                style={{ width: `${pct(Math.max(0, b.left - b.over))}%`, background: "var(--rest)" }}
                title={`Môže sa preniesť: ${nf(Math.max(0, b.left - b.over))} (limit ${settings.carry_max} dní)`}
              >
                <span>{b.over > 0 ? `max. ${nf(settings.carry_max)}` : nf(Math.max(0, b.left))} na prenos</span>
              </i>
            </div>
            <dl className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <dt>Nárok {year}</dt>
              <dd>{nf(b.ent)}</dd>
              <dt>Prenesené z {year - 1}</dt>
              <dd>{nf(b.carry)}</dd>
              <dt>Spolu {year}</dt>
              <dd>{nf(b.total)}</dd>
            </dl>
          </div>
          {(["PAR", "OČR"] as const).map((tp) => {
            const isP = tp === "PAR";
            const LL = isP ? L : 7;
            const t = isP ? b.lek : oT;
            const p = isP ? b.lekPlan : oP;
            const base = Math.max(LL, t + p, 1);
            const col = isP ? "var(--m-par)" : "var(--m-ocr)";
            const over = t + p > LL;
            return (
              <div key={tp} className="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="row spread">
                  <h3>{isP ? "Lekár § 141" : "OČR"}</h3>
                </div>
                <div className="vstats" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
                  <div>
                    <span className="vdot" style={{ background: col }} />
                    <span className="lbl">Čerpané</span>
                    <b className="num" style={over ? { color: "var(--bad)" } : undefined}>
                      {nf(t)}
                    </b>
                  </div>
                  <div>
                    <span className="vdot" style={{ background: col, opacity: 0.45 }} />
                    <span className="lbl">Naplánované</span>
                    <b className="num">{nf(p)}</b>
                  </div>
                </div>
                <div className="meter" style={{ height: 14 }}>
                  <i style={{ width: `${(t / base) * 100}%`, background: over ? "var(--bad)" : col }} />
                  <i style={{ width: `${(p / base) * 100}%`, background: col, opacity: 0.45 }} />
                </div>
                <dl className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <dt>Spolu za rok</dt>
                  <dd>{nf(t + p)}</dd>
                  <dt>{over ? "Prekročené o" : "Zostáva do limitu"}</dt>
                  <dd style={over ? { color: "var(--bad)" } : undefined}>{nf(Math.abs(LL - t - p))}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div className="row spread" style={{ marginBottom: 10 }}>
          <h3>Rok {year} po mesiacoch</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            hodnoty v dňoch
          </span>
        </div>
        <div className="gridwrap">
          <table className="t yt">
            <thead>
              <tr>
                <th>Mesiac</th>
                {isDoh && (
                  <th className="c hcol" title="Hodiny na výplatu podľa výkazu">
                    Hodiny
                  </th>
                )}
                {cols.map((k) => (
                  <th key={k} className={`c ${typeClass(k)}`} title={TYPE_NAME[k]}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const fut = r.m > cur;
                const label = (
                  <>
                    {MNC[r.m - 1]}
                    {fut && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {" "}
                        plán
                      </span>
                    )}
                  </>
                );
                return (
                  <tr key={r.m} className={`${fut ? "fut " : ""}${admin ? "" : "mlink"}`}>
                    <td>
                      {admin ? (
                        label
                      ) : (
                        <Link
                          href={`/kalendar?v=month&d=${year}-${String(r.m).padStart(2, "0")}-01`}
                          title={`Otvoriť ${MN[r.m - 1]} v kalendári`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {label}
                          <span className="mgo">›</span>
                        </Link>
                      )}
                    </td>
                    {isDoh && (
                      <td className="c hcol">
                        {hours[r.m] ? <b className="num">{nf(hours[r.m])}</b> : <span className="muted">–</span>}
                      </td>
                    )}
                    {cols.map((k) => cell(k, r.v[k]))}
                  </tr>
                );
              })}
              <tr className="sum">
                <td>
                  <b>Spolu</b>
                </td>
                {isDoh && (
                  <td className="c hcol">
                    <b className="num">{nf(Object.values(hours).reduce((a, h) => a + h, 0))}</b>
                  </td>
                )}
                {cols.map((k) =>
                  tot[k] ? (
                    <td key={k} className={`c ${typeClass(k)}`}>
                      <b className="sv">{nf(tot[k])}</b>
                    </td>
                  ) : (
                    <td key={k} className="c">
                      <span className="muted">–</span>
                    </td>
                  )
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
