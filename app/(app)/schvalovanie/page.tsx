import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import { fd, fdw, type Entry } from "@/lib/calc";
import { Header } from "@/components/Header";
import { RecChip } from "@/components/ui";
import { DecideForm } from "./DecideForm";

type Req = {
  id: string;
  employee_id: string;
  kind: "new" | "edit" | "delete";
  payload: Entry;
  original: Entry | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  decided_at: string | null;
  reject_reason: string | null;
};

type Audit = {
  id: number;
  at: string;
  user_id: string | null;
  employee_id: string | null;
  table_name: string;
  action: string;
  after_lock: boolean;
  old_data: Entry | null;
  new_data: Entry | null;
  text: string | null;
};

function Change({ r }: { r: Req }) {
  if (r.kind === "new")
    return (
      <>
        <span className="rk add">Nový</span>
        <RecChip x={r.payload} />
      </>
    );
  if (r.kind === "delete")
    return (
      <>
        <span className="rk del">Vymazať</span>
        {r.original ? (
          <span className="strike">
            <RecChip x={r.original} />
          </span>
        ) : (
          "záznam"
        )}
      </>
    );
  return (
    <>
      <span className="rk">Zmena</span>
      {r.original && (
        <span className="strike">
          <RecChip x={r.original} />
        </span>
      )}
      <span className="arr">→</span>
      <RecChip x={r.payload} />
    </>
  );
}

const day = (ts: string) => ts.slice(0, 10);
const entryTxt = (x: Entry) =>
  `${x.type} ${x.date_from === x.date_to ? fd(x.date_from) : fd(x.date_from) + "–" + fd(x.date_to)}`;

export default async function ApprovalsPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { emps } = await loadCompany();
  const nameOf = (id: string | null) => emps.find((e) => e.id === id)?.name ?? "";
  const whoOf = (uid: string | null) => (uid ? emps.find((e) => e.user_id === uid)?.name ?? "Používateľ" : "Admin");

  const [{ data: reqs }, { data: audit }] = await Promise.all([
    supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(300),
    supabase
      .from("audit_log")
      .select("*")
      .or("after_lock.eq.true,text.not.is.null")
      .order("at", { ascending: false })
      .limit(300),
  ]);
  const all = (reqs ?? []) as Req[];
  const pend = all.filter((r) => r.status === "pending").reverse();
  const done = all.filter((r) => r.status === "approved" || r.status === "rejected");

  // História: textové záznamy + zmeny záznamov po uzávierke (bez tých, ktoré vznikli schválením žiadosti)
  const rows = (audit ?? []) as Audit[];
  const approvals = rows.filter((a) => a.action === "APPROVE");
  const history = rows
    .filter((a) => {
      if (a.text) return true;
      if (a.table_name !== "entries") return false;
      const t = Date.parse(a.at);
      return !approvals.some((x) => x.employee_id === a.employee_id && Math.abs(Date.parse(x.at) - t) < 15000);
    })
    .map((a) => {
      if (a.text) return { id: a.id, at: a.at, who: whoOf(a.user_id), txt: a.text };
      const x = (a.new_data ?? a.old_data)!;
      const verb = a.action === "INSERT" ? "pridané" : a.action === "DELETE" ? "vymazané" : "upravené";
      return { id: a.id, at: a.at, who: whoOf(a.user_id), txt: `${nameOf(a.employee_id)} · ${entryTxt(x)} ${verb} po uzávierke` };
    });

  return (
    <>
      <Header me={me} />
      <main id="view">
        <div className="panel">
          <div className="box">
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3>
                Čaká na schválenie <span className={`pill ${pend.length ? "warn" : "closed"}`}>{pend.length}</span>
              </h3>
              <span className="muted" style={{ fontSize: 12 }}>
                Žiadosti podľa skupín prístupových práv a uzamknutých záznamov
              </span>
            </div>
            <div className="reqs">
              {pend.map((r) => (
                <div className="req" key={r.id}>
                  <div className="req-who">
                    <b>{nameOf(r.employee_id)}</b>
                    <span className="muted">poslané {fdw(day(r.created_at))}</span>
                  </div>
                  <div className="req-what">
                    <div className="req-chg">
                      <Change r={r} />
                    </div>
                    <div className="muted req-why">„{r.reason}“</div>
                  </div>
                  <DecideForm id={r.id} />
                </div>
              ))}
              {!pend.length && <div className="empty-note">Žiadne čakajúce žiadosti.</div>}
            </div>
          </div>

          <div className="box">
            <h3 style={{ marginBottom: 10 }}>Vybavené žiadosti</h3>
            {done.length ? (
              <div className="tblwrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Dátum</th>
                      <th>Zamestnanec</th>
                      <th>Zmena</th>
                      <th>Dôvod</th>
                      <th>Výsledok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((r) => (
                      <tr key={r.id}>
                        <td className="num">{r.decided_at ? fd(day(r.decided_at)) : ""}</td>
                        <td>{nameOf(r.employee_id)}</td>
                        <td>
                          <div className="req-chg">
                            <Change r={r} />
                          </div>
                        </td>
                        <td className="muted">
                          {r.reason}
                          {r.reject_reason && (
                            <>
                              <br />
                              admin: {r.reject_reason}
                            </>
                          )}
                        </td>
                        <td>
                          {r.status === "approved" ? (
                            <span className="pill open">Schválená</span>
                          ) : (
                            <span className="pill bad">Zamietnutá</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-note">Zatiaľ nič.</div>
            )}
          </div>

          <div className="box">
            <h3 style={{ marginBottom: 10 }}>História úprav po uzávierke</h3>
            {history.length ? (
              <div className="tblwrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Dátum</th>
                      <th>Kto</th>
                      <th>Zmena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((a) => (
                      <tr key={a.id}>
                        <td className="num">{fd(day(a.at))}</td>
                        <td>{a.who}</td>
                        <td>{a.txt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-note">Zatiaľ nič.</div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
