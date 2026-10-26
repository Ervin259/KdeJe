import { createClient } from "@/lib/supabase/server";
import { requirePlatform, todayIso } from "@/lib/data";
import { Header } from "@/components/Header";
import { eur, fdate, loadPlatformSettings, nextInvoice, yearlyPrice, type BillingCompany, type Invoice } from "@/lib/billing";
import { DecideSignup, EnterCompany, ExemptToggle, InvoiceActions, IssueInvoices, ResendInvite, SupplierForm } from "./ui";

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
type Company = BillingCompany;

const fd = fdate;
const STATUS: Record<string, [string, string]> = {
  trial: ["Skúšobná doba", "warn"],
  active: ["Aktívna", "open"],
  suspended: ["Pozastavená", "bad"],
};

/** Superadmin: žiadosti o zriadenie služby a prehľad všetkých firiem. */
export default async function CompaniesPage() {
  const me = await requirePlatform();
  const supabase = await createClient();
  const [{ data: su }, { data: co }, { data: inv }, ps] = await Promise.all([
    supabase.from("company_signups").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.rpc("platform_companies"),
    supabase.from("invoices").select("*").order("issued_on", { ascending: false }).limit(500),
    loadPlatformSettings(),
  ]);
  const today = todayIso();
  const invoices = (inv ?? []) as Invoice[];
  const signups = (su ?? []) as Signup[];
  const pend = signups.filter((s) => s.status === "pending").reverse();
  const done = signups.filter((s) => s.status !== "pending");
  const companies = (co ?? []) as Company[];
  const emailOf = (admins: string | null) => admins?.match(/<([^>]+)>/)?.[1] ?? null;
  const total = companies.filter((c) => c.status !== "suspended").reduce((a, c) => a + Number(c.employees), 0);
  const due = await Promise.all(
    companies
      .map((c) => ({ c, n: nextInvoice(c, invoices, ps, today) }))
      .filter((x) => x.n)
      .map(async (x) => {
        let extra = 0;
        if (x.n!.prev) {
          const { data } = await supabase.rpc("billing_extra_units", {
            p_company: x.c.id,
            p_from: x.n!.prev.period_from,
            p_to: x.n!.prev.period_to,
            p_paid: x.n!.prev.billed_qty,
          });
          extra = Number(data ?? 0);
        }
        return { ...x, extra };
      })
  );
  const cname = (id: string) => companies.find((c) => c.id === id)?.name ?? "";
  const notExported = invoices.filter((i) => i.status !== "cancelled" && !i.exported_at).length;
  const supplierMissing = !ps.supplier_name || !ps.supplier_ico || !ps.iban;
  const INV: Record<string, [string, string]> = { issued: ["Vystavená", "warn"], paid: ["Uhradená", "open"], cancelled: ["Stornovaná", "closed"] };

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
                    <th>Uhradené do</th>
                    <th className="r">Zamestnanci</th>
                    <th className="r">Ročne</th>
                    <th>Fakturácia</th>
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
                          <EnterCompany id={c.id} /> <b>{c.name}</b>
                          {c.ico && <div className="muted" style={{ fontSize: 12 }}>IČO {c.ico}</div>}
                        </td>
                        <td>
                          <span className={`pill ${cls}`}>{lbl}</span>
                        </td>
                        <td className="num">{fd(c.trial_until)}</td>
                        <td className="num">{fd(c.paid_until)}</td>
                        <td className="r">{c.employees}</td>
                        <td className="r">{c.billing_exempt ? "—" : eur(yearlyPrice(Number(c.employees), ps).amount)}</td>
                        <td>
                          <ExemptToggle id={c.id} exempt={c.billing_exempt} />
                          {!c.writable && <span className="pill bad"> len čítanie</span>}
                        </td>
                        <td>
                          {c.admins ?? <span className="muted">—</span>}
                          {email && <ResendInvite email={email} />}
                        </td>
                        <td className="num">{fd(c.created_at.slice(0, 10))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="box">
            <div className="row spread" style={{ marginBottom: 10 }}>
              <h3>Fakturácia</h3>
              <div className="row" style={{ gap: 10 }}>
                {notExported > 0 && (
                  <a className="btn" href="/firmy/pohoda" download>
                    Stiahnuť XML pre Pohodu ({notExported})
                  </a>
                )}
                <IssueInvoices count={supplierMissing ? 0 : due.length} />
              </div>
            </div>
            {supplierMissing && (
              <div className="fmsg err" style={{ marginBottom: 10 }}>
                Pred prvou faktúrou vyplňte nižšie obchodné meno, IČO a IBAN dodávateľa.
              </div>
            )}
            {due.length > 0 && (
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                <b>Na fakturáciu:</b>{" "}
                {due
                  .map(
                    ({ c, n, extra }) =>
                      `${c.name} – ${n!.qty} × 12 × ${eur(ps.price_month)}${extra ? ` + doúčtovanie ${extra} × ${eur(ps.price_month)}` : ""} = ${eur(
                        n!.amount + extra * ps.price_month
                      )} (${fd(n!.from)} – ${fd(n!.to)})`
                  )
                  .join(" · ")}
              </p>
            )}
            {invoices.length ? (
              <div className="tblwrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>VS</th>
                      <th>Firma</th>
                      <th>Obdobie</th>
                      <th className="r">Počet</th>
                      <th className="r">Suma</th>
                      <th>Vystavená</th>
                      <th>Splatná</th>
                      <th>Stav</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => {
                      const [lbl, cls] = INV[i.status];
                      const late = i.status === "issued" && i.due_on < today;
                      return (
                        <tr key={i.id}>
                          <td className="num">
                            {i.vs}
                            <div>
                              <a className="linkbtn" href={`/firmy/pohoda?id=${i.id}`} download style={{ fontSize: 11.5 }}>
                                XML
                              </a>
                              {i.exported_at && <span className="muted" style={{ fontSize: 11.5 }}> · v Pohode</span>}
                            </div>
                          </td>
                          <td>{cname(i.company_id)}</td>
                          <td className="num">
                            {fd(i.period_from)} – {fd(i.period_to)}
                          </td>
                          <td className="r">
                            {i.billed_qty}
                            {i.extra_units > 0 && <div className="muted" style={{ fontSize: 11.5 }}>+ {i.extra_units} už./mes.</div>}
                          </td>
                          <td className="r">{eur(Number(i.amount))}</td>
                          <td className="num">{fd(i.issued_on)}</td>
                          <td className="num" style={late ? { color: "var(--bad)", fontWeight: 600 } : undefined}>
                            {fd(i.due_on)}
                          </td>
                          <td>
                            <span className={`pill ${late ? "bad" : cls}`}>{late ? "Po splatnosti" : lbl}</span>
                            {i.paid_on && <div className="muted" style={{ fontSize: 11.5 }}>{fd(i.paid_on)}</div>}
                          </td>
                          <td>{i.status === "issued" && <InvoiceActions id={i.id} today={today} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-note">Zatiaľ žiadne faktúry. Faktúry sa navrhnú 30 dní pred koncom skúšobnej doby.</div>
            )}
          </div>

          <div className="box">
            <h3 style={{ marginBottom: 12 }}>Dodávateľ a pravidlá fakturácie</h3>
            <SupplierForm s={ps} />
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
