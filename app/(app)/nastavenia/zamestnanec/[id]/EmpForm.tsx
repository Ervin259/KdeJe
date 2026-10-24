"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveEmployee, type SetState } from "../../actions";

export type EmpInit = {
  id: string | null;
  name: string;
  email: string;
  contract_type: "TPP" | "DOH" | "ZIV" | "SRO";
  firm: string;
  date_from: string;
  date_to: string;
  active: boolean;
  work_group_id: string;
  rights_group_id: string;
  show_in_calendar: boolean;
  sees_calendar: boolean;
  in_stats: boolean;
  in_payroll: boolean;
  is_admin: boolean;
  is_manager: boolean;
  /** id ľudí, ktorých spravuje (ak je vedúci) */
  manages: string[];
  /** mená vedúcich, ktorí spravujú tohto zamestnanca */
  managedBy: string[];
  linked: boolean;
  entitlement_full: number;
  entitlement: number;
  carry_in: number;
  note: string;
  doh: { mode: string; hours: number; coef: number; max_day: number; max_week: number | null; step: number };
};

type Opt = { id: string; name: string; info: string };
const PP: [string, string][] = [
  ["TPP", "TPP"],
  ["DOH", "Dohoda"],
  ["ZIV", "Živnosť"],
  ["SRO", "s.r.o."],
];
const nf = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

function Kf({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="kf">
      <div className="klw">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="kl">{label}</span>}
        {hint && (
          <span className="ii" tabIndex={0} aria-label="Info">
            i<span className="tip" role="tooltip">{hint}</span>
          </span>
        )}
      </div>
      <div className="kc">{children}</div>
    </div>
  );
}

export function EmpForm({
  init,
  workGroups,
  rightsGroups,
  year,
  balance,
  nextYear,
  rules,
  meId,
  people,
}: {
  init: EmpInit;
  workGroups: Opt[];
  rightsGroups: Opt[];
  year: number;
  balance: { total: number; used: number; left: number } | null;
  nextYear: { carry: number; ent: number; total: number } | null;
  rules: string[];
  meId: string;
  /** aktívni zamestnanci firmy (výber ľudí pre vedúceho) */
  people: { id: string; name: string; pp: string }[];
}) {
  const [state, action, pending] = useActionState<SetState, FormData>(saveEmployee, {});
  const [pp, setPp] = useState(init.contract_type);
  const [active, setActive] = useState(init.active);
  const [grp, setGrp] = useState(init.work_group_id);
  const [rg, setRg] = useState(init.rights_group_id);
  const [from, setFrom] = useState(init.date_from);
  const [full, setFull] = useState(init.entitlement_full);
  const [ent, setEnt] = useState(String(init.entitlement));
  const [lead, setLead] = useState(init.is_manager);
  const [team, setTeam] = useState(new Set(init.manages));
  const [teamQ, setTeamQ] = useState("");
  const joined = from && Number(from.slice(0, 4)) === year;

  // pomerná časť: 1/12 za každý celý kalendárny mesiac do konca roka, nahor na pol dňa
  let prop: { months: number; days: number } | null = null;
  if (joined) {
    const m = Number(from.slice(5, 7)) - 1;
    const d = Number(from.slice(8, 10));
    const months = 12 - m - (d > 1 ? 1 : 0);
    prop = { months, days: Math.ceil(((full * months) / 12) * 2) / 2 };
  }

  return (
    <form action={action} className="panel" id="empform">
      {init.id && <input type="hidden" name="id" value={init.id} />}
      <input type="hidden" name="active" value={active ? "1" : "0"} />
      <div className="monthbar">
        <div className="mnav">
          <h2>{init.id ? init.name : "Nový zamestnanec"}</h2>
          {init.id && <span className="pill closed">{PP.find((x) => x[0] === init.contract_type)?.[1]}</span>}
          {!init.active && <span className="pill bad">skrytý</span>}
        </div>
      </div>
      {state.error && (
        <div className="msgs">
          {state.error.map((e, i) => (
            <div key={i} className="e">
              {e}
            </div>
          ))}
        </div>
      )}

      <div className="epgrid">
        <div className="epcol">
          <section className="box epc">
            <h3>Základné údaje</h3>
            <Kf label="Meno" htmlFor="ef-n">
              <input id="ef-n" name="name" type="text" maxLength={60} defaultValue={init.name} placeholder="Napr. Ján Novák" required />
            </Kf>
            <Kf
              label="E-mail"
              htmlFor="ef-email"
              hint="Týmto e-mailom sa zamestnanec prihlasuje. Pozvánku mu pošlete v Supabase (Authentication → Users → Invite user)."
            >
              <div className="kin">
                <input id="ef-email" name="email" type="email" defaultValue={init.email} placeholder="meno@eurodata.sk" />
                {init.id && (
                  <span className={`pill ${init.linked ? "open" : "closed"}`} title={init.linked ? "Účet je prepojený" : "Ešte sa neprihlásil"}>
                    {init.linked ? "prihlásený" : "neprihlásený"}
                  </span>
                )}
              </div>
            </Kf>
            <Kf label="Pracovný pomer" htmlFor="ef-pp">
              <div className="kin">
                <select id="ef-pp" name="contract_type" className="w-sm" value={pp} onChange={(e) => setPp(e.target.value as EmpInit["contract_type"])}>
                  {PP.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <input name="firm" type="text" maxLength={60} defaultValue={init.firm} aria-label="Firma" placeholder="Firma" />
              </div>
            </Kf>
            <Kf label="Trvanie" htmlFor="ef-from" hint="Prázdne „do“ = na neurčito">
              <div className="kin">
                <input id="ef-from" name="date_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Pracovný pomer od" />
                <span className="muted">–</span>
                <input name="date_to" type="date" defaultValue={init.date_to} aria-label="Pracovný pomer do" />
              </div>
            </Kf>
            <Kf label="Stav" hint="Skrytý sa nikde nezobrazuje, záznamy ostávajú.">
              <div className="seg sm" role="group" aria-label="Stav">
                <button type="button" aria-pressed={active} onClick={() => setActive(true)}>
                  Aktívny
                </button>
                <button type="button" aria-pressed={!active} onClick={() => setActive(false)} disabled={init.id === meId}>
                  Skrytý
                </button>
              </div>
            </Kf>
          </section>
        </div>
        <div className="epcol">
          <section className="box epc">
            <h3>Skupiny a prístup</h3>
            <Kf label="Pracovný čas a SL" htmlFor="ef-grp" hint={workGroups.find((g) => g.id === grp)?.info}>
              <select id="ef-grp" name="work_group_id" value={grp} onChange={(e) => setGrp(e.target.value)}>
                {workGroups.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Kf>
            <Kf label="Prístupové práva" htmlFor="ef-rg" hint={rightsGroups.find((g) => g.id === rg)?.info}>
              <select id="ef-rg" name="rights_group_id" value={rg} onChange={(e) => setRg(e.target.value)}>
                {rightsGroups.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Kf>
            <Kf label="Zobrazenie">
              <div className="kchks">
                {(
                  [
                    ["show_in_calendar", "V spoločnom kalendári", "Kolegovia ho vidia v Kalendári tímu"],
                    ["sees_calendar", "Vidí spoločný kalendár", "V Kalendári vidí aj kolegov, nielen seba"],
                    ["in_stats", "V Prehľade", "Je v admin záložke Prehľad"],
                    ["in_payroll", "V podkladoch pre mzdy", "Je v Podklade pre mzdy a v exporte"],
                  ] as const
                ).map(([k, l, t]) => (
                  <label key={k} className="kchk" title={t}>
                    <input type="checkbox" name={k} defaultChecked={init[k]} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </Kf>
            <Kf label="Rola" hint="Admin vidí a mení všetko. Vedúci vidí Prehľad a Schvaľovanie len pre svojich ľudí a zapisuje za nich do uzávierky.">
              <div className="kchks">
                <label className="kchk" title="Vidí admin záložky a môže meniť všetko">
                  <input type="checkbox" name="is_admin" defaultChecked={init.is_admin} disabled={init.id === meId} />
                  <span>Administrátor</span>
                </label>
                {init.id === meId && <input type="hidden" name="is_admin" value="on" />}
                <label className="kchk" title="Spravuje vybraných zamestnancov">
                  <input type="checkbox" name="is_manager" checked={lead} onChange={(e) => setLead(e.target.checked)} />
                  <span>Vedúci</span>
                </label>
              </div>
            </Kf>
            {lead && (
              <Kf label={`Spravuje (${team.size})`} hint="Za týchto ľudí zapisuje dochádzku, vidí ich v Prehľade a vybavuje ich žiadosti.">
                <div className="teambox">
                  {people.length > 8 && (
                    <input type="search" placeholder="Hľadať meno…" value={teamQ} onChange={(e) => setTeamQ(e.target.value)} className="teamq" />
                  )}
                  <div className="teamlist">
                    {people
                      .filter((x) => x.id !== init.id)
                      .map((x) => {
                        const hide = teamQ && !x.name.toLowerCase().includes(teamQ.toLowerCase()) && !team.has(x.id);
                        return (
                          <label key={x.id} className="teamrow" style={hide ? { display: "none" } : undefined}>
                            <input
                              type="checkbox"
                              name="manages"
                              value={x.id}
                              checked={team.has(x.id)}
                              onChange={(e) => {
                                const n = new Set(team);
                                if (e.target.checked) n.add(x.id);
                                else n.delete(x.id);
                                setTeam(n);
                              }}
                            />
                            <span>{x.name}</span>
                            <span className="muted">{x.pp}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </Kf>
            )}
            <Kf label="Vedúci">
              <span className={init.managedBy.length ? "" : "muted"}>{init.managedBy.length ? init.managedBy.join(", ") : "nemá vedúceho"}</span>
            </Kf>
            <small className="muted klink">
              Časy, stravné lístky a práva sa menia pre celú skupinu v <Link href="/nastavenia" className="linkbtn">Nastaveniach</Link>.
            </small>
          </section>
        </div>
      </div>

      {pp !== "DOH" ? (
        <section className="box epc epwide">
          <h3>Dovolenka</h3>
          <div className="epsplit">
            <div className="epcolf">
              <Kf label="Plný ročný nárok" htmlFor="ef-efull" hint="20 dní, 25 dní ak v roku dovŕši 33 rokov alebo sa trvale stará o dieťa.">
                <input id="ef-efull" name="entitlement_full" className="w-num" type="number" min={0} max={60} step={0.5} value={full} onChange={(e) => setFull(Number(e.target.value))} />
                <span className="muted">dní</span>
              </Kf>
              <Kf label={`Nárok ${year}`} htmlFor="ef-ent">
                <input id="ef-ent" name="entitlement" className="w-num" type="number" min={0} max={60} step={0.5} value={ent} onChange={(e) => setEnt(e.target.value)} />
                <span className="muted">dní</span>
                {prop && (
                  <small className="propinl">
                    Nástup → pomerná časť {prop.months}/12 ={" "}
                    <button type="button" className="linkbtn" onClick={() => setEnt(String(prop!.days))}>
                      {nf(prop.days)} dní – použiť
                    </button>
                  </small>
                )}
              </Kf>
              <Kf label={joined ? "Stav pri nástupe" : `Prenos z ${year - 1}`} htmlFor="ef-carry" hint={joined ? "Zvyčajne 0." : `Počiatočný stav k 1. 1. ${year}.`}>
                <input id="ef-carry" name="carry_in" className="w-num" type="number" min={0} max={60} step={0.25} defaultValue={init.carry_in} />
                <span className="muted">dní</span>
              </Kf>
            </div>
            <div className="epcolf">
              {balance && nextYear ? (
                <table className="t yrtab">
                  <thead>
                    <tr>
                      <th>Rok</th>
                      <th className="r">Prenos</th>
                      <th className="r">Nárok</th>
                      <th className="r">Spolu</th>
                      <th className="r">Čerpané</th>
                      <th className="r">Zostatok</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <b>{year}</b>
                      </td>
                      <td className="r num">{nf(init.carry_in)}</td>
                      <td className="r num">{nf(init.entitlement)}</td>
                      <td className="r num">{nf(balance.total)}</td>
                      <td className="r num">{nf(balance.used)}</td>
                      <td className="r num">
                        <b style={balance.left < 0 ? { color: "var(--bad)" } : undefined}>{nf(balance.left)}</b>
                      </td>
                    </tr>
                    <tr className="fut">
                      <td>
                        {year + 1} <span className="muted">návrh</span>
                      </td>
                      <td className="r num">{nf(nextYear.carry)}</td>
                      <td className="r num">{nf(nextYear.ent)}</td>
                      <td className="r num">
                        <b>{nf(nextYear.total)}</b>
                      </td>
                      <td className="r muted">—</td>
                      <td className="r muted">—</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Prehľad čerpania sa zobrazí po uložení.
                </span>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="box epc epwide">
          <h3>Dohoda · výkaz hodín</h3>
          <Kf label="Hodiny na výplatu" htmlFor="ef-dmode">
            <select id="ef-dmode" name="dmode" defaultValue={init.doh.mode}>
              <option value="fixed">Pevný počet hodín mesačne</option>
              <option value="worked">Odpracované hodiny ÷ koeficient</option>
              <option value="manual">Zadám ručne každý mesiac</option>
            </select>
          </Kf>
          <Kf label="Hodín mesačne" htmlFor="ef-dhours">
            <div className="kin">
              <input id="ef-dhours" name="dhours" className="w-num" type="number" min={0} step={0.5} defaultValue={init.doh.hours || ""} />
              <span className="muted">koeficient</span>
              <input name="dcoef" className="w-num" type="number" min={0.1} step={0.1} defaultValue={init.doh.coef || 1} aria-label="Koeficient" />
            </div>
          </Kf>
          <Kf label="Max. hodín" htmlFor="ef-dmax">
            <div className="kin">
              <input id="ef-dmax" name="dmax" className="w-num" type="number" min={0.5} max={24} step={0.5} defaultValue={init.doh.max_day || 8} />
              <span className="muted">za deň</span>
              <input name="dweek" className="w-num" type="number" min={0} step={0.5} defaultValue={init.doh.max_week || ""} placeholder="—" aria-label="Max. hodín za týždeň" />
              <span className="muted">za týždeň</span>
            </div>
          </Kf>
          <Kf label="Rozpisovať po" htmlFor="ef-dstep">
            <select id="ef-dstep" name="dstep" className="w-sm" defaultValue={String(init.doh.step)}>
              <option value="1">celých hodinách</option>
              <option value="0.5">polhodinách</option>
            </select>
          </Kf>
        </section>
      )}

      <div className="epgrid epbottom">
        <section className="box epc epnote">
          <h3>
            Poznámka · špecifiká a výnimky{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
              vidí len admin
            </span>
          </h3>
          <textarea name="note" rows={4} defaultValue={init.note} placeholder="Napr. Má dohodnutú prácu 10:00–13:00, prekračuje limit, preto sa hodiny delia 2." />
        </section>
        <section className="box epc epnote">
          <h3>Ako aplikácia počíta</h3>
          <ul className="rules">
            {rules.map((r, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: r }} />
            ))}
          </ul>
        </section>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Link className="btn" href="/nastavenia?open=emp">
          Zrušiť
        </Link>
        <button className="btn primary" disabled={pending}>
          {init.id ? "Uložiť zmeny" : "Pridať zamestnanca"}
        </button>
      </div>
    </form>
  );
}
