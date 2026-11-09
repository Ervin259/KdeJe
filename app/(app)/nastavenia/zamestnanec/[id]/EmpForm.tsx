"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveEmployee, type SetState } from "../../actions";
import { ListSelect } from "@/components/ListSelect";
import { WorkTimeFields } from "@/components/WorkTimeFields";
import { effective, shortInfo, type WorkTime } from "@/lib/worktime";

export type EmpInit = {
  id: string | null;
  name: string;
  email: string;
  /** typ vzťahu (TPP, DOH, EXT… – zoznam firmy) */
  contract_type: string;
  site: string;
  department: string;
  firm: string;
  date_from: string;
  date_to: string;
  active: boolean;
  work_group_id: string;
  rights_group_id: string;
  show_in_calendar: boolean;
  /** Kalendár vidí: len seba / všetkých / vybraných */
  cal_scope: "self" | "all" | "selected";
  /** koho vidí pri „vybraných“ */
  cal_viewers: string[];
  /** vlastné nastavenie pracovného času (prázdne = podľa šablóny) */
  work_override: Partial<WorkTime>;
  in_stats: boolean;
  in_payroll: boolean;
  is_admin: boolean;
  is_manager: boolean;
  /** správca firmy, ktorý nie je jej zamestnancom */
  is_external: boolean;
  /** id ľudí, ktorých spravuje (ak je vedúci) */
  manages: string[];
  /** mená vedúcich, ktorí spravujú tohto zamestnanca */
  managedBy: string[];
  linked: boolean;
  entitlement_full: number;
  entitlement: number;
  carry_in: number;
  note: string;
  doh: { mode: string; hours: number; coef: number; max_day: number; max_week: number | null; step: number; kind: string; max_month: number | null };
};

type Opt = { id: string; name: string; info: string };
type Tpl = Opt & { wt: WorkTime };
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
  orgOpts,
}: {
  init: EmpInit;
  workGroups: Tpl[];
  rightsGroups: Opt[];
  year: number;
  balance: { total: number; used: number; left: number } | null;
  nextYear: { carry: number; ent: number; total: number } | null;
  rules: string[];
  meId: string;
  /** aktívni zamestnanci firmy (výber ľudí pre vedúceho) */
  people: { id: string; name: string; pp: string }[];
  /** zoznamy firmy: typy vzťahu, prevádzky, oddelenia */
  orgOpts: { contract: string[]; sites: string[]; depts: string[] };
}) {
  const [state, action, pending] = useActionState<SetState, FormData>(saveEmployee, {});
  const [pp, setPp] = useState(init.contract_type);
  const [site, setSite] = useState(init.site);
  const [dept, setDept] = useState(init.department);
  const [active, setActive] = useState(init.active);
  const [grp, setGrp] = useState(init.work_group_id);
  const [rg, setRg] = useState(init.rights_group_id);
  const [from, setFrom] = useState(init.date_from);
  const [full, setFull] = useState(init.entitlement_full);
  const [ent, setEnt] = useState(String(init.entitlement));
  const [lead, setLead] = useState(init.is_manager);
  const [team, setTeam] = useState(new Set(init.manages));
  const [teamQ, setTeamQ] = useState("");
  const [custom, setCustom] = useState(Object.keys(init.work_override ?? {}).length > 0);
  const [scope, setScope] = useState(init.cal_scope);
  const [seen, setSeen] = useState(new Set(init.cal_viewers));
  const [seenQ, setSeenQ] = useState("");
  const tpl = (workGroups.find((g) => g.id === grp) ?? workGroups[0]).wt;
  const wtShown = custom ? effective(tpl, init.work_group_id === grp ? init.work_override : {}) : tpl;
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
          {init.id && <span className="pill closed">{init.contract_type}</span>}
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
            <Kf
              label="Typ vzťahu"
              htmlFor="ef-pp"
              hint="TPP – pracovný pomer, DOH – dohoda (výkaz hodín, bez odsúhlasenia mesiaca). Ďalšie typy sa správajú ako TPP. Zoznam upravíte ceruzkou."
            >
              <div className="kin">
                <ListSelect kind="contract" id="ef-pp" name="contract_type" label="Typ vzťahu" value={pp} onChange={(v) => setPp(v || "TPP")} options={orgOpts.contract} locked={["TPP", "DOH"]} className="w-sm" />
                <input name="firm" type="text" maxLength={60} defaultValue={init.firm} aria-label="Firma" placeholder="Firma" />
              </div>
            </Kf>
            <Kf label="Prevádzka / oddelenie" htmlFor="ef-site" hint="Podľa nich sa dajú zamestnanci filtrovať a zoskupiť v kalendári. Zoznamy upravíte ceruzkou.">
              <div className="kin">
                <ListSelect kind="site" id="ef-site" name="site" label="Prevádzka" value={site} onChange={setSite} options={orgOpts.sites} emptyLabel="– prevádzka –" className="grow" />
                <ListSelect kind="department" name="department" label="Oddelenie" value={dept} onChange={setDept} options={orgOpts.depts} emptyLabel="– oddelenie –" className="grow" />
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
            <h3>Prístup a zobrazenie</h3>
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
            <Kf label="Kalendár vidí" htmlFor="ef-scope" hint="Koho vidí v Kalendári. Svojich ľudí vidí vedúci vždy, admin všetkých.">
              <select id="ef-scope" name="cal_scope" value={scope} onChange={(e) => setScope(e.target.value as EmpInit["cal_scope"])}>
                <option value="self">len seba</option>
                <option value="all">všetkých</option>
                <option value="selected">vybraných ľudí</option>
              </select>
            </Kf>
            {scope === "selected" && (
              <Kf label={`Vidí (${seen.size})`}>
                <div className="teambox">
                  {people.length > 8 && (
                    <input type="search" placeholder="Hľadať meno…" value={seenQ} onChange={(e) => setSeenQ(e.target.value)} className="teamq" />
                  )}
                  <div className="teamlist">
                    {people
                      .filter((x) => x.id !== init.id)
                      .map((x) => {
                        const hide = seenQ && !x.name.toLowerCase().includes(seenQ.toLowerCase()) && !seen.has(x.id);
                        return (
                          <label key={x.id} className="teamrow" style={hide ? { display: "none" } : undefined}>
                            <input
                              type="checkbox"
                              name="cal_viewers"
                              value={x.id}
                              checked={seen.has(x.id)}
                              onChange={(e) => {
                                const n = new Set(seen);
                                if (e.target.checked) n.add(x.id);
                                else n.delete(x.id);
                                setSeen(n);
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
            <Kf label="Rola" hint="Admin vidí a mení všetko. Vedúci vidí Prehľad a Schvaľovanie len pre svojich ľudí a zapisuje za nich do uzávierky.">
              <div className="kchks">
                <label className="kchk" title="Vidí admin záložky a môže meniť všetko">
                  <input type="checkbox" name="is_admin" defaultChecked={init.is_admin} disabled={init.id === meId} />
                  <span>Administrátor</span>
                </label>
                {init.id === meId && <input type="hidden" name="is_admin" value="on" />}
                <label className="kchk" title="Napr. majiteľ alebo účtovník, ktorý firmu spravuje, ale nie je jej zamestnancom. Nie je v kalendári, prehľade, mzdách ani vo fakturácii.">
                  <input type="checkbox" name="is_external" defaultChecked={init.is_external} />
                  <span>Len správca – nie je zamestnancom firmy</span>
                </label>
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
              Prístupové práva sa menia pre celú skupinu v <Link href="/nastavenia" className="linkbtn">Nastaveniach</Link>.
            </small>
          </section>
        </div>
      </div>

      <section className="box epc epwide">
        <h3>Pracovný čas</h3>
        <div className="wtsel">
          <Kf label="Šablóna" htmlFor="ef-grp" hint="Šablóny (napr. pre celé oddelenie) upravíte v Nastaveniach → Pravidlá → Pracovný čas.">
            <select id="ef-grp" name="work_group_id" value={grp} onChange={(e) => setGrp(e.target.value)}>
              {workGroups.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {shortInfo(x.wt)}
                </option>
              ))}
            </select>
          </Kf>
          <label className="kchk wtcustom" title="Hodnoty platia len pre tohto zamestnanca; zmeny šablóny sa ho týkajú len v tom, čo tu nezmeníte">
            <input type="checkbox" name="wt_custom" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
            <span>Vlastné nastavenie len pre tohto zamestnanca</span>
          </label>
        </div>
        <div className={`grpcard wtcard${custom ? "" : " ro"}`}>
          <WorkTimeFields key={`${grp}-${custom}`} g={wtShown} prefix="wt_" disabled={!custom} />
          {!custom && <div className="wtnote muted">Platí šablóna „{workGroups.find((g) => g.id === grp)?.name}“. Na zmenu len pre tohto zamestnanca zaškrtnite vlastné nastavenie.</div>}
        </div>
      </section>

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
          <Kf
            label="Druh dohody"
            htmlFor="ef-dkind"
            hint="Podľa druhu aplikácia stráži zákonný limit: pracovná činnosť najviac 10 h v každom týždni, brigádnik (študent) priemerne 20 h týždenne, vykonanie práce najviac 350 h za rok."
          >
            <select id="ef-dkind" name="dkind" defaultValue={init.doh.kind}>
              <option value="">— vyberte —</option>
              <option value="dopc">Dohoda o pracovnej činnosti (max. 10 h týždenne)</option>
              <option value="brig">Dohoda o brigádnickej práci študentov (priemer 20 h týždenne)</option>
              <option value="dovp">Dohoda o vykonaní práce (max. 350 h ročne)</option>
            </select>
          </Kf>
          <Kf
            label="Predpoklad mesačne"
            htmlFor="ef-dhours"
            hint="Predvolený počet hodín pre tlačidlo Rozpísať v Podklade pre mzdy. Prázdne = podľa pracovného času. Rozpis vždy dodrží limity dohody a nemení dni, ktoré si dohodár zapísal sám."
          >
            <div className="kin">
              <input id="ef-dhours" name="dhours" className="w-num" type="number" min={0} step={0.5} defaultValue={init.doh.hours || ""} placeholder="—" />
              <span className="muted">h · prázdne = podľa pracovného času</span>
            </div>
          </Kf>
          <Kf label="Max. hodín" htmlFor="ef-dmax">
            <div className="kin">
              <input id="ef-dmax" name="dmax" className="w-num" type="number" min={0.5} max={24} step={0.5} defaultValue={init.doh.max_day || 8} />
              <span className="muted">za deň</span>
              <input name="dweek" className="w-num" type="number" min={0} step={0.5} defaultValue={init.doh.max_week || ""} placeholder="—" aria-label="Max. hodín za týždeň" />
              <span className="muted">za týždeň</span>
              <input name="dmonth" className="w-num" type="number" min={0} step={0.5} defaultValue={init.doh.max_month || ""} placeholder="—" aria-label="Max. hodín za mesiac" />
              <span className="muted">za mesiac</span>
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
