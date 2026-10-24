import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { WD, balance, byLastName, dow, nf, typeClass } from "@/lib/calc";
import { PP_LABEL, PP_ORDER } from "@/lib/report";
import { Header } from "@/components/Header";
import { addHoliday, deleteHoliday, loadStateHolidays } from "./actions";
import { Acc, AccAll, CompanyForm, SetGroup, HideHealth, ManagerTeam, InviteAll, InviteBar, RightsGroups, ShowHidden, TypeCard, VacInput, WorkGroups, type RG, type WG } from "./ui";
import { authUsersByEmail } from "@/lib/supabase/admin";

const fdate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : "");
const PARTS_TXT: Record<string, string> = {
  full: "len celé dni",
  half: "celý deň alebo pol dňa",
  hrs: "deň, pol dňa alebo hodiny",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; open?: string; skryti?: string; flash?: string; rok?: string }>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const { calc, emps, groups, rights, types, holidays, settings } = await loadCompany();
  const supabase = await createClient();
  const year = Number(calc.today.slice(0, 4));

  const [auth, entries, { data: vacs }, { data: notes }, { data: company }, { data: assign }, { data: stateHol }] = await Promise.all([
    authUsersByEmail(),
    loadEntries(`${year}-01-01`, `${year}-12-31`),
    supabase.from("vacation_years").select("employee_id, entitlement, carry_in").eq("year", year),
    supabase.from("employee_notes").select("employee_id, note"),
    supabase.from("companies").select("name, ico, address, status, trial_until").eq("id", me.company_id).maybeSingle(),
    supabase.from("manager_assignments").select("manager_id, employee_id"),
    supabase.from("state_holidays").select("date"),
  ]);

  const act = emps.filter((e) => e.active);
  const hiddenN = emps.length - act.length;
  const showHidden = sp.skryti === "1";
  const filt = sp.f && PP_ORDER.includes(sp.f) ? sp.f : null;
  const list = emps
    .filter((e) => (showHidden || e.active) && (!filt || e.contract_type === filt))
    .sort(byLastName);
  // prihlásený admin vždy na prvom mieste, ostatní podľa pracovného pomeru
  const ordered = [
    ...list.filter((e) => e.id === me.id),
    ...PP_ORDER.flatMap((g) => list.filter((e) => e.contract_type === g && e.id !== me.id)),
  ];
  const noteOf = (id: string) => (notes ?? []).find((n) => n.employee_id === id)?.note;
  const grp = (id: string | null) => groups.find((g) => g.id === id) ?? groups.find((g) => g.is_default)!;
  const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

  const empSum = (
    <span className="empsum">
      {PP_ORDER.map((g) => [g, act.filter((e) => e.contract_type === g).length] as const)
        .filter(([, n]) => n)
        .map(([g, n]) => (
          <Link key={g} data-empf={g} href={`/nastavenia?open=emp&f=${g}`} className={filt === g ? "on" : ""} title={`Zobraziť len ${PP_LABEL[g]}`}>
            {PP_LABEL[g]} <b>{n}</b>
          </Link>
        ))}
      <Link data-empf="all" href="/nastavenia?open=emp" className={`tot${!filt ? " on" : ""}`} title="Zobraziť všetkých">
        Spolu <b>{act.length}</b>
      </Link>
    </span>
  );

  const members = (key: "work_group_id" | "rights_group_id", def: string | undefined) =>
    act.map((e) => ({ id: e.id, name: e.name, group: (e[key] as string | null) ?? def ?? "" }));

  // sviatky po rokoch: roky so sviatkami + aktuálny a nasledujúci
  const years = [...new Set([year, year + 1, ...holidays.map((h) => Number(h.date.slice(0, 4)))])].sort((a, b) => a - b);
  const stateYears = new Set((stateHol ?? []).map((h) => Number(h.date.slice(0, 4))));
  const openYear = Number(sp.rok) || year;

  // vedúci a ich ľudia
  const asg = (assign ?? []) as { manager_id: string; employee_id: string }[];
  const managers = act.filter((e) => e.is_manager).sort(byLastName);
  const admins = act.filter((e) => e.role === "admin").sort(byLastName);
  const teamOf = (id: string) => asg.filter((a) => a.manager_id === id).map((a) => a.employee_id);
  const people = [...act].sort(byLastName).map((e) => ({ id: e.id, name: e.name, pp: PP_LABEL[e.contract_type] }));
  const nameOf = (id: string) => emps.find((e) => e.id === id)?.name ?? "";
  const noLead = act.filter((e) => !asg.some((a) => a.employee_id === e.id) && e.role !== "admin");

  const STATUS: Record<string, string> = { trial: "Skúšobná doba", active: "Aktívne", suspended: "Pozastavené" };

  return (
    <>
      <Header me={me} right={<AccAll />} />
      <main id="view">
        <div className="panel setpanel">
          <SetGroup k="people" title="Ľudia" sub="Zamestnanci · Roly a prístupy" forceOpen={["emp","roles"].includes(sp.open ?? "")}>
          <Acc k="emp" title="Zamestnanci" extra={empSum} forceOpen={sp.open === "emp"}>
            <div className="row spread emptools">
              <span className="muted" style={{ fontSize: 12.5 }}>
                {auth
                  ? "Zaškrtnite zamestnancov bez prístupu a pošlite im pozvánku. Zelená fajka = už sa prihlásil."
                  : "Pozývanie z aplikácie zapnete nastavením SUPABASE_SERVICE_ROLE_KEY vo Verceli. Dovtedy pozvánky posielajte v Supabase."}
              </span>
              <div className="row">
                <InviteBar enabled={!!auth} />
                {hiddenN > 0 && <ShowHidden on={showHidden} count={hiddenN} />}
                <Link className="btn primary" href="/nastavenia/zamestnanec/novy">
                  + Pridať zamestnanca
                </Link>
              </div>
            </div>
            <div className="tblwrap">
              <table className="t emptab">
                <thead>
                  <tr>
                    <th>Meno</th>
                    <th>E-mail</th>
                    <th>Pracovný pomer</th>
                    <th>Trvanie pomeru</th>
                    <th>Pracovný čas a SL</th>
                    <th className="c">Prenos z {year - 1}</th>
                    <th className="c">Nárok {year}</th>
                    <th className="c">Zostatok</th>
                    <th className="c" title="Stav prístupu do aplikácie">
                      <span className="acchk">
                        Prístup {auth && <InviteAll />}
                      </span>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((e) => {
                    const vac = (vacs ?? []).find((v) => v.employee_id === e.id);
                    const b = balance(calc, e.id, entries, vac, settings.carry_max);
                    const g = grp(e.work_group_id);
                    const note = noteOf(e.id);
                    return (
                      <tr key={e.id} className={`${e.active ? "" : "off"}${sp.flash === e.id ? " flash" : ""}`}>
                        <td>
                          <Link className="namebtn" href={`/nastavenia/zamestnanec/${e.id}`}>
                            {e.name}
                          </Link>
                          {note && <span className="notedot" title={`Poznámka: ${note}`} aria-label="Má poznámku" />}
                          {e.role === "admin" && <span className="pill closed"> admin</span>}
                          {e.is_manager && <span className="pill lead"> vedúci</span>}
                          {!e.active && <span className="pill bad"> skrytý</span>}
                        </td>
                        <td className="email">
                          {e.email ? (
                            e.email
                          ) : (
                            <span className="pill warn" title="Bez e-mailu sa nemôže prihlásiť">
                              bez e-mailu
                            </span>
                          )}
                        </td>
                        <td>{PP_LABEL[e.contract_type]}</td>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          {!e.date_from && !e.date_to ? (
                            <span className="muted">na neurčito</span>
                          ) : (
                            `${e.date_from ? fdate(e.date_from) : "…"} – ${e.date_to ? fdate(e.date_to) : "na neurčito"}`
                          )}
                        </td>
                        <td>
                          <span className="grpn">{g.name}</span>
                          <span className="grpw">
                            {g.flexible ? "flexibilná" : `${hm(g.day_start)}–${hm(g.day_end)}`} · {g.meal_voucher ? "SL" : "bez SL"}
                          </span>
                        </td>
                        {e.contract_type === "DOH" ? (
                          <>
                            <td className="c muted">—</td>
                            <td className="c muted">—</td>
                            <td className="c muted">—</td>
                          </>
                        ) : (
                          <>
                            <td className="c">
                              <VacInput emp={e.id} field="carry_in" value={b.carry} label={`Prenos – ${e.name}`} />
                            </td>
                            <td className="c">
                              <VacInput emp={e.id} field="entitlement" value={b.ent} label={`Nárok – ${e.name}`} />
                            </td>
                            <td className="c num" style={b.left < 0 ? { color: "var(--bad)", fontWeight: 600 } : undefined}>
                              {nf(b.left)}
                            </td>
                          </>
                        )}
                        <td className="c access">
                          <Access email={e.email} info={auth} empId={e.id} active={e.active} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link className="btn" href={`/nastavenia/zamestnanec/${e.id}`} style={{ height: 30, padding: "0 10px" }}>
                            Upraviť
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Acc>

          <Acc
            k="roles"
            title="Roly a prístupy"
            forceOpen={sp.open === "roles"}
            extra={
              <span className="empsum">
                <span>
                  Admini <b>{admins.length}</b>
                </span>
                <span>
                  Vedúci <b>{managers.length}</b>
                </span>
              </span>
            }
          >
            <p className="muted sethelp">
              Admin vidí a mení všetko vo firme. Vedúci vidí Prehľad a Schvaľovanie len pre svojich ľudí a zapisuje za nich dochádzku do
              uzávierky; po uzávierke len cez žiadosť adminovi. Rolu nastavíte na karte zamestnanca.
            </p>
            <div className="tblwrap">
              <table className="t roletab">
                <thead>
                  <tr>
                    <th>Meno</th>
                    <th>Rola</th>
                    <th>Spravuje</th>
                  </tr>
                </thead>
                <tbody>
                  {[...admins, ...managers.filter((m) => m.role !== "admin")].map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link className="namebtn" href={`/nastavenia/zamestnanec/${e.id}`}>
                          {e.name}
                        </Link>
                      </td>
                      <td>
                        {e.role === "admin" && <span className="pill closed">admin</span>} {e.is_manager && <span className="pill lead">vedúci</span>}
                      </td>
                      <td>
                        {e.is_manager ? (
                          <div className="teamcell">
                            <ManagerTeam managerId={e.id} people={people} managed={teamOf(e.id)} />
                            <span className="muted teamnames">{teamOf(e.id).map(nameOf).sort().join(", ")}</span>
                          </div>
                        ) : (
                          <span className="muted">celá firma</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {managers.length > 0 && noLead.length > 0 && (
              <p className="muted sethelp" style={{ marginTop: 10 }}>
                <b>Bez vedúceho ({noLead.length}):</b> {noLead.sort(byLastName).map((e) => e.name).join(", ")}
              </p>
            )}
          </Acc>
          </SetGroup>
          <SetGroup k="rules" title="Pravidlá" sub="Pracovná doba · Typy neprítomností · Uzávierka a úpravy" forceOpen={["work","types","appr"].includes(sp.open ?? "")}>
          <Acc k="work" title="Pracovná doba">
            <WorkGroups
              groups={groups as WG[]}
              members={members("work_group_id", groups.find((g) => g.is_default)?.id)}
            />
          </Acc>

          <Acc k="types" title="Typy neprítomností">
            <div className="typegrid">
              {types.map((t) => {
                const p = t.parts.includes("hrs") ? "hrs" : t.parts.includes("half") ? "half" : "full";
                const desc = `${PARTS_TXT[p]}${t.kind === "work" ? " · počíta sa ako práca" : t.kind === "sc" ? " · služobne" : ""}${
                  t.code === "DOV" ? " · vždy zapnutá" : ""
                }`;
                return <TypeCard key={t.code} code={t.code} cls={typeClass(t.code)} name={t.name} desc={desc} on={t.enabled} />;
              })}
            </div>
          </Acc>

          <Acc k="appr" title="Uzávierka a úpravy">
            <p className="muted sethelp">Kedy sa mesiac zamkne, či zápisy schvaľuje oprávnená osoba a čo smie zamestnanec meniť po uzávierke.</p>
            <RightsGroups groups={rights as RG[]} members={members("rights_group_id", rights.find((r) => r.is_default)?.id)} />
          </Acc>
          </SetGroup>
          <SetGroup k="cal" title="Kalendár" sub="Sviatky" forceOpen={["hol"].includes(sp.open ?? "")}>
          <Acc k="hol" title="Sviatky" forceOpen={sp.open === "hol"}>
            {years.map((y) => {
              const hol = holidays.filter((h) => h.date.startsWith(`${y}-`));
              const loaded = hol.some((h) => h.is_state);
              return (
                <details key={y} className="holyear" open={y === openYear}>
                  <summary>
                    <b>{y}</b>
                    <span className="muted">
                      {hol.length ? `${hol.length} ${hol.length === 1 ? "deň" : hol.length < 5 ? "dni" : "dní"}` : "zatiaľ bez sviatkov"}
                    </span>
                  </summary>
                  {!loaded && stateYears.has(y) && (
                    <form action={loadStateHolidays} className="row holload">
                      <input type="hidden" name="year" value={y} />
                      <button className="btn primary">Načítať štátne sviatky {y}</button>
                    </form>
                  )}
                  {!loaded && !stateYears.has(y) && (
                    <p className="muted sethelp">Štátne sviatky {y} zatiaľ nie sú pripravené. Pridať ich môžete aj ručne.</p>
                  )}
                  <div className="hollist">
                    {hol.map((h) => {
                      const w = dow(h.date);
                      return (
                        <div key={h.date} className={`holrow${w === 0 || w === 6 ? " wk" : ""}`}>
                          <span className="hold num">
                            {Number(h.date.slice(8))}. {Number(h.date.slice(5, 7))}.
                          </span>
                          <span className="holw">{WD[w]}</span>
                          <span className="holn">
                            {h.name}
                            {!h.is_state && <span className="pill lead"> vlastné voľno</span>}
                          </span>
                          {h.is_state ? (
                            <span className="iconx lockd" title="Štátny sviatok sa nedá odstrániť" aria-hidden="true">
                              🔒
                            </span>
                          ) : (
                            <form action={deleteHoliday} style={{ display: "contents" }}>
                              <input type="hidden" name="date" value={h.date} />
                              <button className="iconx" title="Odstrániť" aria-label={`Odstrániť ${h.date}`}>
                                ×
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <form action={addHoliday} className="row holadd">
                    <input name="date" type="date" min={`${y}-01-01`} max={`${y}-12-31`} aria-label={`Nový voľný deň ${y}`} required />
                    <input name="name" type="text" placeholder="Názov, napr. firemné voľno" style={{ maxWidth: 240 }} />
                    <button className="btn">+ Pridať voľný deň</button>
                  </form>
                </details>
              );
            })}
            <p className="muted sethelp" style={{ marginTop: 8 }}>
              Štátne sviatky sú zamknuté. Vlastné voľné dni firmy (napr. medzi sviatkami) sa dajú pridať aj odstrániť. Sviatok cez víkend sa
              nepočíta ako voľný deň navyše.
            </p>
          </Acc>
          </SetGroup>
          <SetGroup k="firm" title="Firma" sub="Údaje o firme · Súkromie (GDPR) · Predplatné" forceOpen={["firm","gdpr","plan"].includes(sp.open ?? "")}>
          <Acc k="firm" title="Údaje o firme">
            <CompanyForm name={company?.name ?? me.company_name} ico={company?.ico ?? ""} address={company?.address ?? ""} />
          </Acc>

          <Acc k="gdpr" title="Súkromie (GDPR)">
            <HideHealth on={settings.hide_health} />
          </Acc>

          <Acc
            k="plan"
            title="Predplatné"
            extra={<span className={`pill ${company?.status === "suspended" ? "bad" : company?.status === "trial" ? "warn" : "open"}`}>{STATUS[company?.status ?? "active"]}</span>}
          >
            <div className="plangrid">
              <div>
                <span className="muted">Stav</span>
                <b>{STATUS[company?.status ?? "active"]}</b>
              </div>
              {company?.trial_until && (
                <div>
                  <span className="muted">Zdarma do</span>
                  <b>{fdate(company.trial_until)}</b>
                </div>
              )}
              <div>
                <span className="muted">Aktívni zamestnanci</span>
                <b>{act.length}</b>
              </div>
              <div>
                <span className="muted">Cena po skúšobnej dobe</span>
                <b>{act.length} € mesačne</b>
              </div>
            </div>
            <p className="muted sethelp">
              1 € za aktívneho zamestnanca mesačne, vrátane tých, ktorí sa do aplikácie neprihlasujú. Prvých 12 mesiacov od registrácie zdarma.
            </p>
          </Acc>
          </SetGroup>
        </div>
      </main>
    </>
  );
}

const fdt = (t: string) => {
  const d = new Date(t);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};

/** Stav prístupu: ✓ prihlásený · checkbox na pozvánku (s poznámkou „pozvaný“, ak už pozvánku dostal). */
function Access({
  email,
  info,
  empId,
  active,
}: {
  email: string | null;
  info: Map<string, { invited_at: string | null; last_sign_in_at: string | null }> | null;
  empId: string;
  active: boolean;
}) {
  if (!email) return <span className="muted" title="Bez e-mailu sa nemôže prihlásiť">—</span>;
  if (!info) return <span className="muted" title="Stav sa zobrazí po nastavení SUPABASE_SERVICE_ROLE_KEY">?</span>;
  const u = info.get(email.toLowerCase());
  if (u?.last_sign_in_at)
    return (
      <span className="okdot yes" title={`Aktívny – naposledy prihlásený ${fdt(u.last_sign_in_at)}`}>
        ✓
      </span>
    );
  if (!active) return <span className="muted">—</span>;
  return (
    <label className="invchk" title={u?.invited_at ? `Pozvaný ${fdt(u.invited_at)}, ešte sa neprihlásil – zaškrtnite na opätovné poslanie` : "Ešte nemá prístup – zaškrtnite a pošlite pozvánku"}>
      <input type="checkbox" name="emp" value={empId} form="inviteform" />
      {u?.invited_at && <span className="invd">pozvaný</span>}
    </label>
  );
}
