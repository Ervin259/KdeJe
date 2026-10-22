import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadCompany, loadEntries } from "@/lib/loaders";
import { WD, balance, byLastName, dow, nf, typeClass } from "@/lib/calc";
import { PP_LABEL, PP_ORDER } from "@/lib/report";
import { Header } from "@/components/Header";
import { addHoliday, deleteHoliday } from "./actions";
import { Acc, AccAll, HideHealth, RightsGroups, ShowHidden, TypeCard, VacInput, WorkGroups, type RG, type WG } from "./ui";

const fdate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : "");
const PARTS_TXT: Record<string, string> = {
  full: "len celé dni",
  half: "celý deň alebo pol dňa",
  hrs: "deň, pol dňa alebo hodiny",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; open?: string; skryti?: string; flash?: string }>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const { calc, emps, groups, rights, types, holidays, settings } = await loadCompany();
  const supabase = await createClient();
  const year = Number(calc.today.slice(0, 4));

  const [entries, { data: vacs }, { data: notes }] = await Promise.all([
    loadEntries(`${year}-01-01`, `${year}-12-31`),
    supabase.from("vacation_years").select("employee_id, entitlement, carry_in").eq("year", year),
    supabase.from("employee_notes").select("employee_id, note"),
  ]);

  const act = emps.filter((e) => e.active);
  const hiddenN = emps.length - act.length;
  const showHidden = sp.skryti === "1";
  const filt = sp.f && PP_ORDER.includes(sp.f) ? sp.f : null;
  const list = emps
    .filter((e) => (showHidden || e.active) && (!filt || e.contract_type === filt))
    .sort(byLastName);
  const ordered = PP_ORDER.flatMap((g) => list.filter((e) => e.contract_type === g));
  const noteOf = (id: string) => (notes ?? []).find((n) => n.employee_id === id)?.note;
  const grp = (id: string | null) => groups.find((g) => g.id === id) ?? groups.find((g) => g.is_default)!;
  const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

  const FLAGS: [keyof (typeof emps)[number], string, string][] = [
    ["show_in_calendar", "Kalendár", "Zobraziť v spoločnom kalendári"],
    ["sees_calendar", "Vidí tím", "Vidí spoločný kalendár"],
    ["in_stats", "Prehľad", "Zobraziť v Prehľade"],
    ["in_payroll", "Mzdy", "Zobraziť v podkladoch pre mzdy"],
  ];

  const empSum = (
    <span className="empsum">
      {PP_ORDER.map((g) => [g, act.filter((e) => e.contract_type === g).length] as const)
        .filter(([, n]) => n)
        .map(([g, n]) => (
          <Link key={g} href={`/nastavenia?open=emp&f=${g}`} className={filt === g ? "on" : ""} title={`Zobraziť len ${PP_LABEL[g]}`}>
            {PP_LABEL[g]} <b>{n}</b>
          </Link>
        ))}
      <Link href="/nastavenia?open=emp" className={`tot${!filt ? " on" : ""}`} title="Zobraziť všetkých">
        Spolu <b>{act.length}</b>
      </Link>
    </span>
  );

  const members = (key: "work_group_id" | "rights_group_id", def: string | undefined) =>
    act.map((e) => ({ id: e.id, name: e.name, group: (e[key] as string | null) ?? def ?? "" }));

  const hol = holidays.filter((h) => h.date.startsWith(`${year}-`));

  return (
    <>
      <Header
        me={me}
        center={
          <div className="mnav">
            <h2>Nastavenia</h2>
          </div>
        }
        right={<AccAll />}
      />
      <main id="view">
        <div className="panel setpanel">
          <Acc k="emp" title="Zamestnanci" extra={empSum} forceOpen={sp.open === "emp"}>
            <div className="row spread emptools">
              <span className="muted" style={{ fontSize: 12.5 }}>
                Prihlásiť sa môže len zamestnanec s vyplneným e-mailom. Pozvánku pošlete v Supabase (Authentication → Users → Invite
                user).
              </span>
              <div className="row">
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
                    <th>Pracovný pomer</th>
                    <th>Trvanie pomeru</th>
                    <th>Pracovný čas a SL</th>
                    <th className="c">Prenos z {year - 1}</th>
                    <th className="c">Nárok {year}</th>
                    <th className="c">Zostatok</th>
                    <th>Zobrazenie</th>
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
                          {!e.active && <span className="pill bad"> skrytý</span>}
                          {!e.email && (
                            <span className="pill warn" title="Bez e-mailu sa nemôže prihlásiť" style={{ marginLeft: 6 }}>
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
                        <td>
                          <div className="flags">
                            {FLAGS.map(([k, l, t]) => (
                              <span key={k} className={`flag ${e[k] ? "on" : ""}`} title={`${t}: ${e[k] ? "áno" : "nie"}`}>
                                {l}
                              </span>
                            ))}
                            <span className={`flag ${g.meal_voucher ? "on" : ""}`} title={`Stravné lístky: ${g.meal_voucher ? "áno" : "nie"}`}>
                              SL
                            </span>
                          </div>
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

          <Acc k="work" title="Pracovný pomer a pracovná doba">
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

          <Acc k="appr" title="Schvaľovanie a prístupové práva">
            <RightsGroups groups={rights as RG[]} members={members("rights_group_id", rights.find((r) => r.is_default)?.id)} />
          </Acc>

          <Acc k="hol" title={`Sviatky ${year}`}>
            <div className="hollist">
              {hol.length ? (
                hol.map((h) => {
                  const w = dow(h.date);
                  return (
                    <div key={h.date} className={`holrow${w === 0 || w === 6 ? " wk" : ""}`}>
                      <span className="hold num">
                        {Number(h.date.slice(8))}. {Number(h.date.slice(5, 7))}.
                      </span>
                      <span className="holw">{WD[w]}</span>
                      <span className="holn">{h.name}</span>
                      <form action={deleteHoliday} style={{ display: "contents" }}>
                        <input type="hidden" name="date" value={h.date} />
                        <button className="iconx" title="Odstrániť" aria-label={`Odstrániť ${h.date}`}>
                          ×
                        </button>
                      </form>
                    </div>
                  );
                })
              ) : (
                <p className="muted">Žiadne sviatky.</p>
              )}
            </div>
            <form action={addHoliday} className="row holadd">
              <input name="date" type="date" min={`${year}-01-01`} max={`${year + 1}-12-31`} aria-label="Nový sviatok" required />
              <input name="name" type="text" placeholder="Názov (nepovinné)" style={{ maxWidth: 220 }} />
              <button className="btn">+ Pridať deň</button>
              <span className="muted" style={{ fontSize: 12 }}>
                Sviatok cez víkend sa nepočíta ako voľný deň navyše.
              </span>
            </form>
          </Acc>

          <Acc k="gdpr" title="Súkromie (GDPR)">
            <HideHealth on={settings.hide_health} />
          </Acc>
        </div>
      </main>
    </>
  );
}
