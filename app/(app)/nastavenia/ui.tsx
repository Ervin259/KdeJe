"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  deleteRightsGroup,
  deleteWorkGroup,
  moveEmployee,
  saveRightsGroup,
  saveWorkGroup,
  setHideHealth,
  setVacation,
  toggleType,
  type SetState,
} from "./actions";
import { dniTxt, rgTxt, type RG } from "@/lib/rights";
export type { RG };

const ICO: Record<string, React.ReactNode> = {
  emp: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.2c2.6.1 4.3 1.7 4.8 4.8" />
    </>
  ),
  work: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  types: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  appr: <path d="M5 12.5l4 4L19 7" />,
  hol: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  gdpr: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </>
  ),
};

const KEY = "kdeje-setopen";
const readOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

/** Rozbaľovacia sekcia Nastavení; pri otvorení stránky sú všetky zbalené (stav si pamätá prehliadač). */
export function Acc({
  k,
  title,
  extra,
  forceOpen,
  children,
}: {
  k: string;
  title: string;
  extra?: React.ReactNode;
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!forceOpen);
  useEffect(() => {
    if (!forceOpen && readOpen()[k]) setOpen(true);
    const h = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("kdeje-accall", h);
    return () => window.removeEventListener("kdeje-accall", h);
  }, [k, forceOpen]);
  const toggle = () => {
    const o = !open;
    setOpen(o);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [k]: o }));
    } catch {}
  };
  return (
    <section className={`acc${open ? " open" : ""}`} id={`acc-${k}`}>
      <div className="acchead" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}>
        <span className="accico">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {ICO[k]}
          </svg>
        </span>
        <span className="acct">
          <b>{title}</b>
        </span>
        {extra && <span onClick={(e) => e.stopPropagation()}>{extra}</span>}
        <span className="chev" aria-hidden="true" />
      </div>
      {open && <div className="accbody">{children}</div>}
    </section>
  );
}

export function AccAll() {
  const [all, setAll] = useState(false);
  return (
    <button
      className="btn"
      onClick={() => {
        const o = !all;
        setAll(o);
        window.dispatchEvent(new CustomEvent("kdeje-accall", { detail: o }));
        try {
          localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(["emp", "work", "types", "appr", "hol", "gdpr"].map((x) => [x, o]))));
        } catch {}
      }}
    >
      {all ? "Zbaliť všetko" : "Rozbaliť všetko"}
    </button>
  );
}

// ---------- skupiny (pracovný čas / práva) ----------
type Member = { id: string; name: string; group: string };
type G = { id: string; name: string };

const cntTxt = (n: number) => `${n} ${n === 1 ? "zamestnanec" : n > 1 && n < 5 ? "zamestnanci" : "zamestnancov"}`;
const PEOPLE = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16 14.2c2.6.1 4.3 1.7 4.8 4.8" />
  </svg>
);
const PEN = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

function MembersDD({ g, groups, members, kind }: { g: G; groups: G[]; members: Member[]; kind: "work" | "rights" }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, []);
  const mem = members.filter((e) => e.group === g.id);
  const oth = members.filter((e) => e.group !== g.id);
  const move = (emp: string, to: string) => start(() => moveEmployee(emp, kind, to));
  return (
    <div className="ypdd gmdd" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="gmchip" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} title="Zamestnanci v skupine">
        {PEOPLE}
        <span>{cntTxt(mem.length)}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="yppanel gmpanel" role="dialog">
          <div className="gmhd">V skupine {g.name}</div>
          {mem.length ? (
            mem.map((e) => (
              <div key={e.id} className="gmrow">
                <span>{e.name}</span>
                <select value={g.id} onChange={(ev) => move(e.id, ev.target.value)} aria-label={`Presunúť ${e.name} do skupiny`}>
                  {groups.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            ))
          ) : (
            <div className="gmempty muted">Zatiaľ nikto.</div>
          )}
          {oth.length > 0 && (
            <div className="gmadd">
              <select value="" onChange={(ev) => ev.target.value && move(ev.target.value, g.id)} aria-label="Pridať zamestnanca do skupiny">
                <option value="">+ Pridať zamestnanca…</option>
                {groups
                  .filter((x) => x.id !== g.id)
                  .map((x) => {
                    const L = oth.filter((e) => e.group === x.id);
                    return L.length ? (
                      <optgroup key={x.id} label={`z ${x.name}`}>
                        {L.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
              </select>
            </div>
          )}
          <div className="gmfoot muted">Zamestnanec je vždy len v jednej skupine – výberom ho presuniete.</div>
        </div>
      )}
    </div>
  );
}

export type WG = {
  id: string;
  name: string;
  is_default: boolean;
  flexible: boolean;
  day_start: string | null;
  day_end: string | null;
  break_start: string | null;
  break_min: number;
  meal_voucher: boolean;
  sl_rule: "gte" | "gt";
  sl_min_hours: number;
  trip_no_sl_hours: number | null;
};

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const nf = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

function WorkEditor({ g, onClose }: { g: WG | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<SetState, FormData>(saveWorkGroup, {});
  const [flex, setFlex] = useState(g?.flexible ?? false);
  const [sl, setSl] = useState(g?.meal_voucher ?? false);
  const [t, setT] = useState({ s: hm(g?.day_start ?? "08:30") || "08:30", e: hm(g?.day_end ?? "17:00") || "17:00", b: Number(g?.break_min ?? 30) });
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);
  const H = Math.max(0, (toMin(t.e) - toMin(t.s) - t.b) / 60);
  return (
    <form className="grpcard ced" action={action}>
      {g && <input type="hidden" name="id" value={g.id} />}
      <div className="crow">
        <label className="cl">Názov</label>
        <input className="ci w-name" name="name" maxLength={40} defaultValue={g?.name ?? ""} placeholder="Napr. TPP skrátený" required />
      </div>
      <div className="crow">
        <span className="cl">Pracovná doba</span>
        <select className="ci" name="flexible" value={flex ? "1" : "0"} onChange={(e) => setFlex(e.target.value === "1")}>
          <option value="0">pevná</option>
          <option value="1">flexibilná</option>
        </select>
        {flex ? (
          <span className="cm">evidujú sa len hodiny</span>
        ) : (
          <>
            <span className="ct">od</span>
            <input className="ci t" type="time" step={900} name="day_start" value={t.s} onChange={(e) => setT({ ...t, s: e.target.value })} />
            <span className="ct">do</span>
            <input className="ci t" type="time" step={900} name="day_end" value={t.e} onChange={(e) => setT({ ...t, e: e.target.value })} />
            <span className="ct">· obed od</span>
            <input className="ci t" type="time" step={900} name="break_start" defaultValue={hm(g?.break_start ?? "12:30") || "12:30"} />
            <select className="ci" name="break_min" value={t.b} onChange={(e) => setT({ ...t, b: Number(e.target.value) })}>
              {[0, 15, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
            <span className="cm">= {nf(H)} h denne</span>
          </>
        )}
      </div>
      <div className="crow">
        <span className="cl">Stravné lístky</span>
        <label className="ctog">
          <input type="checkbox" name="meal_voucher" checked={sl} onChange={(e) => setSl(e.target.checked)} />
          <span>{sl ? "áno" : "nie"}</span>
        </label>
        {sl && (
          <>
            <span className="ct">za deň s odpracovanými</span>
            <select className="ci" name="sl_rule" defaultValue={g?.sl_rule ?? "gte"}>
              <option value="gte">aspoň</option>
              <option value="gt">viac ako</option>
            </select>
            <input className="ci n" type="number" min={0} max={12} step={0.5} name="sl_min_hours" defaultValue={g?.sl_min_hours ?? 4} />
            <span className="ct">h · služobná cesta od</span>
            <input className="ci n" type="number" min={0} max={24} step={0.5} name="trip_no_sl_hours" defaultValue={g?.trip_no_sl_hours ?? 5} />
            <span className="ct">h bez SL</span>
          </>
        )}
        {!sl && (
          <>
            <input type="hidden" name="sl_rule" value={g?.sl_rule ?? "gte"} />
            <input type="hidden" name="sl_min_hours" value={g?.sl_min_hours ?? 4} />
            <input type="hidden" name="trip_no_sl_hours" value={g?.trip_no_sl_hours ?? 5} />
          </>
        )}
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
      <div className="cact">
        {g && (
          <button
            className="linkdel"
            formAction={deleteWorkGroup}
            disabled={g.is_default}
            title={g.is_default ? "Predvolenú skupinu nemožno vymazať" : undefined}
            onClick={(e) => !confirm(`Vymazať skupinu „${g.name}“? Jej zamestnanci prejdú do predvolenej skupiny.`) && e.preventDefault()}
          >
            Vymazať skupinu
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={onClose}>
          Zrušiť
        </button>
        <button className="btn sm primary" disabled={pending}>
          Uložiť
        </button>
      </div>
    </form>
  );
}

export function WorkGroups({ groups, members }: { groups: WG[]; members: Member[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  const info = (g: WG) =>
    `${g.flexible ? "flexibilná" : `${hm(g.day_start)}–${hm(g.day_end)}`} · ${g.meal_voucher ? "SL" : "bez SL"}`;
  return (
    <>
      <div className="grplbl">Skupiny · {groups.length}</div>
      <div className="grplist">
        {groups.map((g) => (
          <div key={g.id} className={`grprow${open === g.id ? " open" : ""}`}>
            <div className="grprhead" data-grow={g.id} onClick={() => setOpen(open === g.id ? null : g.id)} title={open === g.id ? "Kliknutím zatvoríte" : "Kliknutím upravíte skupinu"}>
              <b>{g.name}</b>
              {g.is_default && <span className="pill closed">predvolená</span>}
              <span className="muted" style={{ fontSize: 12.5 }}>
                {info(g)}
              </span>
              <span style={{ flex: 1 }} />
              <MembersDD g={g} groups={groups} members={members} kind="work" />
              <button className="icon-edit" aria-label={`Upraviť skupinu ${g.name}`}>
                {PEN}
              </button>
            </div>
            {open === g.id && <WorkEditor g={g} onClose={close} />}
          </div>
        ))}
        {open === "new" && (
          <div className="grprow open">
            <div className="grprhead">
              <b>Nová skupina</b>
            </div>
            <WorkEditor g={null} onClose={close} />
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!!open} onClick={() => setOpen("new")}>
          + Nová skupina
        </button>
      </div>
    </>
  );
}

function RightsEditor({ r, onClose }: { r: RG | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<SetState, FormData>(saveRightsGroup, {});
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);
  const sel = (name: string, opts: [string | number, string][], cur: string | number) => (
    <select className="ci" name={name} defaultValue={String(cur)}>
      {opts.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
  return (
    <form className="grpcard ced" action={action}>
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="crow">
        <label className="cl">Názov</label>
        <input className="ci w-name" name="name" maxLength={40} defaultValue={r?.name ?? ""} placeholder="Napr. Vedúci" required />
      </div>
      <div className="crow">
        <span className="cl">Schvaľovanie</span>
        {sel("requires_approval", [[0, "bez schvaľovania"], [1, "každý zápis schvaľuje oprávnená osoba"]], r?.requires_approval ? 1 : 0)}
      </div>
      <div className="crow">
        <span className="cl">Uzávierka</span>
        {sel(
          "lock_days",
          [0, 1, 2, 3, 4, 5, 6, 7, 10, 15].map((n) => [n, n ? `${dniTxt(n)} po skončení mesiaca` : "hneď po skončení mesiaca"]),
          r?.lock_days ?? 3
        )}
      </div>
      <div className="crow">
        <span className="cl">Do uzávierky</span>
        {sel("can_edit_until_lock", [[1, "môže upravovať a mazať svoje záznamy"], [0, "zmeny len cez žiadosť"]], r?.can_edit_until_lock === false ? 0 : 1)}
      </div>
      <div className="crow">
        <span className="cl">Po uzávierke</span>
        {sel(
          "edit_days_after_lock",
          [[0, "nemôže upravovať – zmeny len cez žiadosť"], ...[1, 2, 3, 5, 7, 10, 15].map((n): [number, string] => [n, `môže upravovať ešte ${dniTxt(n)}`])],
          r?.edit_days_after_lock ?? 0
        )}
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
      <div className="cact">
        {r && (
          <button
            className="linkdel"
            formAction={deleteRightsGroup}
            disabled={r.is_default}
            onClick={(e) => !confirm(`Vymazať skupinu „${r.name}“? Jej zamestnanci prejdú do predvolenej skupiny.`) && e.preventDefault()}
          >
            Vymazať skupinu
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={onClose}>
          Zrušiť
        </button>
        <button className="btn sm primary" disabled={pending}>
          Uložiť
        </button>
      </div>
    </form>
  );
}

export function RightsGroups({ groups, members }: { groups: RG[]; members: Member[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  return (
    <>
      <div className="grplbl">Skupiny práv · {groups.length}</div>
      <div className="grplist">
        {groups.map((r) => (
          <div key={r.id} className={`grprow${open === r.id ? " open" : ""}`}>
            <div className="grprhead" data-rrow={r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <b>{r.name}</b>
              {r.is_default && <span className="pill closed">predvolená</span>}
              <span className="muted" style={{ fontSize: 12.5 }}>
                {rgTxt(r)}
              </span>
              <span style={{ flex: 1 }} />
              <MembersDD g={r} groups={groups} members={members} kind="rights" />
              <button className="icon-edit" aria-label={`Upraviť skupinu ${r.name}`}>
                {PEN}
              </button>
            </div>
            {open === r.id && <RightsEditor r={r} onClose={close} />}
          </div>
        ))}
        {open === "new" && (
          <div className="grprow open">
            <div className="grprhead">
              <b>Nová skupina práv</b>
            </div>
            <RightsEditor r={null} onClose={close} />
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!!open} onClick={() => setOpen("new")}>
          + Nová skupina práv
        </button>
      </div>
    </>
  );
}

// ---------- drobné prepínače ----------
export function TypeCard({ code, cls, name, desc, on }: { code: string; cls: string; name: string; desc: string; on: boolean }) {
  const [v, setV] = useState(on);
  const [, start] = useTransition();
  return (
    <label className={`typecard ${cls}${v ? " on" : ""}`}>
      <input
        type="checkbox"
        checked={v}
        disabled={code === "DOV"}
        onChange={(e) => {
          setV(e.target.checked);
          start(() => toggleType(code, e.target.checked));
        }}
      />
      <span className="tag">{code}</span>
      <span>
        <b>{name}</b>
        <span className="muted">{desc}</span>
      </span>
    </label>
  );
}

export function HideHealth({ on }: { on: boolean }) {
  const [v, setV] = useState(on);
  const [, start] = useTransition();
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={v}
        onChange={(e) => {
          setV(e.target.checked);
          start(() => setHideHealth(e.target.checked));
        }}
      />
      <span>
        <b>Kolegom zobrazovať PN, lekára, OČR a platené voľno len ako „MIMO“</b>
        <br />
        <span className="muted">
          Kolegovia vidia, že niekto nie je v práci, ale nie prečo. Typ vidí len daný zamestnanec a admin. Aplikácia nikde nežiada
          diagnózu.
        </span>
      </span>
    </label>
  );
}

export function VacInput({ emp, field, value, label }: { emp: string; field: "entitlement" | "carry_in"; value: number; label: string }) {
  const [v, setV] = useState(String(value));
  const [, start] = useTransition();
  return (
    <input
      type="number"
      min={0}
      max={60}
      step={field === "carry_in" ? 0.25 : 0.5}
      value={v}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v.replace(",", "."));
        if (Number.isFinite(n) && n !== value) start(() => setVacation(emp, field, n));
      }}
    />
  );
}

export function ShowHidden({ on, count }: { on: boolean; count: number }) {
  return (
    <label className="toggle" style={{ alignItems: "center" }}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          const u = new URL(window.location.href);
          if (e.target.checked) u.searchParams.set("skryti", "1");
          else u.searchParams.delete("skryti");
          u.searchParams.set("open", "emp");
          window.location.href = u.toString();
        }}
      />
      <span>Zobraziť aj skrytých ({count})</span>
    </label>
  );
}
