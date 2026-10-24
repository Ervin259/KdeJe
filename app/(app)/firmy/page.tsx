import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/data";
import { Header } from "@/components/Header";
import { DecideSignup, ResendInvite } from "./ui";

type Signup = {
  id: string;
  company_name: string;
  ico: string | null;
  admin_name: string;
  admin_email: string;
  phone: string | null;
  employees_est: number | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  reject_reason: string | null;
};
type Company = {
  id: string;
  name: string;
  ico: string | null;
  status: string;
  trial_until: string | null;
  created_at: string;
  employees: number;
  admins: string | null;
};

const fd = (d: string | null) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : "");
const STATUS: Record<string, [string, string]> = {
  trial: ["Skúšobná doba", "warn"],
  active: ["Aktívna", "open"],
  suspended: ["Pozastavená", "bad"],
};

/** Superadmin: žiadosti o zriadenie služby a prehľad všetkých firiem. */
export default async function CompaniesPage() {
  const me = await requirePlatform();
  const supabase = await createClient();
  const [{ data: su }, { data: co }] = await Promise.all([
    supabase.from("company_signups").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.rpc("platform_companies"),
  ]);
  const signups = (su ?? []) as Signup[];
  const pend = signups.filter((s) => s.status === "pending").reverse();
  const done = signups.filter((s) => s.status !== "pending");
  const companies = (co ?? []) as Company[];
  const emailOf = (admins: string | null) => admins?.match(/<([^>]+)>/)?.[1] ?? null;
  const total = companies.filter((c) => c.status !== "suspended").reduce((a, c) => a + Number(c.employees), 0);

  return (
    <>
      <Header me={me} />
      <main id="view">
        <div className="panel">
          <div className="box">
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3>
                Žiadosti o zriadenie <span className={`pill ${pend.length ? "warn" : "closed"}`}>{pend.length}</span>
              </h3>
              <span className="muted" style={{ fontSize: 12 }}>
                Z formulára na kdeje.app/registracia · po schválení sa firma založí a admin dostane pozvánku
              </span>
            </div>
            <div className="reqs">
              {pend.map((s) => (
                <div className="req" key={s.id}>
                  <div className="req-who">
                    <b>{s.company_name}</b>
                    <span className="muted">poslané {fd(s.created_at.slice(0, 10))}</span>
                  </div>
                  <div className="req-what">
                    <div>
                      {s.admin_name} · <a href={`mailto:${s.admin_email}`}>{s.admin_email}</a>
                      {s.phone && <> · {s.phone}</>}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {[s.ico && `IČO ${s.ico}`, s.employees_est && `${s.employees_est} zamestnancov`].filter(Boolean).join(" · ") || "bez IČO"}
                    </div>
                    {s.note && <div className="muted req-why">„{s.note}“</div>}
                  </div>
                  <DecideSignup id={s.id} />
                </div>
              ))}
              {!pend.length && <div className="empty-note">Žiadne nové žiadosti.</div>}
            </div>
          </div>

          <div className="box">
            <div className="row spread" style={{ marginBottom: 10 }}>
              <h3>Firmy</h3>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Spolu {companies.length} firiem · {total} aktívnych zamestnancov
              </span>
            </div>
            <div className="tblwrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Stav</th>
                    <th>Zdarma do</th>
                    <th className="r">Zamestnanci</th>
                    <th className="r">Mesačne po skúške</th>
                    <th>Admin</th>
                    <th>Založená</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const [lbl, cls] = STATUS[c.status] ?? [c.status, "closed"];
                    const email = emailOf(c.admins);
                    return (
                      <tr key={c.id}>
                        <td>
                          <b>{c.name}</b>
                          {c.ico && <div className="muted" style={{ fontSize: 12 }}>IČO {c.ico}</div>}
                        </td>
                        <td>
                          <span className={`pill ${cls}`}>{lbl}</span>
                        </td>
                        <td className="num">{fd(c.trial_until)}</td>
                        <td className="r">{c.employees}</td>
                        <td className="r">{c.employees} €</td>
                        <td>
                          {c.admins ?? <span className="muted">—</span>}
                          {email && c.id !== me.company_id && <ResendInvite email={email} />}
                        </td>
                        <td className="num">{fd(c.created_at.slice(0, 10))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {done.length > 0 && (
            <div className="box">
              <h3 style={{ marginBottom: 10 }}>Vybavené žiadosti</h3>
              <div className="tblwrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Dátum</th>
                      <th>Firma</th>
                      <th>Admin</th>
                      <th>Výsledok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((s) => (
                      <tr key={s.id}>
                        <td className="num">{fd((s.decided_at ?? s.created_at).slice(0, 10))}</td>
                        <td>{s.company_name}</td>
                        <td>
                          {s.admin_name} · {s.admin_email}
                        </td>
                        <td>
                          {s.status === "approved" ? (
                            <span className="pill open">Schválená</span>
                          ) : (
                            <>
                              <span className="pill bad">Zamietnutá</span> {s.reject_reason && <span className="muted">{s.reject_reason}</span>}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
