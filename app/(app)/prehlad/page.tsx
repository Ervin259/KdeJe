import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireLead } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { MNC, TYPE_NAME, balance, byLastName, monthRange, nf, typeClass } from "@/lib/calc";
import { PP_LABEL, PP_ORDER, isOn, payCols, valsIn, type Vals } from "@/lib/report";
import { Header } from "@/components/Header";
import { CheckDropdown } from "@/components/Dropdown";
import { RowLink } from "@/components/RowLink";

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

function monthsLabel(sel: string[]) {
  const idx = sel.map(Number).sort((a, b) => a - b);
  if (idx.length === 1) return MNC[idx[0] - 1];
  const run = idx.every((x, i) => !i || x === idx[i - 1] + 1);
  if (run) return `${MNC[idx[0] - 1]} – ${MNC[idx[idx.length - 1] - 1]}`;
  return idx.map((i) => MNC[i - 1]).join(", ");
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ m?: string; pp?: string }> }) {
  const me = await requireLead();
  const sp = await searchParams;
  const { calc, emps: allEmps, settings, enabled } = await loadCompany();
  // vedúci vidí len svojich ľudí
  const emps = me.role === "admin" ? allEmps : allEmps.filter((e) => me.managed.includes(e.id));
  const supabase = await createClient();
  const year = Number(calc.today.slice(0, 4));
  const cur = Number(calc.today.slice(5, 7));

  const selM = sp.m ? sp.m.split(",").filter((x) => MONTHS.includes(x)) : MONTHS;
  const selPP = sp.pp ? sp.pp.split(",").filter((x) => PP_ORDER.includes(x)) : PP_ORDER;
  const whole = selM.length === 12;
  const future = selM.every((x) => Number(x) > cur);

  const [entries, { data: vacs }] = await Promise.all([
    loadEntries(`${year}-01-01`, `${year}-12-31`),
    supabase.from("vacation_years").select("employee_id, entitlement, carry_in").eq("year", year),
  ]);
  const cols = payCols(enabled);
  const L = settings.lek_limit;

  const vals = (empId: string): Vals => {
    const v: Vals = Object.fromEntries(cols.map((k) => [k, 0]));
    for (const m of selM) {
      const r = valsIn(calc, entries, empId, cols, ...monthRange(year, Number(m)));
      for (const k of cols) v[k] += r[k];
    }
    return v;
  };

  const all = emps
    .filter((e) => e.in_stats && isOn(e, `${year}-01-01`, `${year}-12-31`))
    .sort(byLastName)
    .map((e) => {
      const vac = (vacs ?? []).find((x) => x.employee_id === e.id);
      return { e, v: vals(e.id), b: balance(calc, e.id, entries, vac, settings.carry_max) };
    });

  const center = (
    <div className="mnav">
      <span className="lbl" style={{ marginRight: 6 }}>
        Obdobie
      </span>
      <CheckDropdown
        param="m"
        options={MONTHS.map((m) => ({ value: m, label: MNC[Number(m) - 1], hint: Number(m) > cur ? "plán" : undefined }))}
        selected={selM}
        allLabel={`Celý rok ${year}`}
        label={monthsLabel(selM)}
      />
      <span className="lbl" style={{ margin: "0 6px 0 18px" }}>
        Pracovný pomer
      </span>
      <CheckDropdown
        param="pp"
        options={PP_ORDER.map((g) => ({ value: g, label: PP_LABEL[g], count: emps.filter((e) => e.contract_type === g).length }))}
        selected={selPP}
        allLabel="Všetci"
        label={selPP.map((g) => PP_LABEL[g]).join(", ")}
      />
    </div>
  );

  const cell = (k: string, n: number, over: boolean) =>
    n ? (
      <td key={k} className={`c v ${typeClass(k)}`}>
        <span className={over ? "over" : undefined} title={over ? "Prekročený ročný limit" : undefined}>
          {nf(n)}
        </span>
      </td>
    ) : (
      <td key={k} className="c">
        <span className="muted">–</span>
      </td>
    );

  return (
    <>
      <Header me={me} center={center} />
      <main id="view">
        <div className="panel">
          <div className="gridwrap">
            <table className="t yt team" title="Hodnoty v dňoch · klikni na riadok a uvidíš detail zamestnanca">
              <thead>
                <tr>
                  <th>Zamestnanec</th>
                  <th className="ppc">
                    Pracovný
                    <br />
                    pomer
                  </th>
                  <th className="ent" title={`Nárok na dovolenku v roku ${year}`}>
                    Nárok {year}
                  </th>
                  <th className="ent" title={`Prenesené z roku ${year - 1}`}>
                    Prenesené <span style={{ textTransform: "none" }}>z {year - 1}</span>
                  </th>
                  <th className="ent">Spolu</th>
                  <th className="ent" title="Zostáva z dovolenky za celý rok (spolu mínus čerpané a naplánované)">
                    Zostatok
                  </th>
                  <th
                    className="ent"
                    title={`Koľko musí ešte minimálne dočerpať, aby mu na konci roka neostalo viac ako ${settings.carry_max} dní`}
                  >
                    Dočerpať
                  </th>
                  {cols.map((k) => (
                    <th key={k} className={`c ${typeClass(k)}`} title={TYPE_NAME[k]}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PP_ORDER.filter((g) => selPP.includes(g)).flatMap((g) =>
                  all
                    .filter((r) => r.e.contract_type === g)
                    .map((r) => (
                      <RowLink key={r.e.id} href={`/prehlad/${r.e.id}`} className={`pick${future ? " fut" : ""}`}>
                        <td>
                          <Link className="namebtn" href={`/prehlad/${r.e.id}`}>
                            {r.e.name}
                          </Link>
                        </td>
                        <td className="ppc">{PP_LABEL[r.e.contract_type]}</td>
                        {r.e.contract_type === "DOH" ? (
                          [0, 1, 2, 3, 4].map((i) => (
                            <td key={i} className="ent muted">
                              —
                            </td>
                          ))
                        ) : (
                          <>
                            <td className="ent num">{nf(r.b.ent)}</td>
                            <td className="ent num">{nf(r.b.carry)}</td>
                            <td className="ent num tot">{nf(r.b.total)}</td>
                            <td
                              className="ent num tot"
                              style={r.b.left < 0 ? { color: "var(--bad)" } : undefined}
                              title={r.b.left < 0 ? "Dovolenka prečerpaná" : undefined}
                            >
                              {nf(r.b.left)}
                            </td>
                            <td className="ent num tot" style={r.b.over > 0 ? { color: "var(--bad)" } : undefined}>
                              {nf(r.b.over)}
                            </td>
                          </>
                        )}
                        {cols.map((k) =>
                          cell(k, r.v[k], whole && ((k === "PAR" && r.v[k] > L) || (k === "OČR" && r.v[k] > 7)))
                        )}
                      </RowLink>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
