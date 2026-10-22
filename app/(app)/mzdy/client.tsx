"use client";
import { useMemo, useState, useTransition } from "react";
import { spread, type RzDay } from "@/lib/rozpis";
import { saveHours } from "./actions";

const nf = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const WD = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
const MNC = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];
const dayWord = (n: number) => (n === 1 ? "deň" : n >= 2 && n < 5 ? "dni" : "dní");

/** Rozbaľovací box tabuľky (klik na hlavičku zbalí/rozbalí). */
export function PayBox({ title, count, actions, children }: { title: string; count: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`box paybox${open ? "" : " shut"}`}>
      <div className="row spread pthead" onClick={() => setOpen(!open)} title={open ? "Zbaliť" : "Rozbaliť"}>
        <h3>
          <span className="chev" aria-hidden="true" />
          {title} <span className="ptcnt">{count}</span>
        </h3>
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      </div>
      <div className="ptbody">{children}</div>
    </div>
  );
}

/** Export do Excelu = skopírovanie tabuľky (TSV) do schránky, vkladá sa cez Ctrl+V. */
export function CopyButton({ tsv }: { tsv: string }) {
  const [state, setState] = useState<"" | "ok" | "fail">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(tsv);
      setState("ok");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState(""), 2500);
  }
  return (
    <>
      <button className="btn xls" onClick={copy} title="Skopíruje tabuľku – v Exceli ju vložte cez Ctrl+V">
        {state === "ok" ? "Skopírované ✓" : "Export do Excelu"}
      </button>
      {state === "fail" && (
        <textarea className="copyfb" readOnly value={tsv} onFocus={(e) => e.target.select()} style={{ width: 260, height: 60 }} />
      )}
    </>
  );
}

type Def = { mode: "fixed" | "worked" | "manual"; total: number; worked: number; coef: number; max: number; week: number | null; step: number; flex: boolean };

/** Rozpis hodín dohodára do dní (modálne okno ako v prototype). */
export function RozpisButton({
  empId,
  name,
  y,
  m,
  days,
  current,
  def,
  workTxt,
}: {
  empId: string;
  name: string;
  y: number;
  m: number;
  days: (RzDay & { absCodes: string })[];
  current: Record<string, number>;
  def: Def;
  workTxt: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" style={{ height: 30, padding: "0 10px" }} onClick={() => setOpen(true)}>
        Rozpísať
      </button>
      {open && (
        <RozpisModal
          {...{ empId, name, y, m, days, current, def, workTxt }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function RozpisModal({
  empId,
  name,
  y,
  m,
  days,
  current,
  def,
  workTxt,
  onClose,
}: {
  empId: string;
  name: string;
  y: number;
  m: number;
  days: (RzDay & { absCodes: string })[];
  current: Record<string, number>;
  def: Def;
  workTxt: string;
  onClose: () => void;
}) {
  const st = def.step || 1;
  const [worked, setWorked] = useState(def.worked);
  const [coef, setCoef] = useState(def.coef);
  const [fixedTotal, setFixedTotal] = useState(def.total);
  const [max, setMax] = useState(def.max);
  const [week, setWeek] = useState<number | null>(def.week);
  const [how, setHow] = useState<"even" | "seq">("even");
  const total = def.mode === "worked" ? Math.round(worked / (coef || 1) / st) * st : fixedTotal;
  const initial = useMemo(() => {
    if (Object.keys(current).length) return { days: current, err: "", warn: "" };
    return spread({ days, total, max, week, step: st, how });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [res, setRes] = useState(initial);
  const [pending, start] = useTransition();
  const [saveErr, setSaveErr] = useState("");
  const sum = Object.values(res.days).reduce((a, h) => a + h, 0);
  const count = Object.values(res.days).filter((h) => h > 0).length;

  const run = (h = how) => setRes(spread({ days, total, max, week, step: st, how: h }));
  const field = (id: string, lbl: string, val: number | null, set: (v: number | null) => void, small = "", extra: Record<string, unknown> = {}) => (
    <div className="field">
      <label className="lbl" htmlFor={id}>
        {lbl}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={st}
        value={val ?? ""}
        onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
        {...extra}
      />
      {small && <small>{small}</small>}
    </div>
  );

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="rz-title">
        <div className="row spread">
          <h2 id="rz-title">
            Rozpis hodín · {name} · {MNC[m - 1]} {y}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ✕
          </button>
        </div>
        <div className="rzform">
          {def.mode === "worked" ? (
            <>
              {field("rz-worked", "Odpracované hodiny", worked, (v) => setWorked(v ?? 0), def.flex ? "Zadajte, koľko odpracoval(a)." : `Podľa pracovnej doby ${workTxt} bez neprítomností.`)}
              {field("rz-coef", "Koeficient", coef, (v) => setCoef(v || 1), "", { step: 0.1, min: 0.1 })}
              <div className="field">
                <span className="lbl">Na výplatu</span>
                <div className="rzcalc">
                  <b className="num">{nf(total)} h</b>
                  <span className="muted">
                    {" "}
                    = {nf(worked)} ÷ {nf(coef)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            field("rz-total", "Hodín na výplatu", fixedTotal, (v) => setFixedTotal(v ?? 0), def.mode === "fixed" ? "Pevný počet z nastavení dohody." : "")
          )}
          {field("rz-max", "Max. hodín za deň", max, (v) => setMax(v || 8), "", { min: 0.5 })}
          {field("rz-week", "Max. hodín za týždeň", week, setWeek, "", { placeholder: "bez limitu" })}
        </div>
        <div className="row spread">
          <div className="seg" role="group" aria-label="Spôsob rozpisu">
            <button type="button" aria-pressed={how !== "seq"} onClick={() => (setHow("even"), run("even"))}>
              Rovnomerne
            </button>
            <button type="button" aria-pressed={how === "seq"} onClick={() => (setHow("seq"), run("seq"))}>
              Od začiatku mesiaca
            </button>
          </div>
          <button className="btn" onClick={() => run()}>
            Rozpísať znova
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Hodiny idú najprv do pracovných dní bez neprítomnosti. Ak sa nezmestia, pridajú sa do zvyšných dní až po denný strop a až
          potom do dní s neprítomnosťou. Jednotlivé dni môžete ručne upraviť.
        </p>
        {(res.err || res.warn || saveErr) && (
          <div className="msgs">
            {res.err && <div className="e">{res.err}</div>}
            {saveErr && <div className="e">{saveErr}</div>}
            {res.warn && <div className="w">{res.warn}</div>}
          </div>
        )}
        <div className="rzgrid">
          {days.map((x) => {
            const dt = new Date(x.d + "T00:00:00Z");
            return (
              <label key={x.d} className={`rzd ${x.work ? "" : "off"}${x.abs > 0 ? " ab" : ""}`}>
                <span className="rzh">
                  {WD[dt.getUTCDay()]} {dt.getUTCDate()}.
                </span>
                {x.work ? (
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={st}
                    value={res.days[x.d] || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setRes({ ...res, days: { ...res.days, [x.d]: v } });
                    }}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
                {x.abs > 0 && (
                  <span className="rzabs" title="Neprítomnosť v kalendári">
                    {x.absCodes}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div className="row spread">
          <span>
            <b className="num">{nf(sum)} h</b>{" "}
            <span className="muted">
              v {count} {dayWord(count)}
            </span>
          </span>
          <div className="row">
            <button className="btn" onClick={onClose}>
              Zrušiť
            </button>
            <button
              className="btn primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveHours(empId, y, m, res.days);
                  if (r?.error) setSaveErr(r.error);
                  else onClose();
                })
              }
            >
              {pending ? "Ukladám…" : "Uložiť"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
